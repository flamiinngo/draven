use arcis::*;

/// Draven private credit scoring circuits.
///
/// Four circuits implement the MXE boundary:
///   store_borrower_profile  – re-encrypts client input under MXE-only key
///   compute_credit_score    – scores the profile, returns loan terms (never the score)
///   check_health            – returns bool liquidation flag only
///   compute_repayment       – returns remaining debt after repayment
///
/// Nothing about the credit score, health factor value, or per-borrower LTV
/// ever exits the MXE. Only loan terms, a liquidation boolean, and repayment
/// balances are returned, all as defined in Draven's privacy model.

#[encrypted]
mod circuits {
    use arcis::*;

    // All monetary values are in lamports (u64). Prices are USD * 1_000_000 (6-decimal fixed-point).
    // Percentages are basis-points (u64, 10_000 = 100%).

    /// Borrower profile encrypted by the client and stored under MXE-only key.
    /// All five fields enter the MXE and never leave in plaintext.
    pub struct BorrowerProfile {
        /// Days since wallet first transaction (on-chain age proxy).
        wallet_age_days:   u64,
        /// Cumulative number of loans repaid without default.
        past_loans_repaid: u64,
        /// Cumulative number of liquidation events on this wallet.
        past_liquidations: u64,
        /// SOL collateral deposited for this loan, in lamports.
        current_collateral: u64,
        /// Amount of USDC requested, in lamports (6-decimal).
        requested_amount:  u64,
    }

    /// Oracle price + requested amount supplied by the client when triggering compute_credit_score.
    pub struct ScoreParams {
        /// Current SOL price in USD * 1_000_000.
        oracle_sol_price: u64,
    }

    /// The only outputs of compute_credit_score. The raw score is discarded inside the MXE.
    pub struct LoanTerms {
        /// 1 if approved, 0 if rejected. Encoded as u64 for uniform ciphertext width.
        approved:           u64,
        /// 1 = Tier A (6% APR), 2 = Tier B (12% APR), 3 = Tier C (18% APR), 0 = rejected.
        rate_tier:          u64,
        /// Maximum USDC the borrower may draw, in lamports.
        max_borrow_lamports: u64,
    }

    /// Parameters for health check, provided by anyone (liquidation bot, protocol).
    pub struct HealthParams {
        /// Current SOL price in USD * 1_000_000.
        oracle_price:     u64,
        /// Current outstanding USDC debt in lamports.
        current_borrowed: u64,
        /// Accrued interest in USDC lamports since loan start.
        accrued_interest: u64,
    }

    /// Parameters for repayment computation.
    pub struct RepayParams {
        /// USDC amount being repaid, in lamports.
        amount_repaid: u64,
        /// Current SOL price in USD * 1_000_000 (used to recompute accrued interest).
        oracle_price:  u64,
    }

    /// Result of compute_repayment — encrypted back to the borrower's shared key.
    pub struct RepayResult {
        /// Outstanding USDC debt remaining after this repayment.
        remaining_debt: u64,
        /// 1 if the loan is fully repaid and collateral should be returned.
        fully_repaid:   u64,
    }

    // ─── store_borrower_profile ────────────────────────────────────────────────

    /// Re-encrypts the client-supplied BorrowerProfile under the MXE-only key.
    /// After this instruction the profile fields are accessible only to the Arcium
    /// cluster; no external party — including the borrower and any lender — can
    /// read collateral amount, age, or repayment history.
    #[instruction]
    pub fn store_borrower_profile(
        profile: Enc<Shared, BorrowerProfile>,
    ) -> Enc<Mxe, BorrowerProfile> {
        let p = profile.to_arcis();
        Mxe::get().from_arcis(p)
    }

    // ─── compute_credit_score ─────────────────────────────────────────────────

    /// Computes a weighted credit score from the stored profile and current oracle
    /// price, then maps it to discrete loan terms.
    ///
    /// The intermediate score is never included in the output — only the resulting
    /// tier, approval flag, and maximum borrow amount are returned, encrypted to
    /// the borrower's shared key.
    ///
    /// Scoring weights (all arithmetic is integer, fixed-point scaled to 1_000):
    ///   wallet_age:          25 % weight (0–100 component)
    ///   repayment history:   40 % weight (0–100 component)
    ///   liquidation penalty: −30 per past liquidation event (applied after weighting)
    ///   collateral ratio:    35 % weight (0–100 component)
    ///
    /// Tier thresholds (out of 100):
    ///   ≥ 75 → Tier A, 6 % APR, 125 % of collateral max borrow
    ///   ≥ 55 → Tier B, 12 % APR, 100 % of collateral max borrow
    ///   ≥ 30 → Tier C, 18 % APR, 75 % of collateral max borrow
    ///   < 30 → Rejected
    #[instruction]
    pub fn compute_credit_score(
        params:  Enc<Shared, ScoreParams>,
        profile: Enc<Mxe, BorrowerProfile>,
    ) -> Enc<Shared, LoanTerms> {
        let sc = params.to_arcis();
        let p  = profile.to_arcis();

        // ── wallet age component (0–100) ──────────────────────────────────────
        let age_score: u64 = if p.wallet_age_days >= 365 {
            100
        } else if p.wallet_age_days >= 180 {
            50
        } else if p.wallet_age_days >= 30 {
            20
        } else {
            0
        };

        // ── repayment history component (0–100) ───────────────────────────────
        let repay_score: u64 = if p.past_loans_repaid * 10 > 100 {
            100
        } else {
            p.past_loans_repaid * 10
        };

        // ── collateral ratio component (0–100) ────────────────────────────────
        // Collateral value in USD cents = current_collateral * oracle_sol_price / 1_000_000
        // Requested amount is in USDC lamports (6-decimal), so 1 USDC = 1_000_000 lamports
        // collateral_usd_cents = p.current_collateral * sc.oracle_sol_price / 1_000_000_000
        // requested_usd_cents  = p.requested_amount / 10_000   (lamports → cents)
        //
        // To avoid overflow and division: compute ratio_bps = collateral_value * 10_000 / requested
        let collateral_usd_lamports = p.current_collateral / 1_000_000_000 * sc.oracle_sol_price
            + (p.current_collateral % 1_000_000_000) * sc.oracle_sol_price / 1_000_000_000;
        // collateral_usd_lamports is in USDC lamports
        let ratio_bps: u64 = if p.requested_amount > 0 {
            collateral_usd_lamports * 10_000 / p.requested_amount
        } else {
            10_000
        };
        let collateral_score: u64 = if ratio_bps >= 20_000 {
            100
        } else if ratio_bps >= 10_000 {
            75
        } else if ratio_bps >= 5_000 {
            25
        } else {
            0
        };

        // ── weighted composite (integer, scaled × 100) ────────────────────────
        let weighted = age_score * 25 + repay_score * 40 + collateral_score * 35;
        // weighted is in units of (score_component × weight), max = 100 * 100 = 10_000
        let base_score = weighted / 100; // back to 0–100

        // ── liquidation penalty ───────────────────────────────────────────────
        let penalty = p.past_liquidations * 30;
        let final_score: u64 = if base_score > penalty {
            base_score - penalty
        } else {
            0
        };

        // ── tier mapping ──────────────────────────────────────────────────────
        let (approved, rate_tier, max_borrow_lamports) = if final_score >= 75 {
            // Tier A: may borrow up to 125 % of collateral USD value
            let max = collateral_usd_lamports * 12_500 / 10_000;
            (1u64, 1u64, max)
        } else if final_score >= 55 {
            // Tier B: up to 100 %
            (1u64, 2u64, collateral_usd_lamports)
        } else if final_score >= 30 {
            // Tier C: up to 75 %
            let max = collateral_usd_lamports * 7_500 / 10_000;
            (1u64, 3u64, max)
        } else {
            (0u64, 0u64, 0u64)
        };

        // The score (final_score) is intentionally not included in the output.
        params.owner.from_arcis(LoanTerms {
            approved,
            rate_tier,
            max_borrow_lamports,
        })
    }

    // ─── check_health ─────────────────────────────────────────────────────────

    /// Returns true if the borrower's position is undercollateralised and should
    /// be liquidated. The health factor value is never revealed; only the boolean
    /// crosses the MXE boundary.
    ///
    /// Liquidation condition:
    ///   collateral_value_usd < (current_borrowed + accrued_interest) * 1.05
    ///
    /// The 5 % buffer prevents dust liquidations and matches Tier C borrowers'
    /// minimum overcollateralisation for undercollateralized lending.
    #[instruction]
    pub fn check_health(
        params:  Enc<Shared, HealthParams>,
        profile: Enc<Mxe, BorrowerProfile>,
    ) -> bool {
        let hp = params.to_arcis();
        let p  = profile.to_arcis();

        // Collateral value in USDC lamports
        let collateral_value = p.current_collateral / 1_000_000_000 * hp.oracle_price
            + (p.current_collateral % 1_000_000_000) * hp.oracle_price / 1_000_000_000;

        let total_debt = hp.current_borrowed + hp.accrued_interest;

        // liquidatable when collateral_value * 10_000 < total_debt * 10_500  (< 105 % coverage)
        let lhs = collateral_value * 10_000;
        let rhs = total_debt * 10_500;

        (lhs < rhs).reveal()
    }

    // ─── compute_repayment ────────────────────────────────────────────────────

    /// Computes the remaining debt after a repayment and whether the loan is fully
    /// settled. The result is encrypted to the borrower's shared key so the
    /// remaining balance is not exposed on-chain.
    ///
    /// If amount_repaid exceeds total_debt the surplus is ignored (no overpayment
    /// refund is computed here; the on-chain program handles collateral return).
    #[instruction]
    pub fn compute_repayment(
        params:  Enc<Shared, RepayParams>,
        profile: Enc<Mxe, BorrowerProfile>,
    ) -> Enc<Shared, RepayResult> {
        let rp = params.to_arcis();
        let p  = profile.to_arcis();

        // Recompute collateral value to determine any accrued interest not yet
        // settled — oracle_price is passed so the circuit can value the position.
        // For simplicity interest is assumed already included in current_borrowed
        // (the on-chain program accumulates it before triggering compute_repayment).
        let _ = rp.oracle_price; // retained for future interest-accrual extension

        let remaining_debt: u64 = if rp.amount_repaid >= p.requested_amount {
            0
        } else {
            p.requested_amount - rp.amount_repaid
        };

        let fully_repaid: u64 = if remaining_debt == 0 { 1 } else { 0 };

        params.owner.from_arcis(RepayResult {
            remaining_debt,
            fully_repaid,
        })
    }
}

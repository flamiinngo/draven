use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

declare_id!("DrVNbP7amL2XStk6UEPvuPqCwnTxS9BLd6NchWkRpvZ");

// Computation definition offsets — deterministic from circuit names.
const COMP_DEF_OFFSET_STORE_BORROWER_PROFILE:  u32 = comp_def_offset("store_borrower_profile");
const COMP_DEF_OFFSET_COMPUTE_CREDIT_SCORE:    u32 = comp_def_offset("compute_credit_score");
const COMP_DEF_OFFSET_CHECK_HEALTH:            u32 = comp_def_offset("check_health");
const COMP_DEF_OFFSET_COMPUTE_REPAYMENT:       u32 = comp_def_offset("compute_repayment");

/// Protocol fee in basis points charged on interest income, not on principal.
const PROTOCOL_FEE_BPS: u16 = 500; // 5 %

/// Devnet USDC mint. Replace with mainnet address for production.
pub mod usdc {
    use anchor_lang::prelude::*;
    declare_id!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
}

#[arcium_program]
pub mod draven {
    use super::*;

    // ─── Pool lifecycle ───────────────────────────────────────────────────────

    /// Creates the global lending pool, USDC vault PDA, and protocol fee config.
    /// Called once after deploy. Does not reveal any borrower-specific information.
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool_state;
        pool.bump         = ctx.bumps.pool_state;
        pool.vault_bump   = ctx.bumps.vault;
        pool.total_deposits  = 0;
        pool.total_borrowed  = 0;
        pool.fee_bps         = PROTOCOL_FEE_BPS;
        Ok(())
    }

    /// Lender deposits USDC into the pool vault and records their proportional share.
    /// Reveals: deposited amount. Does not involve any borrower data.
    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        require!(amount > 0, DravenError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.lender_ata.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.lender.to_account_info(),
                },
            ),
            amount,
        )?;

        let pool   = &mut ctx.accounts.pool_state;
        let lender = &mut ctx.accounts.lender_account;

        // Share is tracked as lamports deposited. APY is distributed pro-rata on withdrawal.
        lender.bump = ctx.bumps.lender_account;
        lender.deposited_lamports = lender.deposited_lamports
            .checked_add(amount)
            .ok_or(DravenError::Overflow)?;

        pool.total_deposits = pool.total_deposits
            .checked_add(amount)
            .ok_or(DravenError::Overflow)?;

        emit!(LiquidityDepositedEvent {
            amount,
            pool_total: pool.total_deposits,
        });

        Ok(())
    }

    /// Lender withdraws their USDC share. Prevents withdrawal if it would leave
    /// the pool underfunded relative to outstanding borrows.
    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, amount: u64) -> Result<()> {
        require!(amount > 0, DravenError::ZeroAmount);

        let lender = &ctx.accounts.lender_account;
        require!(amount <= lender.deposited_lamports, DravenError::InsufficientBalance);

        let pool = &ctx.accounts.pool_state;
        let available = pool.total_deposits
            .checked_sub(pool.total_borrowed)
            .ok_or(DravenError::Overflow)?;
        require!(amount <= available, DravenError::InsufficientLiquidity);

        let pool_bump    = pool.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", &[pool_bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault.to_account_info(),
                    to:        ctx.accounts.lender_ata.to_account_info(),
                    authority: ctx.accounts.pool_state.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let pool   = &mut ctx.accounts.pool_state;
        let lender = &mut ctx.accounts.lender_account;

        lender.deposited_lamports -= amount;
        pool.total_deposits = pool.total_deposits
            .checked_sub(amount)
            .ok_or(DravenError::Overflow)?;

        Ok(())
    }

    // ─── Loan request flow ────────────────────────────────────────────────────

    /// Queues a store_borrower_profile MXE computation.
    ///
    /// The five encrypted field ciphertexts (wallet age, repayment history,
    /// liquidation count, collateral, requested amount) are provided by the client
    /// as X25519-encrypted u64 values. They enter the Arcium MXE and are
    /// re-encrypted under the MXE-only key — never decrypted on-chain.
    ///
    /// On-chain: collateral_lamports is locked from the caller's token account.
    /// This is the only plaintext amount stored; the credit-scoring inputs remain
    /// hidden. Any stale state from a previous loan is cleared here.
    pub fn request_loan(
        ctx:                  Context<RequestLoan>,
        computation_offset:   u64,
        wallet_age_ct:        [u8; 32],
        past_loans_ct:        [u8; 32],
        past_liquidations_ct: [u8; 32],
        collateral_ct:        [u8; 32],
        requested_amount_ct:  [u8; 32],
        pub_key:              [u8; 32],
        nonce:                u128,
        collateral_lamports:  u64,
    ) -> Result<()> {
        require!(collateral_lamports > 0, DravenError::ZeroAmount);
        require!(!ctx.accounts.borrower_account.is_active, DravenError::LoanAlreadyActive);

        // Deposit collateral into the vault.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.borrower_ata.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            collateral_lamports,
        )?;

        // Reset any residue from prior loan cycle before setting new state.
        let acct = &mut ctx.accounts.borrower_account;
        acct.borrower             = ctx.accounts.borrower.key();
        acct.encrypted_profile    = [[0u8; 32]; 5];
        acct.profile_nonce        = 0;
        acct.terms_ciphertexts    = [[0u8; 32]; 3];
        acct.terms_nonce          = 0;
        acct.rate_tier            = 0;
        acct.borrowed_lamports    = 0;
        acct.collateral_lamports  = collateral_lamports;
        acct.is_active            = false;
        acct.loan_ts              = 0;
        acct.bump                 = ctx.bumps.borrower_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(wallet_age_ct)
            .encrypted_u64(past_loans_ct)
            .encrypted_u64(past_liquidations_ct)
            .encrypted_u64(collateral_ct)
            .encrypted_u64(requested_amount_ct)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![StoreBorrowerProfileCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.borrower_account.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// MXE callback for store_borrower_profile.
    /// Stores the MXE-encrypted profile ciphertexts and nonce on the borrower account.
    /// These bytes are opaque on-chain; the credit scoring circuits read them from
    /// the account directly without passing through the Anchor instruction arguments.
    #[arcium_callback(encrypted_ix = "store_borrower_profile")]
    pub fn store_borrower_profile_callback(
        ctx:    Context<StoreBorrowerProfileCallback>,
        output: SignedComputationOutputs<StoreBorrowerProfileOutput>,
    ) -> Result<()> {
        let o = output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ).map_err(|e| e)?;

        let enc = match o {
            StoreBorrowerProfileOutput { field_0 } => field_0,
        };

        let acct = &mut ctx.accounts.borrower_account;
        acct.encrypted_profile = enc.ciphertexts;
        acct.profile_nonce     = enc.nonce;

        emit!(ProfileStoredEvent {
            borrower: ctx.accounts.borrower_account.key(),
        });

        Ok(())
    }

    // ─── Terms computation flow ───────────────────────────────────────────────

    /// Queues a compute_credit_score MXE computation.
    /// The ScoreParams (oracle price) are encrypted by the client and submitted
    /// alongside the account reference to the stored borrower profile.
    /// Only the borrower may call this after their profile is stored.
    pub fn apply_terms(
        ctx:               Context<ApplyTerms>,
        computation_offset: u64,
        oracle_price_ct:   [u8; 32],
        pub_key:           [u8; 32],
        params_nonce:      u128,
    ) -> Result<()> {
        let acct = &ctx.accounts.borrower_account;
        require!(acct.profile_nonce != 0,  DravenError::ProfileNotStored);
        require!(!acct.is_active,          DravenError::LoanAlreadyActive);
        require!(
            ctx.accounts.borrower.key() == acct.borrower,
            DravenError::WrongBorrower,
        );

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(params_nonce)
            .encrypted_u64(oracle_price_ct)
            // Pass the stored profile nonce and account reference so the MXE can
            // locate and decrypt the profile ciphertexts.
            .plaintext_u128(acct.profile_nonce)
            .account(
                ctx.accounts.borrower_account.key(),
                8 + 1,     // discriminator (8) + bump (1)
                32 * 5,    // 5 ciphertexts × 32 bytes
            )
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ComputeCreditScoreCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.borrower_account.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// MXE callback for compute_credit_score.
    /// The loan terms (approved, rate_tier, max_borrow) are returned encrypted to
    /// the borrower's shared key. They are stored as ciphertexts on the account
    /// and emitted in an event. The borrower's client decrypts them and calls
    /// accept_terms to complete disbursement.
    ///
    /// The credit score is discarded inside the MXE — it is not present in
    /// the ciphertexts or anywhere on-chain.
    #[arcium_callback(encrypted_ix = "compute_credit_score")]
    pub fn compute_credit_score_callback(
        ctx:    Context<ComputeCreditScoreCallback>,
        output: SignedComputationOutputs<ComputeCreditScoreOutput>,
    ) -> Result<()> {
        let o = output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ).map_err(|e| e)?;

        let enc = match o {
            ComputeCreditScoreOutput { field_0 } => field_0,
        };

        let acct = &mut ctx.accounts.borrower_account;
        acct.terms_ciphertexts = enc.ciphertexts;
        acct.terms_nonce       = enc.nonce;

        let stored_cts   = acct.terms_ciphertexts;
        let stored_nonce = acct.terms_nonce;

        emit!(TermsComputedEvent {
            borrower:           acct.key(),
            terms_ciphertexts:  stored_cts,
            result_nonce:       stored_nonce,
        });

        Ok(())
    }

    /// Called by the borrower after decrypting their loan terms.
    /// Verifies state order (terms must have been computed), disburses USDC if
    /// approved, and records rate_tier and borrowed_lamports on-chain.
    ///
    /// On-chain visibility after this instruction: rate_tier (u8), borrowed_lamports (u64).
    /// The credit score and all scoring inputs remain hidden inside the MXE.
    pub fn accept_terms(
        ctx:               Context<AcceptTerms>,
        approved:          bool,
        rate_tier:         u8,
        borrow_amount:     u64,
    ) -> Result<()> {
        let acct = &ctx.accounts.borrower_account;
        require!(acct.terms_nonce != 0,             DravenError::TermsNotComputed);
        require!(!acct.is_active,                   DravenError::LoanAlreadyActive);
        require!(rate_tier <= 3,                    DravenError::InvalidTier);
        require!(
            ctx.accounts.borrower.key() == acct.borrower,
            DravenError::WrongBorrower,
        );

        if !approved || rate_tier == 0 {
            // Loan rejected — return collateral immediately.
            let pool_bump = ctx.accounts.pool_state.bump;
            let signer_seeds: &[&[&[u8]]] = &[&[b"pool", &[pool_bump]]];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.vault.to_account_info(),
                        to:        ctx.accounts.borrower_ata.to_account_info(),
                        authority: ctx.accounts.pool_state.to_account_info(),
                    },
                    signer_seeds,
                ),
                ctx.accounts.borrower_account.collateral_lamports,
            )?;

            let acct = &mut ctx.accounts.borrower_account;
            acct.collateral_lamports = 0;
            acct.terms_nonce         = 0;

            emit!(LoanRejectedEvent { borrower: acct.key() });
            return Ok(());
        }

        let pool = &ctx.accounts.pool_state;
        let available = pool.total_deposits
            .checked_sub(pool.total_borrowed)
            .ok_or(DravenError::Overflow)?;
        require!(borrow_amount > 0,              DravenError::ZeroAmount);
        require!(borrow_amount <= available,     DravenError::InsufficientLiquidity);

        // Disburse USDC from vault to borrower.
        let pool_bump = pool.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", &[pool_bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault.to_account_info(),
                    to:        ctx.accounts.borrower_ata.to_account_info(),
                    authority: ctx.accounts.pool_state.to_account_info(),
                },
                signer_seeds,
            ),
            borrow_amount,
        )?;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_borrowed = pool.total_borrowed
            .checked_add(borrow_amount)
            .ok_or(DravenError::Overflow)?;

        let clock = Clock::get()?;
        let acct  = &mut ctx.accounts.borrower_account;
        acct.rate_tier         = rate_tier;
        acct.borrowed_lamports = borrow_amount;
        acct.is_active         = true;
        acct.loan_ts           = clock.unix_timestamp;

        emit!(LoanDisbursedEvent {
            borrower:          acct.key(),
            rate_tier,
            borrowed_lamports: borrow_amount,
        });

        Ok(())
    }

    // ─── Repayment flow ───────────────────────────────────────────────────────

    /// Queues a compute_repayment MXE computation.
    /// The repayment amount and oracle price are encrypted by the borrower.
    /// Only the borrower may call this on their active loan.
    pub fn repay(
        ctx:               Context<Repay>,
        computation_offset: u64,
        amount_repaid_ct:  [u8; 32],
        oracle_price_ct:   [u8; 32],
        pub_key:           [u8; 32],
        params_nonce:      u128,
        repay_amount:      u64,
    ) -> Result<()> {
        let acct = &ctx.accounts.borrower_account;
        require!(acct.is_active,                   DravenError::NoActiveLoan);
        require!(repay_amount > 0,                 DravenError::ZeroAmount);
        require!(
            ctx.accounts.borrower.key() == acct.borrower,
            DravenError::WrongBorrower,
        );

        // Transfer repayment USDC into vault before computing new balance.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.borrower_ata.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            repay_amount,
        )?;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_borrowed = pool.total_borrowed.saturating_sub(repay_amount);

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(params_nonce)
            .encrypted_u64(amount_repaid_ct)
            .encrypted_u64(oracle_price_ct)
            .plaintext_u128(acct.profile_nonce)
            .account(
                ctx.accounts.borrower_account.key(),
                8 + 1,
                32 * 5,
            )
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ComputeRepaymentCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.borrower_account.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// MXE callback for compute_repayment.
    /// Stores encrypted remaining-debt and fully-repaid flag. The borrower decrypts
    /// these and calls settle_repayment to finalise the on-chain state.
    #[arcium_callback(encrypted_ix = "compute_repayment")]
    pub fn compute_repayment_callback(
        ctx:    Context<ComputeRepaymentCallback>,
        output: SignedComputationOutputs<ComputeRepaymentOutput>,
    ) -> Result<()> {
        let o = output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ).map_err(|e| e)?;

        let enc = match o {
            ComputeRepaymentOutput { field_0 } => field_0,
        };

        let acct = &mut ctx.accounts.borrower_account;
        // Reuse terms_ciphertexts field for repayment result (2 of 3 slots used).
        acct.terms_ciphertexts[0] = enc.ciphertexts[0]; // remaining_debt
        acct.terms_ciphertexts[1] = enc.ciphertexts[1]; // fully_repaid
        acct.terms_nonce          = enc.nonce;

        emit!(RepaymentComputedEvent {
            borrower:     acct.key(),
            result_ct:    [enc.ciphertexts[0], enc.ciphertexts[1]],
            result_nonce: enc.nonce,
        });

        Ok(())
    }

    /// Called by the borrower after decrypting repayment results.
    /// Updates borrowed_lamports and, if fully repaid, returns collateral and
    /// resets the borrower account for future loan cycles.
    pub fn settle_repayment(
        ctx:             Context<SettleRepayment>,
        remaining_debt:  u64,
        fully_repaid:    bool,
    ) -> Result<()> {
        let acct = &ctx.accounts.borrower_account;
        require!(acct.is_active,                   DravenError::NoActiveLoan);
        require!(acct.terms_nonce != 0,            DravenError::RepaymentNotComputed);
        require!(
            ctx.accounts.borrower.key() == acct.borrower,
            DravenError::WrongBorrower,
        );

        let acct = &mut ctx.accounts.borrower_account;
        acct.borrowed_lamports = remaining_debt;
        acct.terms_nonce       = 0;

        if fully_repaid {
            let collateral = acct.collateral_lamports;
            acct.is_active           = false;
            acct.collateral_lamports = 0;
            acct.rate_tier           = 0;
            acct.loan_ts             = 0;

            let pool_bump = ctx.accounts.pool_state.bump;
            let signer_seeds: &[&[&[u8]]] = &[&[b"pool", &[pool_bump]]];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.vault.to_account_info(),
                        to:        ctx.accounts.borrower_ata.to_account_info(),
                        authority: ctx.accounts.pool_state.to_account_info(),
                    },
                    signer_seeds,
                ),
                collateral,
            )?;

            emit!(LoanRepaidEvent {
                borrower: ctx.accounts.borrower_account.key(),
            });
        }

        Ok(())
    }

    // ─── Liquidation flow ─────────────────────────────────────────────────────

    /// Queues a check_health MXE computation.
    /// Anyone (liquidation bot, keeper, protocol) may call this for any active loan.
    /// The health factor value is never computed on-chain; only the boolean result
    /// crosses the MXE boundary.
    pub fn check_liquidation(
        ctx:               Context<CheckLiquidation>,
        computation_offset: u64,
        oracle_price_ct:   [u8; 32],
        current_debt_ct:   [u8; 32],
        accrued_int_ct:    [u8; 32],
        pub_key:           [u8; 32],
        params_nonce:      u128,
    ) -> Result<()> {
        let acct = &ctx.accounts.borrower_account;
        require!(acct.is_active, DravenError::NoActiveLoan);

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(params_nonce)
            .encrypted_u64(oracle_price_ct)
            .encrypted_u64(current_debt_ct)
            .encrypted_u64(accrued_int_ct)
            .plaintext_u128(acct.profile_nonce)
            .account(
                ctx.accounts.borrower_account.key(),
                8 + 1,
                32 * 5,
            )
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CheckHealthCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.borrower_account.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// MXE callback for check_health.
    /// Receives only a boolean. If true, seizes collateral into the vault,
    /// reduces total_borrowed, marks the account inactive, and emits a
    /// LiquidationExecutedEvent. No health factor value, LTV, or collateral
    /// amount breakdown is logged.
    #[arcium_callback(encrypted_ix = "check_health")]
    pub fn check_health_callback(
        ctx:    Context<CheckHealthCallback>,
        output: SignedComputationOutputs<CheckHealthOutput>,
    ) -> Result<()> {
        let should_liquidate = output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ).map(|o| match o {
            CheckHealthOutput { field_0 } => field_0,
        }).map_err(|e| e)?;

        emit!(LiquidationCheckedEvent {
            borrower:        ctx.accounts.borrower_account.key(),
            was_liquidated:  should_liquidate,
        });

        if !should_liquidate {
            return Ok(());
        }

        let seized_debt = ctx.accounts.borrower_account.borrowed_lamports;

        let acct = &mut ctx.accounts.borrower_account;
        acct.is_active           = false;
        acct.borrowed_lamports   = 0;
        acct.collateral_lamports = 0;
        acct.rate_tier           = 0;
        acct.loan_ts             = 0;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_borrowed = pool.total_borrowed.saturating_sub(seized_debt);

        emit!(LiquidationExecutedEvent {
            borrower: ctx.accounts.borrower_account.key(),
        });

        Ok(())
    }

    // ─── Computation definition initializers ──────────────────────────────────

    pub fn init_store_borrower_profile_comp_def(
        ctx: Context<InitStoreBorrowerProfileCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_compute_credit_score_comp_def(
        ctx: Context<InitComputeCreditScoreCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_check_health_comp_def(
        ctx: Context<InitCheckHealthCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_compute_repayment_comp_def(
        ctx: Context<InitComputeRepaymentCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }
}

// ─── State accounts ───────────────────────────────────────────────────────────

/// Global lending pool. One per program deployment.
#[account]
#[derive(InitSpace)]
pub struct PoolState {
    pub bump:            u8,
    pub vault_bump:      u8,
    /// Total USDC deposited by lenders, in lamports.
    pub total_deposits:  u64,
    /// Total USDC currently outstanding to borrowers, in lamports.
    pub total_borrowed:  u64,
    /// Protocol fee on interest income, in basis points.
    pub fee_bps:         u16,
}

/// Per-borrower account. Contains the encrypted profile and the minimum
/// on-chain state required to manage the loan lifecycle.
///
/// PRIVACY INVARIANT: This account intentionally exposes only rate_tier and
/// borrowed_lamports in plaintext. The credit score, health factor, and all
/// scoring inputs live exclusively inside the Arcium MXE.
#[account]
#[derive(InitSpace)]
pub struct BorrowerAccount {
    pub bump:                u8,
    /// Wallet that owns this loan.
    pub borrower:            Pubkey,
    /// MXE-encrypted BorrowerProfile ciphertexts (5 × 32 bytes).
    pub encrypted_profile:   [[u8; 32]; 5],
    /// Nonce for the encrypted profile (used by MXE to locate the key).
    pub profile_nonce:       u128,
    /// Latest compute output ciphertexts (3 slots: shared between terms and repayment).
    pub terms_ciphertexts:   [[u8; 32]; 3],
    /// Nonce for terms / repayment ciphertexts.
    pub terms_nonce:         u128,
    /// Loan tier assigned by compute_credit_score. 0 = none, 1 = A, 2 = B, 3 = C.
    pub rate_tier:           u8,
    /// Current outstanding USDC debt, in lamports.
    pub borrowed_lamports:   u64,
    /// Collateral locked in the vault, in lamports.
    pub collateral_lamports: u64,
    /// True while a loan is disbursed and not yet fully repaid or liquidated.
    pub is_active:           bool,
    /// Unix timestamp of loan disbursement (used for interest estimates off-chain).
    pub loan_ts:             i64,
}

/// Per-lender account tracking their pool share.
#[account]
#[derive(InitSpace)]
pub struct LenderAccount {
    pub bump:               u8,
    /// USDC deposited, in lamports.
    pub deposited_lamports: u64,
}

// ─── Instruction contexts ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + PoolState::INIT_SPACE,
        seeds = [b"pool"],
        bump,
    )]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        init,
        payer = payer,
        token::mint      = usdc_mint,
        token::authority = pool_state,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = lender,
    )]
    pub lender_ata: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump = pool_state.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        init_if_needed,
        payer = lender,
        space = 8 + LenderAccount::INIT_SPACE,
        seeds = [b"lender", lender.key().as_ref()],
        bump,
    )]
    pub lender_account: Account<'info, LenderAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(
        init_if_needed,
        payer = lender,
        associated_token::mint      = usdc_mint,
        associated_token::authority = lender,
    )]
    pub lender_ata: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump = pool_state.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        mut,
        seeds = [b"lender", lender.key().as_ref()],
        bump  = lender_account.bump,
    )]
    pub lender_account: Account<'info, LenderAccount>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[queue_computation_accounts("store_borrower_profile", borrower)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RequestLoan<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = borrower,
    )]
    pub borrower_ata: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump = pool_state.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        init_if_needed,
        payer = borrower,
        space = 8 + BorrowerAccount::INIT_SPACE,
        seeds = [b"borrower", borrower.key().as_ref()],
        bump,
    )]
    pub borrower_account: Account<'info, BorrowerAccount>,
    #[account(
        init_if_needed,
        space = 9,
        payer = borrower,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_BORROWER_PROFILE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("store_borrower_profile")]
#[derive(Accounts)]
pub struct StoreBorrowerProfileCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_BORROWER_PROFILE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub borrower_account: Account<'info, BorrowerAccount>,
}

#[queue_computation_accounts("compute_credit_score", borrower)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ApplyTerms<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        seeds = [b"borrower", borrower.key().as_ref()],
        bump  = borrower_account.bump,
    )]
    pub borrower_account: Box<Account<'info, BorrowerAccount>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = borrower,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_CREDIT_SCORE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_credit_score")]
#[derive(Accounts)]
pub struct ComputeCreditScoreCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_CREDIT_SCORE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub borrower_account: Account<'info, BorrowerAccount>,
}

#[derive(Accounts)]
pub struct AcceptTerms<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = borrower,
    )]
    pub borrower_ata: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump = pool_state.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        mut,
        seeds = [b"borrower", borrower.key().as_ref()],
        bump  = borrower_account.bump,
    )]
    pub borrower_account: Account<'info, BorrowerAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("compute_repayment", borrower)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Repay<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = borrower,
    )]
    pub borrower_ata: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump = pool_state.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        mut,
        seeds = [b"borrower", borrower.key().as_ref()],
        bump  = borrower_account.bump,
    )]
    pub borrower_account: Box<Account<'info, BorrowerAccount>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = borrower,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_REPAYMENT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_repayment")]
#[derive(Accounts)]
pub struct ComputeRepaymentCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_REPAYMENT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub borrower_account: Account<'info, BorrowerAccount>,
}

#[derive(Accounts)]
pub struct SettleRepayment<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint      = usdc_mint,
        associated_token::authority = borrower,
    )]
    pub borrower_ata: Account<'info, TokenAccount>,
    #[account(address = usdc::ID)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump = pool_state.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        mut,
        seeds = [b"borrower", borrower.key().as_ref()],
        bump  = borrower_account.bump,
    )]
    pub borrower_account: Account<'info, BorrowerAccount>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[queue_computation_accounts("check_health", caller)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CheckLiquidation<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: the borrower whose health we are checking
    pub borrower: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"borrower", borrower.key().as_ref()],
        bump  = borrower_account.bump,
    )]
    pub borrower_account: Box<Account<'info, BorrowerAccount>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = caller,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, DravenError::ClusterNotSet)
    )]
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_HEALTH))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("check_health")]
#[derive(Accounts)]
pub struct CheckHealthCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_HEALTH))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, DravenError::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub borrower_account: Account<'info, BorrowerAccount>,
    #[account(mut, seeds = [b"pool"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
}

// ─── Comp def init contexts ───────────────────────────────────────────────────

#[init_computation_definition_accounts("store_borrower_profile", payer)]
#[derive(Accounts)]
pub struct InitStoreBorrowerProfileCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not yet initialized
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("compute_credit_score", payer)]
#[derive(Accounts)]
pub struct InitComputeCreditScoreCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not yet initialized
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("check_health", payer)]
#[derive(Accounts)]
pub struct InitCheckHealthCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not yet initialized
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("compute_repayment", payer)]
#[derive(Accounts)]
pub struct InitComputeRepaymentCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not yet initialized
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum DravenError {
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("insufficient USDC balance for this operation")]
    InsufficientBalance,
    #[msg("pool does not have enough liquidity to disburse this loan")]
    InsufficientLiquidity,
    #[msg("a loan is already active for this borrower")]
    LoanAlreadyActive,
    #[msg("no active loan — request terms first")]
    NoActiveLoan,
    #[msg("borrower profile has not been stored yet")]
    ProfileNotStored,
    #[msg("loan terms have not been computed yet")]
    TermsNotComputed,
    #[msg("repayment result has not been computed yet")]
    RepaymentNotComputed,
    #[msg("only the borrower may perform this action")]
    WrongBorrower,
    #[msg("rate tier must be 0–3")]
    InvalidTier,
    #[msg("arcium cluster not configured on mxe account")]
    ClusterNotSet,
    #[msg("arithmetic overflow")]
    Overflow,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct LiquidityDepositedEvent {
    pub amount:     u64,
    pub pool_total: u64,
}

#[event]
pub struct ProfileStoredEvent {
    /// The BorrowerAccount PDA, not the wallet address (avoids linking wallet to loan).
    pub borrower: Pubkey,
}

/// Emitted after compute_credit_score. Contains only encrypted ciphertexts.
/// No approval status or tier is revealed here; the borrower decrypts off-chain.
#[event]
pub struct TermsComputedEvent {
    pub borrower:          Pubkey,
    pub terms_ciphertexts: [[u8; 32]; 3],
    pub result_nonce:      u128,
}

/// Emitted when the borrower calls accept_terms and the loan is approved.
/// Reveals only rate_tier and borrowed amount — no score, no health factor.
#[event]
pub struct LoanDisbursedEvent {
    pub borrower:          Pubkey,
    pub rate_tier:         u8,
    pub borrowed_lamports: u64,
}

#[event]
pub struct LoanRejectedEvent {
    pub borrower: Pubkey,
}

#[event]
pub struct RepaymentComputedEvent {
    pub borrower:     Pubkey,
    pub result_ct:    [[u8; 32]; 2],
    pub result_nonce: u128,
}

#[event]
pub struct LoanRepaidEvent {
    pub borrower: Pubkey,
}

/// Only a boolean result is recorded. No LTV, no health factor value.
#[event]
pub struct LiquidationCheckedEvent {
    pub borrower:       Pubkey,
    pub was_liquidated: bool,
}

/// Collateral seizure confirmed. No amounts are logged.
#[event]
pub struct LiquidationExecutedEvent {
    pub borrower: Pubkey,
}

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet, useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { PrivacyProofPanel } from "../components/PrivacyProofPanel";
import { MpcComputingState } from "../components/MpcComputingState";
import { TierBadge, tierApr } from "../components/TierBadge";
import { MetricCardSkeleton } from "../components/Skeleton";
import { LandingPage } from "../components/LandingPage";
import { useBorrower } from "../hooks/useBorrower";
import { usePool } from "../hooks/usePool";
import { USDC_MINT } from "../utils/anchor";

function formatUsdc(lamports: bigint): string {
  return (Number(lamports) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function InputRow({
  label, suffix, value, onChange, placeholder, disabled, hint,
}: {
  label: string; suffix: string; value: string;
  onChange: (v: string) => void; placeholder: string; disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium" style={{ color: "#71717a" }}>{label}</label>
        {hint && <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>{hint}</span>}
      </div>
      <div className="input-field flex items-center overflow-hidden">
        <input
          type="number" min="0" step="any"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none disabled:opacity-40"
          style={{ color: "#f5f5f5" }}
        />
        <span className="px-4 text-xs font-mono py-3" style={{ color: "#52525b", borderLeft: "1px solid #1f1f1f" }}>
          {suffix}
        </span>
      </div>
    </div>
  );
}

// Devnet demo — mainnet derives credit profile from verified on-chain history.
const DEVNET_CREDIT = { walletAge: 180, repaid: 3, liquidations: 0 };

const TIERS = [
  { tier: 1 as const, name: "Tier A", apr: "6%",  ltv: "125%", color: "#86efac" },
  { tier: 2 as const, name: "Tier B", apr: "12%", ltv: "100%", color: "#93c5fd" },
  { tier: 3 as const, name: "Tier C", apr: "18%", ltv: "75%",  color: "#fca5a5" },
];

function TierRatesPanel({ availableLiquidity }: { availableLiquidity: bigint | null }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid #1a1a1a" }}
    >
      <div className="px-5 py-4" style={{ background: "#0e0e0e", borderBottom: "1px solid #1a1a1a" }}>
        <p className="text-xs font-medium" style={{ color: "#e4e4e7" }}>Loan tiers</p>
        <p className="text-xs mt-0.5" style={{ color: "#3f3f46" }}>
          Score computed privately — only your tier reaches the chain.
        </p>
      </div>

      <div style={{ background: "#0d0d0d" }}>
        {TIERS.map(({ name, apr, ltv, color }) => (
          <div
            key={name}
            className="flex items-center justify-between px-5 py-3.5 border-b last:border-0"
            style={{ borderColor: "#161616" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs font-mono" style={{ color: "#71717a" }}>{name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-semibold" style={{ color: "#e4e4e7" }}>{apr} APR</span>
              <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>·</span>
              <span className="text-xs font-mono" style={{ color: "#52525b" }}>{ltv} max</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4" style={{ background: "#0a0a0a", borderTop: "1px solid #141414" }}>
        <p className="text-xs mb-2" style={{ color: "#52525b" }}>Available liquidity</p>
        <p className="text-lg font-mono font-semibold" style={{ color: "#a5b4fc" }}>
          {availableLiquidity !== null
            ? <>${formatUsdc(availableLiquidity)} <span className="text-xs font-normal" style={{ color: "#52525b" }}>USDC</span></>
            : <span style={{ color: "#3f3f46" }}>—</span>
          }
        </p>
        <p className="text-xs mt-1" style={{ color: "#2a2a2a" }}>Free in the pool right now</p>
      </div>
    </div>
  );
}

export function Borrow() {
  const { connected }  = useWallet();
  const wallet         = useAnchorWallet();
  const { connection } = useConnection();
  const { borrower, mpcStage, loanTerms, loading, requestLoan, acceptTerms } = useBorrower();
  const { pool, refresh: refreshPool } = usePool();

  const [collateral, setCollateral]           = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [error, setError]                     = useState<string | null>(null);
  const [borrowAmount, setBorrowAmount]       = useState("");
  const [usdcBalance, setUsdcBalance]         = useState<bigint | null>(null);

  async function refreshBalance() {
    if (!wallet) return;
    try {
      const ata  = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
      const acct = await getAccount(connection, ata);
      setUsdcBalance(acct.amount);
    } catch { setUsdcBalance(0n); }
  }

  useEffect(() => {
    refreshBalance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, connection]);

  const isComputing = mpcStage !== "idle" && mpcStage !== "done";

  const availableLiquidity = pool
    ? pool.totalDeposits - pool.totalBorrowed
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const collateralUsdc = parseFloat(collateral);
    const requestedUsdc  = parseFloat(requestedAmount);
    if (isNaN(collateralUsdc) || collateralUsdc <= 0) { setError("Enter a valid collateral amount."); return; }
    if (isNaN(requestedUsdc)  || requestedUsdc  <= 0) { setError("Enter a valid requested amount.");  return; }
    const collateralLamports = BigInt(Math.floor(collateralUsdc * 1_000_000));
    const requestedLamports  = BigInt(Math.floor(requestedUsdc  * 1_000_000));
    try {
      await requestLoan(
        collateralLamports,
        DEVNET_CREDIT.walletAge,
        DEVNET_CREDIT.repaid,
        DEVNET_CREDIT.liquidations,
        requestedLamports,
      );
      await refreshBalance();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("timed out"))         setError("Computation taking longer than expected — do not close this tab");
      else if (msg.includes("Insufficient")) setError("Not enough USDC — deposit more to continue");
      else if (msg.includes("interrupted"))  setError("Connection interrupted — your position is safe, retrying");
      else { if (import.meta.env.DEV) console.error(e); setError("Something went wrong. Please try again."); }
    }
  }

  async function handleAccept() {
    if (!loanTerms) return;
    setError(null);
    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0)           { setError("Enter a borrow amount."); return; }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    if (lamports > loanTerms.maxBorrowLamports) { setError(`Maximum borrow is ${formatUsdc(loanTerms.maxBorrowLamports)} USDC.`); return; }
    try {
      await acceptTerms(loanTerms, lamports);
      await Promise.all([refreshBalance(), refreshPool()]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      setError(msg || "Failed to accept terms.");
    }
  }

  if (!connected) return <LandingPage />;

  const balanceHint = usdcBalance !== null
    ? `Balance: ${formatUsdc(usdcBalance)} USDC`
    : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-10"
    >
      {/* Devnet faucet banner */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-lg text-xs" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
        <span style={{ color: "#52525b" }}>Testing on devnet?</span>
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70" style={{ color: "#a5b4fc" }}
        >
          Get devnet USDC
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 9.5 9.5 2.5M5 2.5h4.5v4.5" /></svg>
        </a>
        <span style={{ color: "#27272a" }}>·</span>
        <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70" style={{ color: "#71717a" }}
        >
          Get devnet SOL
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 9.5 9.5 2.5M5 2.5h4.5v4.5" /></svg>
        </a>
      </div>

      {!borrower?.isActive && (
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Borrow against your{" "}
            <span style={{ background: "linear-gradient(135deg, #a5b4fc, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              credit profile
            </span>
          </h1>
          <p className="text-sm" style={{ color: "#71717a" }}>
            Your score is computed privately inside the Arcium MXE. Only your rate tier surfaces on-chain.
          </p>
        </div>
      )}

      {/* Privacy proof panel */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
      ) : (
        <PrivacyProofPanel borrower={borrower} pool={null} />
      )}

      {/* Loan form */}
      {!borrower?.isActive && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 max-w-3xl"
        >
          {/* Left — form */}
          <div className="space-y-5">
            <div className="rounded-xl p-6 space-y-5" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Request loan terms</h2>
                <p className="text-xs" style={{ color: "#52525b" }}>
                  Post USDC as collateral. The Arcium cluster scores your credit privately and returns your rate tier.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <InputRow label="Collateral amount" suffix="USDC" value={collateral}      onChange={setCollateral}      placeholder="0.00" disabled={isComputing} hint={balanceHint} />
                <InputRow label="Requested amount"  suffix="USDC" value={requestedAmount} onChange={setRequestedAmount} placeholder="0.00" disabled={isComputing} />

                <AnimatePresence mode="wait">
                  {isComputing ? (
                    <MpcComputingState key="mpc" stage={mpcStage} />
                  ) : (
                    <motion.button
                      key="btn" type="submit"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      disabled={isComputing}
                      className="w-full py-3 rounded-lg text-sm font-semibold text-white btn-primary"
                    >
                      Request loan terms
                    </motion.button>
                  )}
                </AnimatePresence>

                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-xs px-3 py-2 rounded-lg"
                    style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}
                  >
                    {error}
                  </motion.p>
                )}
              </form>
            </div>

            {/* MXE result */}
            <AnimatePresence>
              {loanTerms && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.35 }}
                  className="rounded-xl p-6 space-y-5"
                  style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: "#52525b" }}>MXE result</p>
                      {loanTerms.approved ? (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.8)" }} />
                            <span className="text-sm font-medium" style={{ color: "#e4e4e7" }}>Approved</span>
                          </div>
                          <TierBadge tier={loanTerms.rateTier} />
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: "#52525b" }}>Not approved — insufficient credit score</p>
                      )}
                    </div>
                    {loanTerms.approved && (
                      <div className="text-right">
                        <p className="text-xs mb-1" style={{ color: "#52525b" }}>Max borrow</p>
                        <p className="text-lg font-mono font-semibold" style={{ color: "#a5b4fc" }}>
                          {formatUsdc(loanTerms.maxBorrowLamports)}
                          <span className="text-xs ml-1 font-normal" style={{ color: "#52525b" }}>USDC</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {loanTerms.approved && (
                    <div className="space-y-3 pt-2 border-t" style={{ borderColor: "#1a1a1a" }}>
                      <InputRow label="Amount to borrow" suffix="USDC" value={borrowAmount} onChange={setBorrowAmount} placeholder="0.00" disabled={false} />
                      <button onClick={handleAccept} className="w-full py-3 rounded-lg text-sm font-semibold text-white btn-primary">
                        Confirm and borrow
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right — tier rates + pool liquidity */}
          <TierRatesPanel availableLiquidity={availableLiquidity} />
        </motion.div>
      )}

      {/* Active loan */}
      {borrower?.isActive && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
          <div className="rounded-xl p-6 space-y-5" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.8)" }} />
                <span className="text-xs font-medium" style={{ color: "#71717a" }}>Active loan</span>
              </div>
              <TierBadge tier={borrower.rateTier} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs mb-1" style={{ color: "#52525b" }}>Borrowed</p>
                <p className="text-xl font-mono font-semibold" style={{ color: "#e4e4e7" }}>${formatUsdc(borrower.borrowedLamports)}</p>
                <p className="text-xs mt-0.5" style={{ color: "#3f3f46" }}>USDC</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#52525b" }}>Collateral</p>
                <p className="text-xl font-mono font-semibold" style={{ color: "#e4e4e7" }}>${formatUsdc(borrower.collateralLamports)}</p>
                <p className="text-xs mt-0.5" style={{ color: "#3f3f46" }}>USDC</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#52525b" }}>Interest rate</p>
                <p className="text-xl font-mono font-semibold" style={{ color: "#a5b4fc" }}>{tierApr(borrower.rateTier)}%</p>
                <p className="text-xs mt-0.5" style={{ color: "#3f3f46" }}>APR</p>
              </div>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: "#3f3f46" }}>Manage repayments on the Portfolio page.</p>
        </motion.div>
      )}
    </motion.div>
  );
}

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWallet, useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { USDC_MINT } from "../utils/anchor";
import { MpcComputingState } from "../components/MpcComputingState";
import { TierBadge, tierApr } from "../components/TierBadge";
import { MetricCardSkeleton } from "../components/Skeleton";
import { useBorrower } from "../hooks/useBorrower";

function formatUsdc(lamports: bigint): string {
  return (Number(lamports) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function daysActive(loanTs: number): number {
  if (loanTs === 0) return 0;
  return Math.floor((Date.now() / 1000 - loanTs) / 86_400);
}

function estimateNextPayment(borrowedLamports: bigint, rateTier: 0 | 1 | 2 | 3): bigint {
  const apr     = tierApr(rateTier);
  const monthly = (Number(borrowedLamports) * apr) / 100 / 12;
  return BigInt(Math.floor(monthly));
}

function healthColor(borrowed: bigint, collateral: bigint): string {
  if (borrowed === 0n) return "#34d399";
  const ratio = Number(collateral) / 1e6 / (Number(borrowed) / 1e6);
  if (ratio > 2)   return "#34d399";
  if (ratio > 1.2) return "#fbbf24";
  return "#f87171";
}

export function Portfolio() {
  const { connected }      = useWallet();
  const wallet             = useAnchorWallet();
  const { connection }     = useConnection();
  const { borrower, mpcStage, loading, repay } = useBorrower();

  const [repayAmount, setRepayAmount] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);

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

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid repayment amount."); return; }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    try {
      await repay(lamports);
      setRepayAmount("");
      await refreshBalance();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      if (msg.includes("timed out"))        setError("Computation taking longer than expected — do not close this tab");
      else if (msg.includes("Insufficient")) setError("Not enough USDC — deposit more to continue");
      else                                   setError("Repayment failed.");
    }
  }

  if (!connected) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[400px] gap-4"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(79,70,229,0.12)", border: "1px solid rgba(79,70,229,0.2)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
        </div>
        <p className="text-sm" style={{ color: "#52525b" }}>Connect your wallet to view your portfolio</p>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
    );
  }

  if (!borrower?.isActive) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[400px] gap-4"
      >
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.15)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium" style={{ color: "#71717a" }}>No active loan</p>
          <p className="text-xs" style={{ color: "#3f3f46" }}>Request loan terms on the Borrow page to get started</p>
        </div>
      </motion.div>
    );
  }

  const nextPayment  = estimateNextPayment(borrower.borrowedLamports, borrower.rateTier);
  const days         = daysActive(borrower.loanTs);
  const hColor       = healthColor(borrower.borrowedLamports, borrower.collateralLamports);
  const repayPreview = repayAmount
    ? borrower.borrowedLamports - BigInt(Math.floor(parseFloat(repayAmount) * 1_000_000))
    : null;
  const collateralUsdc = `$${formatUsdc(borrower.collateralLamports)}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-8 max-w-2xl">

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Your <span className="text-gradient">portfolio</span></h1>
        <p className="text-sm" style={{ color: "#71717a" }}>Active loan details and repayment history.</p>
      </div>

      {/* Loan header card */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a1a1a" }}>
        {/* Top banner */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0d14, #0f0f1a)", borderBottom: "1px solid #1a1a1a" }}>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#34d399", boxShadow: "0 0 8px rgba(52,211,153,0.7)" }} />
            <span className="text-sm font-medium" style={{ color: "#e4e4e7" }}>Active loan</span>
          </div>
          <TierBadge tier={borrower.rateTier} />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1a1a1a]" style={{ background: "#0d0d0d" }}>
          {[
            { label: "Borrowed", value: `$${formatUsdc(borrower.borrowedLamports)}`, sub: "USDC" },
            { label: "Collateral", value: collateralUsdc, sub: "USDC" },
            { label: "Days active", value: days.toString(), sub: "days" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="px-6 py-5" style={{ borderColor: "#1a1a1a" }}>
              <p className="text-xs mb-2" style={{ color: "#52525b" }}>{label}</p>
              <p className="text-2xl font-mono font-semibold" style={{ color: "#e4e4e7" }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: "#3f3f46" }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Footer row */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: "#0a0a0a", borderTop: "1px solid #141414" }}>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: hColor, boxShadow: `0 0 6px ${hColor}99` }} />
            <span className="text-xs" style={{ color: "#52525b" }}>Health factor</span>
            <span className="text-xs font-mono" style={{ color: hColor }}>computed inside MXE</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-semibold" style={{ color: "#a5b4fc" }}>{tierApr(borrower.rateTier)}% APR</span>
            <span className="text-xs" style={{ color: "#52525b" }}> · est. </span>
            <span className="text-xs font-mono" style={{ color: "#e4e4e7" }}>${formatUsdc(nextPayment)}/mo</span>
          </div>
        </div>
      </div>

      {/* Repay card */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Repay loan</h2>
          <p className="text-xs" style={{ color: "#52525b" }}>
            Repayment is settled privately. Your updated debt is encrypted back to you inside the MXE.
          </p>
        </div>

        <form onSubmit={handleRepay} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              {usdcBalance !== null && (
                <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>Balance: {formatUsdc(usdcBalance)} USDC</span>
              )}
              <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>Borrowed: {formatUsdc(borrower.borrowedLamports)} USDC</span>
            </div>
            <div className="input-field flex items-center overflow-hidden">
              <input
                type="number" min="0" step="any" value={repayAmount}
                onChange={e => setRepayAmount(e.target.value)}
                placeholder="0.00" disabled={isComputing}
                className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none disabled:opacity-40"
                style={{ color: "#f5f5f5" }}
              />
              <span className="px-4 text-xs font-mono py-3" style={{ color: "#52525b", borderLeft: "1px solid #1f1f1f" }}>USDC</span>
            </div>
          </div>

          {repayPreview !== null && repayPreview >= 0n && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center justify-between px-4 py-3 rounded-lg"
              style={{ background: "#0a0a0a", border: "1px solid #141414" }}
            >
              <span className="text-xs" style={{ color: "#52525b" }}>Remaining after repayment</span>
              <span className="text-sm font-mono font-medium" style={{ color: "#a5b4fc" }}>
                ${formatUsdc(repayPreview)}
              </span>
            </motion.div>
          )}

          {isComputing ? (
            <MpcComputingState stage={mpcStage} />
          ) : (
            <button type="submit" disabled={isComputing} className="w-full py-3 rounded-lg text-sm font-semibold text-white btn-primary">
              Repay
            </button>
          )}

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs px-3 py-2 rounded-lg" style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
              {error}
            </motion.p>
          )}
        </form>
      </div>
    </motion.div>
  );
}

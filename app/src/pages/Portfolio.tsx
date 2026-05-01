import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
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

export function Portfolio() {
  const { connected }       = useWallet();
  const { borrower, mpcStage, loading, repay } = useBorrower();

  const [repayAmount, setRepayAmount] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const isComputing = mpcStage !== "idle" && mpcStage !== "done";

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid repayment amount.");
      return;
    }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    try {
      await repay(lamports);
      setRepayAmount("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      if (msg.includes("timed out")) {
        setError("Computation taking longer than expected — do not close this tab");
      } else if (msg.includes("Insufficient")) {
        setError("Not enough USDC — deposit more to continue");
      } else {
        setError("Repayment failed.");
      }
    }
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-secondary">Connect your wallet to view your portfolio</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>
    );
  }

  if (!borrower?.isActive) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-sm text-secondary">No active loan — request terms to get started</p>
        </div>
      </div>
    );
  }

  const nextPayment   = estimateNextPayment(borrower.borrowedLamports, borrower.rateTier);
  const days          = daysActive(borrower.loanTs);
  const repayPreview  = repayAmount
    ? borrower.borrowedLamports - BigInt(Math.floor(parseFloat(repayAmount) * 1_000_000))
    : null;

  return (
    <div className="space-y-12 max-w-2xl">
      {/* Active loan card */}
      <div className="border border-border rounded bg-surface p-6 space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-secondary">Active loan</span>
          <TierBadge tier={borrower.rateTier} />
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-secondary mb-1">Borrowed</p>
            <p className="text-lg font-mono text-primary">${formatUsdc(borrower.borrowedLamports)}</p>
          </div>
          <div>
            <p className="text-xs text-secondary mb-1">Collateral</p>
            <p className="text-lg font-mono text-primary">
              {(Number(borrower.collateralLamports) / 1e9).toFixed(4)} SOL
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary mb-1">Days active</p>
            <p className="text-lg font-mono text-primary">{days}</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs text-secondary mb-1">Estimated next payment</p>
          <p className="text-sm font-mono text-primary">${formatUsdc(nextPayment)} / month</p>
        </div>
      </div>

      {/* Repay */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-primary">Repay</h2>
          <p className="text-xs text-secondary">
            Repayment is computed privately. Your remaining debt is encrypted back to you.
          </p>
        </div>

        <form onSubmit={handleRepay} className="space-y-4">
          <div className="flex items-center border border-border rounded bg-background overflow-hidden focus-within:border-accent transition-colors duration-150">
            <input
              type="number"
              min="0"
              step="any"
              value={repayAmount}
              onChange={e => setRepayAmount(e.target.value)}
              placeholder="0.00"
              disabled={isComputing}
              className="flex-1 bg-transparent px-4 py-3 text-sm font-mono text-primary placeholder:text-muted outline-none disabled:opacity-40"
            />
            <span className="px-4 text-xs text-secondary border-l border-border py-3">USDC</span>
          </div>

          {repayPreview !== null && repayPreview >= 0n && (
            <p className="text-xs text-secondary">
              Estimated remaining after repayment:{" "}
              <span className="font-mono text-primary">${formatUsdc(repayPreview)}</span>
            </p>
          )}

          {isComputing ? (
            <MpcComputingState stage={mpcStage} />
          ) : (
            <button
              type="submit"
              disabled={isComputing}
              className="w-full py-3 rounded text-sm font-medium text-white transition-opacity duration-150 disabled:opacity-40"
              style={{ backgroundColor: "#4f46e5" }}
            >
              Repay
            </button>
          )}

          {error && <p className="text-xs text-[#fca5a5]">{error}</p>}
        </form>
      </div>
    </div>
  );
}

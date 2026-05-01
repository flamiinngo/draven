import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { PrivacyProofPanel } from "../components/PrivacyProofPanel";
import { MpcComputingState } from "../components/MpcComputingState";
import { TierBadge } from "../components/TierBadge";
import { MetricCardSkeleton } from "../components/Skeleton";
import { useBorrower } from "../hooks/useBorrower";
import type { LoanTerms } from "../types";

function formatUsdc(lamports: bigint): string {
  return (Number(lamports) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function InputRow({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label:       string;
  suffix:      string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
  disabled:    boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-secondary">{label}</label>
      <div className="flex items-center border border-border rounded bg-background overflow-hidden focus-within:border-accent transition-colors duration-150">
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent px-4 py-3 text-sm font-mono text-primary placeholder:text-muted outline-none disabled:opacity-40"
        />
        <span className="px-4 text-xs text-secondary border-l border-border py-3">{suffix}</span>
      </div>
    </div>
  );
}

export function Borrow() {
  const { connected }  = useWallet();
  const { borrower, mpcStage, loanTerms, loading, requestLoan, acceptTerms } = useBorrower();

  const [collateral, setCollateral]         = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [error, setError]                   = useState<string | null>(null);
  const [pendingTerms, setPendingTerms]     = useState<LoanTerms | null>(null);
  const [borrowAmount, setBorrowAmount]     = useState("");

  const isComputing = mpcStage !== "idle" && mpcStage !== "done";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const collateralSol = parseFloat(collateral);
    const requestedUsdc = parseFloat(requestedAmount);

    if (isNaN(collateralSol) || collateralSol <= 0) {
      setError("Enter a valid collateral amount.");
      return;
    }
    if (isNaN(requestedUsdc) || requestedUsdc <= 0) {
      setError("Enter a valid requested amount.");
      return;
    }

    const collateralLamports = BigInt(Math.floor(collateralSol * 1_000_000_000));
    const requestedLamports  = BigInt(Math.floor(requestedUsdc * 1_000_000));

    // Estimate wallet age from on-chain data — for demo we use 400 days.
    // In production this is fetched from the RPC (earliest transaction timestamp).
    try {
      await requestLoan(collateralLamports, 400, 3, 0, requestedLamports);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("timed out")) {
        setError("Computation taking longer than expected — do not close this tab");
      } else if (msg.includes("Insufficient")) {
        setError("Not enough USDC — deposit more to continue");
      } else if (msg.includes("interrupted")) {
        setError("Connection interrupted — your position is safe, retrying");
      } else {
        if (import.meta.env.DEV) console.error(e);
        setError("Something went wrong. Please try again.");
      }
    }
  }

  async function handleAccept() {
    if (!loanTerms) return;
    setError(null);
    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a borrow amount.");
      return;
    }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    if (lamports > loanTerms.maxBorrowLamports) {
      setError(`Maximum borrow is ${formatUsdc(loanTerms.maxBorrowLamports)} USDC.`);
      return;
    }
    try {
      await acceptTerms(loanTerms, lamports);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      setError(msg || "Failed to accept terms.");
    }
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-sm text-secondary">Connect your wallet to request a loan</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
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
        <div className="space-y-8 max-w-lg">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-primary">Request loan terms</h2>
            <p className="text-xs text-secondary">
              Your credit profile is scored privately inside the Arcium MXE.
              Only your rate tier will appear on-chain.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputRow
              label="Collateral amount"
              suffix="SOL"
              value={collateral}
              onChange={setCollateral}
              placeholder="0.00"
              disabled={isComputing}
            />
            <InputRow
              label="Requested amount"
              suffix="USDC"
              value={requestedAmount}
              onChange={setRequestedAmount}
              placeholder="0.00"
              disabled={isComputing}
            />

            <AnimatePresence mode="wait">
              {isComputing ? (
                <MpcComputingState key="mpc" stage={mpcStage} />
              ) : (
                <motion.button
                  key="btn"
                  type="submit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  disabled={!connected || isComputing}
                  className="w-full py-3 rounded text-sm font-medium text-white transition-opacity duration-150 disabled:opacity-40"
                  style={{ backgroundColor: "#4f46e5" }}
                >
                  Request loan terms
                </motion.button>
              )}
            </AnimatePresence>

            {error && <p className="text-xs text-[#fca5a5]">{error}</p>}
          </form>

          {/* Terms result */}
          <AnimatePresence>
            {loanTerms && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="border border-border rounded bg-surface p-6 space-y-6"
              >
                <div className="space-y-1">
                  <p className="text-xs text-secondary">Loan terms</p>
                  {loanTerms.approved ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-primary">Approved</span>
                      <TierBadge tier={loanTerms.rateTier} />
                    </div>
                  ) : (
                    <p className="text-sm text-[#71717a]">Not approved — insufficient credit score</p>
                  )}
                </div>

                {loanTerms.approved && (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-secondary">Max borrow</p>
                      <p className="text-sm font-mono text-primary">
                        {formatUsdc(loanTerms.maxBorrowLamports)} USDC
                      </p>
                    </div>

                    <div className="space-y-2">
                      <InputRow
                        label="Amount to borrow"
                        suffix="USDC"
                        value={borrowAmount}
                        onChange={setBorrowAmount}
                        placeholder="0.00"
                        disabled={false}
                      />
                      <button
                        onClick={handleAccept}
                        className="w-full py-3 rounded text-sm font-medium text-white transition-opacity duration-150"
                        style={{ backgroundColor: "#4f46e5" }}
                      >
                        Confirm and borrow
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Active loan summary */}
      {borrower?.isActive && (
        <div className="space-y-4 max-w-lg">
          <div className="border border-border rounded bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-secondary">Active loan</span>
              <TierBadge tier={borrower.rateTier} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-secondary mb-1">Borrowed</p>
                <p className="text-sm font-mono text-primary">{formatUsdc(borrower.borrowedLamports)} USDC</p>
              </div>
              <div>
                <p className="text-xs text-secondary mb-1">Collateral</p>
                <p className="text-sm font-mono text-primary">
                  {(Number(borrower.collateralLamports) / 1e9).toFixed(4)} SOL
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-secondary">
            Manage repayments on the Portfolio page.
          </p>
        </div>
      )}
    </div>
  );
}

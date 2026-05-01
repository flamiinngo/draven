import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  USDC_MINT, VAULT_PDA, POOL_PDA,
  lenderPda, loadProgram, sendSafe,
} from "../utils/anchor";
import { usePool, utilizationRate, poolApy } from "../hooks/usePool";
import { MetricCardSkeleton } from "../components/Skeleton";

function formatUsdc(lamports: bigint): string {
  return (Number(lamports) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border rounded bg-surface p-6">
      <p className="text-xs text-secondary mb-2">{label}</p>
      <p className="text-2xl font-mono text-primary font-medium">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

export function Lend() {
  const { connected } = useWallet();
  const wallet        = useAnchorWallet();
  const { pool, loading: poolLoading, refresh } = usePool();

  const [depositAmount, setDepositAmount]     = useState("");
  const [withdrawAmount, setWithdrawAmount]   = useState("");
  const [lenderDeposit, setLenderDeposit]     = useState<bigint | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [submitting, setSubmitting]           = useState(false);

  async function loadLenderState() {
    if (!wallet) return;
    try {
      const program = await loadProgram(wallet);
      const pda     = lenderPda(wallet.publicKey);
      try {
        const data = await program.account.lenderAccount.fetch(pda);
        setLenderDeposit(BigInt(data.depositedLamports.toString()));
      } catch {
        setLenderDeposit(0n);
      }
    } catch {
      // noop
    }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setError(null);
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid deposit amount.");
      return;
    }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    setSubmitting(true);
    try {
      const program    = await loadProgram(wallet);
      const lenderAta  = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
      const lenderAcct = lenderPda(wallet.publicKey);

      await sendSafe(() =>
        program.methods
          .depositLiquidity(new anchor.BN(lamports.toString()))
          .accounts({
            lender:        wallet.publicKey,
            lenderAta,
            usdcMint:      USDC_MINT,
            vault:         VAULT_PDA,
            poolState:     POOL_PDA,
            lenderAccount: lenderAcct,
            tokenProgram:  TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc()
      );
      setDepositAmount("");
      await refresh();
      await loadLenderState();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      setError(msg.includes("Insufficient") ? "Not enough USDC — deposit more to continue" : "Deposit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setError(null);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid withdrawal amount.");
      return;
    }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    setSubmitting(true);
    try {
      const program    = await loadProgram(wallet);
      const lenderAta  = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
      const lenderAcct = lenderPda(wallet.publicKey);

      await sendSafe(() =>
        program.methods
          .withdrawLiquidity(new anchor.BN(lamports.toString()))
          .accounts({
            lender:        wallet.publicKey,
            lenderAta,
            usdcMint:      USDC_MINT,
            vault:         VAULT_PDA,
            poolState:     POOL_PDA,
            lenderAccount: lenderAcct,
            tokenProgram:  TOKEN_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc()
      );
      setWithdrawAmount("");
      await refresh();
      await loadLenderState();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      setError(
        msg.includes("Insufficient") ? "Not enough USDC — deposit more to continue" :
        msg.includes("liquidity")    ? "Pool does not have enough free liquidity to withdraw" :
        "Withdrawal failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-secondary">Connect your wallet to lend</p>
      </div>
    );
  }

  const util    = pool ? utilizationRate(pool) : 0;
  const apy     = pool ? poolApy(pool) : 0;

  return (
    <div className="space-y-12">
      {/* Pool stats */}
      <div className="grid grid-cols-4 gap-4">
        {poolLoading || !pool ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard label="Total deposits"   value={`$${formatUsdc(pool.totalDeposits)}`} />
            <MetricCard label="Total borrowed"   value={`$${formatUsdc(pool.totalBorrowed)}`} />
            <MetricCard label="Utilization rate" value={`${util.toFixed(1)}%`} />
            <MetricCard label="Pool APY"         value={`${apy.toFixed(2)}%`} sub="estimated" />
          </>
        )}
      </div>

      {/* Deposit */}
      <div className="grid grid-cols-2 gap-12">
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-primary">Deposit USDC</h2>
            <p className="text-xs text-secondary">Earn interest from borrowers. Withdrawals are instant when liquidity is available.</p>
          </div>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div className="flex items-center border border-border rounded bg-background overflow-hidden focus-within:border-accent transition-colors duration-150">
              <input
                type="number"
                min="0"
                step="any"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                placeholder="0.00"
                disabled={submitting}
                className="flex-1 bg-transparent px-4 py-3 text-sm font-mono text-primary placeholder:text-muted outline-none disabled:opacity-40"
              />
              <span className="px-4 text-xs text-secondary border-l border-border py-3">USDC</span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded text-sm font-medium text-white transition-opacity duration-150 disabled:opacity-40"
              style={{ backgroundColor: "#4f46e5" }}
            >
              {submitting ? "Processing…" : "Deposit USDC"}
            </button>
          </form>
        </div>

        {/* Your position */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-primary">Your position</h2>
            <p className="text-xs text-secondary">Your share of the lending pool.</p>
          </div>
          <div className="border border-border rounded bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs text-secondary mb-1">Deposited</p>
              <p className="text-lg font-mono text-primary">
                {lenderDeposit !== null ? `$${formatUsdc(lenderDeposit)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-secondary mb-1">Estimated earned</p>
              <p className="text-sm font-mono text-primary">—</p>
            </div>
          </div>
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="flex items-center border border-border rounded bg-background overflow-hidden focus-within:border-accent transition-colors duration-150">
              <input
                type="number"
                min="0"
                step="any"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                disabled={submitting}
                className="flex-1 bg-transparent px-4 py-3 text-sm font-mono text-primary placeholder:text-muted outline-none disabled:opacity-40"
              />
              <span className="px-4 text-xs text-secondary border-l border-border py-3">USDC</span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded text-sm font-medium transition-opacity duration-150 disabled:opacity-40"
              style={{ backgroundColor: "#1f1f1f", color: "#f5f5f5" }}
            >
              {submitting ? "Processing…" : "Withdraw"}
            </button>
          </form>
        </div>
      </div>

      {error && <p className="text-xs text-[#fca5a5]">{error}</p>}
    </div>
  );
}

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWallet, useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  USDC_MINT, VAULT_PDA, POOL_PDA,
  lenderPda, loadProgram, sendSafe,
} from "../utils/anchor";
import { usePool, utilizationRate, poolApy, maxPoolApy } from "../hooks/usePool";
import { MetricCardSkeleton } from "../components/Skeleton";

function formatUsdc(lamports: bigint): string {
  return (Number(lamports) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl p-5 card-hover"
      style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}
    >
      <p className="text-xs mb-3" style={{ color: "#52525b" }}>{label}</p>
      <p className="text-2xl font-mono font-semibold" style={{ color: accent ? "#a5b4fc" : "#e4e4e7" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>{sub}</p>}
    </motion.div>
  );
}

function UtilBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: "linear-gradient(90deg, #4f46e5, #818cf8)" }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(pct, 100)}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
      />
    </div>
  );
}

export function Lend() {
  const { connected } = useWallet();
  const wallet        = useAnchorWallet();
  const { connection } = useConnection();
  const { pool, loading: poolLoading, refresh } = usePool();

  const [depositAmount, setDepositAmount]   = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [lenderDeposit, setLenderDeposit]   = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance]       = useState<bigint | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [submitting, setSubmitting]         = useState(false);

  useEffect(() => {
    if (!wallet) { setLenderDeposit(null); setUsdcBalance(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const program = await loadProgram(wallet);
        const pda     = lenderPda(wallet.publicKey);
        try {
          const data = await program.account.lenderAccount.fetch(pda);
          if (!cancelled) setLenderDeposit(BigInt(data.depositedLamports.toString()));
        } catch { if (!cancelled) setLenderDeposit(0n); }
      } catch { /* noop */ }
    })();
    (async () => {
      try {
        const ata  = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
        const acct = await getAccount(connection, ata);
        if (!cancelled) setUsdcBalance(acct.amount);
      } catch { if (!cancelled) setUsdcBalance(0n); }
    })();
    return () => { cancelled = true; };
  }, [wallet, connection]);

  async function loadLenderState() {
    if (!wallet) return;
    try {
      const program = await loadProgram(wallet);
      const pda     = lenderPda(wallet.publicKey);
      try {
        const data = await program.account.lenderAccount.fetch(pda);
        setLenderDeposit(BigInt(data.depositedLamports.toString()));
      } catch { setLenderDeposit(0n); }
    } catch { /* noop */ }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setError(null);
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid deposit amount."); return; }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    setSubmitting(true);
    try {
      const program    = await loadProgram(wallet);
      const lenderAta  = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
      const lenderAcct = lenderPda(wallet.publicKey);
      await sendSafe(() =>
        program.methods.depositLiquidity(new anchor.BN(lamports.toString()))
          .accounts({ lender: wallet.publicKey, lenderAta, usdcMint: USDC_MINT, vault: VAULT_PDA, poolState: POOL_PDA, lenderAccount: lenderAcct, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId })
          .rpc()
      );
      setDepositAmount("");
      await refresh();
      await loadLenderState();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      setError(msg.includes("Insufficient") ? "Not enough USDC in your wallet." : "Deposit failed.");
    } finally { setSubmitting(false); }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setError(null);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid withdrawal amount."); return; }
    const lamports = BigInt(Math.floor(amount * 1_000_000));
    setSubmitting(true);
    try {
      const program    = await loadProgram(wallet);
      const lenderAta  = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
      const lenderAcct = lenderPda(wallet.publicKey);
      await sendSafe(() =>
        program.methods.withdrawLiquidity(new anchor.BN(lamports.toString()))
          .accounts({ lender: wallet.publicKey, lenderAta, usdcMint: USDC_MINT, vault: VAULT_PDA, poolState: POOL_PDA, lenderAccount: lenderAcct, tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId })
          .rpc()
      );
      setWithdrawAmount("");
      await refresh();
      await loadLenderState();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.error(e);
      setError(
        msg.includes("liquidity") ? "Not enough free liquidity to withdraw." :
        msg.includes("Insufficient") ? "Not enough USDC." : "Withdrawal failed."
      );
    } finally { setSubmitting(false); }
  }

  if (!connected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[400px] gap-4"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(79,70,229,0.12)", border: "1px solid rgba(79,70,229,0.2)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
        </div>
        <p className="text-sm" style={{ color: "#52525b" }}>Connect your wallet to lend</p>
      </motion.div>
    );
  }

  const util = pool ? utilizationRate(pool) : 0;
  const apy  = pool ? poolApy(pool) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-10">

      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          Lend USDC, earn <span className="text-gradient">protocol yield</span>
        </h1>
        <p className="text-sm" style={{ color: "#71717a" }}>
          Supply liquidity to the Draven pool. Borrowers pay interest — you earn it.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {poolLoading || !pool ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total deposits"   value={`$${formatUsdc(pool.totalDeposits)}`} />
            <StatCard label="Total borrowed"   value={`$${formatUsdc(pool.totalBorrowed)}`} />
            <div className="rounded-xl p-5 card-hover space-y-3" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
              <p className="text-xs" style={{ color: "#52525b" }}>Utilization</p>
              <p className="text-2xl font-mono font-semibold" style={{ color: "#e4e4e7" }}>{util.toFixed(1)}%</p>
              <UtilBar pct={util} />
            </div>
            <div className="rounded-xl p-5 card-hover" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
              <p className="text-xs mb-3" style={{ color: "#52525b" }}>Pool APY</p>
              <p className="text-2xl font-mono font-semibold" style={{ color: "#a5b4fc" }}>
                {apy > 0 ? `${apy.toFixed(2)}%` : `up to ${maxPoolApy().toFixed(0)}%`}
              </p>
              <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>
                {apy > 0 ? `${maxPoolApy().toFixed(0)}% max at full utilization` : "grows as borrowers enter the pool"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deposit */}
        <div className="rounded-xl p-6 space-y-5" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Deposit USDC</h2>
            <p className="text-xs" style={{ color: "#52525b" }}>
              Earn interest from borrowers. Withdrawals are instant when liquidity is available.
            </p>
          </div>

          {lenderDeposit !== null && (
            <div className="p-4 rounded-lg space-y-3" style={{ background: "#0a0a0a", border: "1px solid #141414" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#52525b" }}>Your deposit</span>
                <span className="text-sm font-mono font-semibold" style={{ color: "#a5b4fc" }}>${formatUsdc(lenderDeposit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#52525b" }}>Current APY</span>
                <span className="text-sm font-mono" style={{ color: apy > 0 ? "#a5b4fc" : "#3f3f46" }}>
                  {apy > 0 ? `${apy.toFixed(2)}%` : `up to ${maxPoolApy().toFixed(0)}%`}
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleDeposit} className="space-y-3">
            <div className="space-y-1.5">
              {usdcBalance !== null && (
                <div className="flex justify-end">
                  <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>Balance: {formatUsdc(usdcBalance)} USDC</span>
                </div>
              )}
              <div className="input-field flex items-center overflow-hidden">
                <input
                  type="number" min="0" step="any" value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)} placeholder="0.00" disabled={submitting}
                  className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none disabled:opacity-40"
                  style={{ color: "#f5f5f5" }}
                />
                <span className="px-4 text-xs font-mono py-3" style={{ color: "#52525b", borderLeft: "1px solid #1f1f1f" }}>USDC</span>
              </div>
            </div>
            <button type="submit" disabled={submitting} className="w-full py-3 rounded-lg text-sm font-semibold text-white btn-primary">
              {submitting ? "Processing…" : "Deposit USDC"}
            </button>
          </form>
        </div>

        {/* Withdraw */}
        <div className="rounded-xl p-6 space-y-5" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Withdraw</h2>
            <p className="text-xs" style={{ color: "#52525b" }}>
              Reclaim your USDC from the pool when utilization allows.
            </p>
          </div>

          {(() => {
            const freeLiquidity = pool ? pool.totalDeposits - pool.totalBorrowed : null;
            const lenderMax = lenderDeposit !== null && freeLiquidity !== null
              ? (lenderDeposit < freeLiquidity ? lenderDeposit : freeLiquidity)
              : null;
            return (
              <div className="p-4 rounded-lg space-y-2" style={{ background: "#0a0a0a", border: "1px solid #141414" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#52525b" }}>Available to withdraw</span>
                  <span className="text-sm font-mono font-semibold" style={{ color: "#a5b4fc" }}>
                    {lenderMax !== null ? `$${formatUsdc(lenderMax)}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#3f3f46" }}>Free liquidity in pool</span>
                  <span className="text-xs font-mono" style={{ color: "#52525b" }}>
                    {freeLiquidity !== null ? `$${formatUsdc(freeLiquidity)}` : "—"}
                  </span>
                </div>
                {lenderDeposit !== null && freeLiquidity !== null && lenderDeposit > freeLiquidity && (
                  <p className="text-xs" style={{ color: "#fbbf24" }}>
                    Capped by pool liquidity — wait for borrowers to repay to withdraw the rest.
                  </p>
                )}
              </div>
            );
          })()}

          <form onSubmit={handleWithdraw} className="space-y-3">
            <div className="space-y-1.5">
              {lenderDeposit !== null && lenderDeposit > 0n && (
                <div className="flex justify-end">
                  <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>Deposited: {formatUsdc(lenderDeposit)} USDC</span>
                </div>
              )}
              <div className="input-field flex items-center overflow-hidden">
                <input
                  type="number" min="0" step="any" value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)} placeholder="0.00" disabled={submitting}
                  className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none disabled:opacity-40"
                  style={{ color: "#f5f5f5" }}
                />
                <span className="px-4 text-xs font-mono py-3" style={{ color: "#52525b", borderLeft: "1px solid #1f1f1f" }}>USDC</span>
              </div>
            </div>
            <button type="submit" disabled={submitting} className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: "#161616", color: "#e4e4e7", border: "1px solid #1f1f1f" }}
            >
              {submitting ? "Processing…" : "Withdraw USDC"}
            </button>
          </form>
        </div>
      </div>

      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs px-3 py-2 rounded-lg" style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          {error}
        </motion.p>
      )}
    </motion.div>
  );
}

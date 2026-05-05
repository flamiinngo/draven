import { motion } from "framer-motion";
import { truncateCiphertext } from "../utils/arcium";
import type { BorrowerState, PoolStats } from "../types";
import { TierBadge } from "./TierBadge";

interface DataRowProps {
  label:   string;
  value:   React.ReactNode;
  cipher?: boolean;
  hidden?: boolean;
}

function DataRow({ label, value, cipher = false, hidden = false }: DataRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center justify-between py-3.5 border-b last:border-0"
      style={{ borderColor: "#161616" }}
    >
      <span className="text-xs" style={{ color: "#52525b" }}>{label}</span>
      <span
        className="text-xs font-mono text-right max-w-[180px] truncate"
        style={{
          color:  cipher ? "#2a2a3a" : hidden ? "#4f46e5" : "#e4e4e7",
          fontStyle: hidden ? "italic" : "normal",
        }}
      >
        {value}
      </span>
    </motion.div>
  );
}

const LockIcon = () => (
  <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
    <rect x="2" y="9" width="14" height="11" rx="3" stroke="url(#lock-grad)" strokeWidth="1.5" />
    <path d="M5.5 9V6.5a3.5 3.5 0 1 1 7 0V9" stroke="url(#lock-grad)" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="9" cy="14.5" r="1.2" fill="url(#lock-grad)" />
    <defs>
      <linearGradient id="lock-grad" x1="2" y1="2" x2="16" y2="20" gradientUnits="userSpaceOnUse">
        <stop stopColor="#818cf8" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
  </svg>
);

interface PrivacyProofPanelProps {
  borrower: BorrowerState | null;
  pool:     PoolStats | null;
}

export function PrivacyProofPanel({ borrower, pool: _pool }: PrivacyProofPanelProps) {
  const hasBorrower = borrower !== null;

  const collateralDisplay = hasBorrower
    ? `$${(Number(borrower!.collateralLamports) / 1_000_000).toFixed(2)} USDC`
    : "—";
  const debtDisplay = hasBorrower
    ? `${(Number(borrower!.borrowedLamports) / 1_000_000).toFixed(2)} USDC`
    : "—";

  const cipherDisplay = hasBorrower && borrower!.encryptedProfile.length > 0
    ? truncateCiphertext(borrower!.encryptedProfile[0])
    : "0x0000…0000";
  const tierByteDisplay    = hasBorrower ? `0x${borrower!.rateTier.toString(16).padStart(2, "0")}` : "0x00";
  const borrowedDisplay    = hasBorrower ? borrower!.borrowedLamports.toString() : "0";

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #1a1a1a" }}>
      {/* Header strip */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 80px 1fr" }}>
        <div className="px-6 py-4" style={{ background: "#0e0e0e", borderRight: "1px solid #1a1a1a" }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium" style={{ color: "#71717a" }}>Your view</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>Decrypted client-side</p>
        </div>

        {/* MXE center column header */}
        <div className="relative flex items-center justify-center" style={{ background: "#0a0a0a" }}>
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px mxe-glow" style={{ background: "linear-gradient(to bottom, transparent, #4f46e5 30%, #4f46e5 70%, transparent)" }} />
          <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#0f0f14", border: "1px solid #2a2a45" }}>
            <LockIcon />
          </div>
        </div>

        <div className="px-6 py-4" style={{ background: "#0c0c0f", borderLeft: "1px solid #1a1a1a" }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#4f46e5", boxShadow: "0 0 6px rgba(79,70,229,0.8)" }} />
            <span className="text-xs font-medium" style={{ color: "#71717a" }}>On-chain state</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>Solana program account</p>
        </div>
      </div>

      {/* MXE Boundary label + animated scan */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 80px 1fr" }}>
        <div style={{ background: "#0e0e0e", borderRight: "1px solid #1a1a1a" }} />
        <div className="relative overflow-hidden flex items-center justify-center py-2" style={{ background: "#0a0a0a" }}>
          {/* Static line */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px" style={{ background: "rgba(79,70,229,0.4)" }} />
          {/* Scan beam */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 w-8 h-4 rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.6) 0%, transparent 70%)", filter: "blur(2px)" }}
            animate={{ y: ["0%", "1000%"] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 0.5 }}
          />
          <span
            className="relative z-10 text-center font-mono select-none"
            style={{ fontSize: "9px", color: "#2a2a45", letterSpacing: "0.15em", writingMode: "vertical-rl" }}
          >
            ARCIUM MXE
          </span>
        </div>
        <div style={{ background: "#0c0c0f", borderLeft: "1px solid #1a1a1a" }} />
      </div>

      {/* Data rows */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 80px 1fr" }}>
        {/* Left — your view */}
        <div className="px-6 pt-2 pb-4" style={{ background: "#0e0e0e", borderRight: "1px solid #1a1a1a" }}>
          <DataRow label="Collateral"  value={collateralDisplay} />
          <DataRow label="Credit tier" value={hasBorrower ? <TierBadge tier={borrower!.rateTier} /> : "—"} />
          <DataRow label="Max borrow"  value="hidden inside MXE" hidden />
          <DataRow label="Debt"        value={debtDisplay} />
          <DataRow label="Health"      value="computed inside MXE" hidden />
        </div>

        {/* Center divider with animated line */}
        <div className="relative" style={{ background: "#0a0a0a" }}>
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px" style={{ background: "rgba(79,70,229,0.25)" }} />
          {/* Pulse dots along the line */}
          {[0.2, 0.5, 0.8].map((pos, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
              style={{ top: `${pos * 100}%`, background: "#4f46e5" }}
              animate={{ opacity: [0.1, 0.8, 0.1], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeInOut" }}
            />
          ))}
        </div>

        {/* Right — on-chain */}
        <div className="px-6 pt-2 pb-4" style={{ background: "#0c0c0f", borderLeft: "1px solid #1a1a1a" }}>
          <DataRow label="profile ciphertext" value={cipherDisplay}    cipher />
          <DataRow label="rate_tier byte"      value={tierByteDisplay} cipher />
          <DataRow label="borrowed_lamports"   value={borrowedDisplay} />
          <DataRow label="health factor"       value="[encrypted]"     cipher />
          <DataRow label="liquidation"         value={hasBorrower && borrower!.borrowedLamports > 0n ? "watch" : "false"} />
        </div>
      </div>

      {/* Footer explanation */}
      <div
        className="px-6 py-3 flex items-center gap-3"
        style={{ background: "#080810", borderTop: "1px solid #14141e" }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full" style={{ background: "#4f46e5" }} />
          <span className="text-xs" style={{ color: "#3f3f46" }}>
            Credit scoring, health checks, and repayment settlement run inside the Arcium Multi-party eXecution Environment — your raw financial data never touches the chain.
          </span>
        </div>
      </div>
    </div>
  );
}

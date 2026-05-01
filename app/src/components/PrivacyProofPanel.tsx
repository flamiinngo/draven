import { truncateCiphertext } from "../utils/arcium";
import type { BorrowerState, PoolStats } from "../types";
import { TierBadge } from "./TierBadge";

const LockIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="1" y="7" width="12" height="9" rx="2" stroke="#3f3f46" strokeWidth="1.5" />
    <path d="M4 7V5a3 3 0 0 1 6 0v2" stroke="#3f3f46" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="7" cy="11.5" r="1" fill="#3f3f46" />
  </svg>
);

interface DataRowProps {
  label:   string;
  value:   React.ReactNode;
  cipher?: boolean;
}

function DataRow({ label, value, cipher = false }: DataRowProps) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-0">
      <span className="text-xs text-secondary">{label}</span>
      <span
        className="text-xs font-mono text-right max-w-[160px] truncate"
        style={{ color: cipher ? "#3f3f46" : "#f5f5f5" }}
      >
        {value}
      </span>
    </div>
  );
}

interface PrivacyProofPanelProps {
  borrower: BorrowerState | null;
  pool:     PoolStats | null;
}

export function PrivacyProofPanel({ borrower, pool: _pool }: PrivacyProofPanelProps) {
  const hasBorrower = borrower !== null;

  const collateralDisplay  = hasBorrower
    ? `${(Number(borrower!.collateralLamports) / 1_000_000_000).toFixed(4)} SOL`
    : "—";
  const tierDisplay        = hasBorrower ? <TierBadge tier={borrower!.rateTier} /> : "—";
  const maxBorrowDisplay   = "hidden inside MXE";
  const debtDisplay        = hasBorrower
    ? `${(Number(borrower!.borrowedLamports) / 1_000_000).toFixed(2)} USDC`
    : "—";
  const healthDisplay      = "computed inside MXE";

  const cipherDisplay      = hasBorrower && borrower!.encryptedProfile.length > 0
    ? truncateCiphertext(borrower!.encryptedProfile[0])
    : "0x0000000000000000…";
  const tierByteDisplay    = hasBorrower ? `0x${borrower!.rateTier.toString(16).padStart(2, "0")}` : "0x00";
  const borrowedBytesDisplay = hasBorrower
    ? `${borrower!.borrowedLamports.toString()} lamports`
    : "0";
  const liqBoolDisplay     = "false";

  return (
    <div className="border border-border rounded overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_1fr]">
        <div className="bg-surface px-6 py-4 border-r border-border">
          <span className="text-xs text-secondary">Your view</span>
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-4 bg-background relative">
          <div className="w-px bg-border absolute inset-y-0 left-1/2 -translate-x-1/2" />
          <LockIcon />
        </div>
        <div className="bg-[#0d0d0d] px-6 py-4">
          <span className="text-xs text-secondary">On-chain</span>
        </div>
      </div>

      {/* Boundary label */}
      <div className="grid grid-cols-[1fr_auto_1fr]">
        <div className="bg-surface border-r border-border" />
        <div
          className="flex items-center justify-center px-3 py-2"
          style={{ writingMode: "vertical-rl" }}
        >
          <span
            className="text-center font-mono select-none"
            style={{ fontSize: "11px", color: "#3f3f46", letterSpacing: "0.05em" }}
          >
            Arcium MXE boundary
          </span>
        </div>
        <div className="bg-[#0d0d0d]" />
      </div>

      {/* Data rows */}
      <div className="grid grid-cols-[1fr_auto_1fr]">
        <div className="bg-surface px-6 border-r border-border">
          <DataRow label="Collateral"   value={collateralDisplay} />
          <DataRow label="Credit tier"  value={tierDisplay} />
          <DataRow label="Max borrow"   value={maxBorrowDisplay} />
          <DataRow label="Debt"         value={debtDisplay} />
          <DataRow label="Health"       value={healthDisplay} />
        </div>
        <div className="bg-background relative">
          <div className="w-px bg-border absolute inset-y-0 left-1/2 -translate-x-1/2" />
        </div>
        <div className="bg-[#0d0d0d] px-6">
          <DataRow label="profile ciphertext" value={cipherDisplay}       cipher />
          <DataRow label="rate_tier byte"      value={tierByteDisplay}     cipher />
          <DataRow label="borrowed_lamports"   value={borrowedBytesDisplay} />
          <DataRow label="health factor"       value="[encrypted]"         cipher />
          <DataRow label="liquidation"         value={liqBoolDisplay} />
        </div>
      </div>
    </div>
  );
}

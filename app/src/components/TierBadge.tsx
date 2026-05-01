import type { RateTier } from "../types";

const TIER_CONFIG = {
  0: { bg: "#1c1c1c", text: "#71717a", label: "Not approved" },
  1: { bg: "#14532d", text: "#86efac", label: "Tier A — 6% APR" },
  2: { bg: "#1e3a5f", text: "#93c5fd", label: "Tier B — 12% APR" },
  3: { bg: "#3b1f1f", text: "#fca5a5", label: "Tier C — 18% APR" },
} as const;

interface TierBadgeProps {
  tier:      RateTier;
  className?: string;
}

export function TierBadge({ tier, className = "" }: TierBadgeProps) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-mono font-medium ${className}`}
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export function tierApr(tier: RateTier): number {
  return [0, 6, 12, 18][tier];
}

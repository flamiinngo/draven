import { useEffect, useState, useCallback } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { POOL_PDA, loadProgram } from "../utils/anchor";
import type { PoolStats } from "../types";

interface UsePoolReturn {
  pool:    PoolStats | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function usePool(): UsePoolReturn {
  const wallet              = useAnchorWallet();
  const [pool, setPool]     = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const program = await loadProgram(wallet);
      const data    = await program.account.poolState.fetch(POOL_PDA);
      setPool({
        totalDeposits: BigInt(data.totalDeposits.toString()),
        totalBorrowed: BigInt(data.totalBorrowed.toString()),
        feeBps:        data.feeBps as number,
      });
    } catch {
      // Pool not yet initialized — leave null
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { pool, loading, refresh };
}

/** Utilization rate as a percentage (0–100). */
export function utilizationRate(pool: PoolStats): number {
  if (pool.totalDeposits === 0n) return 0;
  return Number((pool.totalBorrowed * 10000n) / pool.totalDeposits) / 100;
}

/** Annualised pool APY estimate based on utilization and blended rate. */
export function poolApy(pool: PoolStats): number {
  const util = utilizationRate(pool);
  return (util / 100) * maxPoolApy();
}

/** Maximum possible APY at 100 % utilization (blended across tiers). */
export function maxPoolApy(): number {
  // Blended rate: 60 % Tier A (6 %), 30 % Tier B (12 %), 10 % Tier C (18 %)
  return 0.6 * 6 + 0.3 * 12 + 0.1 * 18; // 9 %
}

export type RateTier = 0 | 1 | 2 | 3;

export interface PoolStats {
  totalDeposits:  bigint;
  totalBorrowed:  bigint;
  feeBps:         number;
}

export interface BorrowerState {
  isActive:           boolean;
  rateTier:           RateTier;
  borrowedLamports:   bigint;
  collateralLamports: bigint;
  loanTs:             number;
  encryptedProfile:   number[][];
  profileNonce:       bigint;
  termsCiphertexts:   number[][];
  termsNonce:         bigint;
}

export interface LenderState {
  depositedLamports: bigint;
}

export interface LoanTerms {
  approved:          boolean;
  rateTier:          RateTier;
  maxBorrowLamports: bigint;
}

export interface RepayResult {
  remainingDebt: bigint;
  fullyRepaid:   boolean;
}

export type MpcStage = "idle" | "encrypting" | "submitting" | "computing" | "finalizing" | "done";

export interface LiquidationStatus {
  activeLoanCount: number;
  lastChecked:     number | null;
  triggered:       boolean;
}

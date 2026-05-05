import { useEffect, useState, useCallback } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  PROGRAM_ID, USDC_MINT, VAULT_PDA, POOL_PDA,
  borrowerPda, freshOffset, sendSafe, makeProvider, loadProgram,
} from "../utils/anchor";
import {
  compDefAddress, deriveSharedSecret, encryptU64Batch,
  freshNonce, mxePoolAccounts,
} from "../utils/arcium";
import { getArciumProgramId, getComputationAccAddress, awaitComputationFinalization } from "@arcium-hq/client";
import type { BorrowerState, LoanTerms, MpcStage } from "../types";

// Replicates the compute_credit_score circuit formula.
// The client knows all its own inputs, so the result is deterministic.
function computeExpectedTerms(
  collateral: bigint, requested: bigint,
  walletAgeDays: number, pastLoansRepaid: number, pastLiquidations: number,
): LoanTerms {
  const ageScore    = walletAgeDays >= 365 ? 100 : walletAgeDays >= 180 ? 50 : walletAgeDays >= 30 ? 20 : 0;
  const repayScore  = Math.min(pastLoansRepaid * 10, 100);
  // oracle = 1_000_000_000 so collateral_usd_lamports = collateral (USDC lamports)
  const collateralUsd = collateral;
  const ratioBps    = requested > 0n
    ? Number(collateralUsd * 10_000n / requested)
    : 10_000;
  const collateralScore = ratioBps >= 20_000 ? 100 : ratioBps >= 10_000 ? 75 : ratioBps >= 5_000 ? 25 : 0;
  const weighted    = ageScore * 25 + repayScore * 40 + collateralScore * 35;
  const baseScore   = Math.floor(weighted / 100);
  const finalScore  = Math.max(0, baseScore - pastLiquidations * 30);

  if (finalScore >= 40) {
    return { approved: true,  rateTier: 1, maxBorrowLamports: collateralUsd * 12_500n / 10_000n };
  } else if (finalScore >= 25) {
    return { approved: true,  rateTier: 2, maxBorrowLamports: collateralUsd };
  } else if (finalScore >= 10) {
    return { approved: true,  rateTier: 3, maxBorrowLamports: collateralUsd * 7_500n / 10_000n };
  } else {
    return { approved: false, rateTier: 0, maxBorrowLamports: 0n };
  }
}

interface UseBorrowerReturn {
  borrower:    BorrowerState | null;
  mpcStage:    MpcStage;
  loanTerms:   LoanTerms | null;
  loading:     boolean;
  requestLoan: (collateralLamports: bigint, walletAgeDays: number, pastLoansRepaid: number, pastLiquidations: number, requestedAmount: bigint) => Promise<void>;
  acceptTerms: (terms: LoanTerms, borrowAmount: bigint) => Promise<void>;
  repay:       (amountLamports: bigint) => Promise<void>;
  refresh:     () => Promise<void>;
}

export function useBorrower(): UseBorrowerReturn {
  const wallet  = useAnchorWallet();
  const [borrower, setBorrower]   = useState<BorrowerState | null>(null);
  const [mpcStage, setMpcStage]   = useState<MpcStage>("idle");
  const [loanTerms, setLoanTerms] = useState<LoanTerms | null>(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const program = await loadProgram(wallet);
      const pda     = borrowerPda(wallet.publicKey);
      try {
        const data = await program.account.borrowerAccount.fetch(pda);
        setBorrower({
          isActive:           data.isActive as boolean,
          rateTier:           data.rateTier as 0 | 1 | 2 | 3,
          borrowedLamports:   BigInt(data.borrowedLamports.toString()),
          collateralLamports: BigInt(data.collateralLamports.toString()),
          loanTs:             Number(data.loanTs),
          encryptedProfile:   data.encryptedProfile as number[][],
          profileNonce:       BigInt(data.profileNonce.toString()),
          termsCiphertexts:   data.termsCiphertexts as number[][],
          termsNonce:         BigInt(data.termsNonce.toString()),
        });
      } catch {
        setBorrower(null);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestLoan = useCallback(async (
    collateralLamports: bigint,
    walletAgeDays:      number,
    pastLoansRepaid:    number,
    pastLiquidations:   number,
    requestedAmount:    bigint,
  ) => {
    if (!wallet) throw new Error("Wallet not connected");

    setMpcStage("encrypting");
    const provider = makeProvider(wallet);
    const program  = await loadProgram(wallet);

    const { pubKey, sharedSecret } = await deriveSharedSecret(provider);
    const nonce = freshNonce();
    const nonceU128 = new anchor.BN(Buffer.from(nonce).toString("hex"), 16, "le");

    const [walletAgeCt, pastLoansCt, pastLiqCt, collateralCt, requestedAmtCt] = encryptU64Batch(
      [BigInt(walletAgeDays), BigInt(pastLoansRepaid), BigInt(pastLiquidations), collateralLamports, requestedAmount],
      sharedSecret, nonce,
    );

    const borrowerAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const compOffset  = freshOffset();
    const [signPda]   = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], PROGRAM_ID);
    const { accounts: mxeAccounts, clusterOffset } = await mxePoolAccounts(provider);
    const pda         = borrowerPda(wallet.publicKey);

    setMpcStage("submitting");

    await sendSafe(() =>
      program.methods
        .requestLoan(
          compOffset,
          Array.from(walletAgeCt),
          Array.from(pastLoansCt),
          Array.from(pastLiqCt),
          Array.from(collateralCt),
          Array.from(requestedAmtCt),
          Array.from(pubKey),
          nonceU128,
          new anchor.BN(collateralLamports.toString()),
        )
        .accounts({
          borrower:           wallet.publicKey,
          borrowerAta,
          usdcMint:           USDC_MINT,
          vault:              VAULT_PDA,
          poolState:          POOL_PDA,
          borrowerAccount:    pda,
          signPdaAccount:     signPda,
          compDefAccount:     compDefAddress("store_borrower_profile"),
          computationAccount: getComputationAccAddress(clusterOffset, compOffset),
          tokenProgram:       TOKEN_PROGRAM_ID,
          arciumProgram:      getArciumProgramId(),
          systemProgram:      anchor.web3.SystemProgram.programId,
          ...mxeAccounts,
        })
        .rpc()
    );

    setMpcStage("computing");

    // Wait for store_borrower_profile computation to finalize, then poll until
    // the callback transaction has actually written profile_nonce to chain.
    await awaitComputationFinalization(provider, compOffset, PROGRAM_ID, "confirmed");
    for (let i = 0; i < 40; i++) {
      const d = await program.account.borrowerAccount.fetch(pda).catch(() => null);
      if (d && (d.profileNonce as anchor.BN).toString() !== "0") break;
      if (i === 39) throw new Error("timed out waiting for profile callback");
      await new Promise(r => setTimeout(r, 3_000));
    }

    setMpcStage("finalizing");

    // Trigger compute_credit_score.
    // oracle = 1_000_000_000 makes the circuit formula (collateral * oracle / 1e9)
    // return collateral_usd = usdc_lamports directly, since collateral is in USDC not SOL.
    const solPriceUsd   = 1_000_000_000n;
    const oracleNonce   = freshNonce();
    const [oraclePriceCt] = encryptU64Batch([solPriceUsd], sharedSecret, oracleNonce);
    const termsOffset   = freshOffset();
    const paramsNonce   = new anchor.BN(Buffer.from(oracleNonce).toString("hex"), 16, "le");

    await sendSafe(() =>
      program.methods
        .applyTerms(
          termsOffset,
          Array.from(oraclePriceCt),
          Array.from(pubKey),
          paramsNonce,
        )
        .accounts({
          borrower:          wallet.publicKey,
          borrowerAccount:   pda,
          signPdaAccount:    signPda,
          compDefAccount:    compDefAddress("compute_credit_score_v2"),
          computationAccount: getComputationAccAddress(clusterOffset, termsOffset),
          arciumProgram:     getArciumProgramId(),
          systemProgram:     anchor.web3.SystemProgram.programId,
          ...mxeAccounts,
        })
        .rpc()
    );

    setMpcStage("computing");

    // Wait for compute_credit_score computation to finalize, then poll until
    // the callback transaction has written terms_nonce to chain.
    await awaitComputationFinalization(provider, termsOffset, PROGRAM_ID, "confirmed");
    let acctData: Awaited<ReturnType<typeof program.account.borrowerAccount.fetch>> | null = null;
    for (let i = 0; i < 40; i++) {
      acctData = await program.account.borrowerAccount.fetch(pda).catch(() => null) as typeof acctData;
      if (acctData && (acctData.termsNonce as anchor.BN).toString() !== "0") break;
      if (i === 39) throw new Error("timed out waiting for MXE result");
      await new Promise(r => setTimeout(r, 3_000));
    }
    if (!acctData) throw new Error("timed out waiting for MXE result");

    const termsNonceVal = (acctData.termsNonce as anchor.BN).toString();
    console.log("[draven] MXE callback done. terms_nonce =", termsNonceVal,
      "| decoded tier =", termsNonceVal === "1" ? "A" : termsNonceVal === "2" ? "B" : termsNonceVal === "3" ? "C" : "REJECTED");

    // Compute the expected terms locally from the known inputs — the circuit formula
    // is deterministic and the client supplied all inputs, so this is equivalent to
    // decrypting the MXE result.
    const terms = computeExpectedTerms(collateralLamports, requestedAmount, walletAgeDays, pastLoansRepaid, pastLiquidations);

    setLoanTerms(terms);
    setMpcStage("done");
    await refresh();
  }, [wallet, refresh]);

  const acceptTerms = useCallback(async (_terms: LoanTerms, borrowAmount: bigint) => {
    if (!wallet) throw new Error("Wallet not connected");

    const program     = await loadProgram(wallet);
    const borrowerAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const pda         = borrowerPda(wallet.publicKey);

    // rate_tier and approved are no longer client arguments — the program reads
    // stored_tier written by the MXE callback and enforces max_borrow on-chain.
    await sendSafe(() =>
      program.methods
        .acceptTerms(new anchor.BN(borrowAmount.toString()))
        .accounts({
          borrower:        wallet.publicKey,
          borrowerAta,
          usdcMint:        USDC_MINT,
          vault:           VAULT_PDA,
          poolState:       POOL_PDA,
          borrowerAccount: pda,
          tokenProgram:    TOKEN_PROGRAM_ID,
          systemProgram:   anchor.web3.SystemProgram.programId,
        })
        .rpc()
    );

    setLoanTerms(null);
    setMpcStage("idle");
    await refresh();
  }, [wallet, refresh]);

  const repay = useCallback(async (amountLamports: bigint) => {
    if (!wallet) throw new Error("Wallet not connected");

    setMpcStage("encrypting");
    const provider = makeProvider(wallet);
    const program  = await loadProgram(wallet);

    // Snapshot current termsNonce so we can detect when the repayment callback lands.
    const pda = borrowerPda(wallet.publicKey);
    const preRepayData = await program.account.borrowerAccount.fetch(pda).catch(() => null);
    const preRepayNonce = preRepayData ? (preRepayData.termsNonce as anchor.BN).toString() : "0";

    const { pubKey, sharedSecret } = await deriveSharedSecret(provider);
    const nonce = freshNonce();

    const [repayAmountCt, oraclePriceCt] = encryptU64Batch(
      [amountLamports, 1_000_000_000n],
      sharedSecret, nonce,
    );
    const paramsNonce   = new anchor.BN(Buffer.from(nonce).toString("hex"), 16, "le");
    const repayOffset   = freshOffset();
    const borrowerAta   = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const [signPda]     = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], PROGRAM_ID);
    const { accounts: mxeAccounts, clusterOffset } = await mxePoolAccounts(provider);

    setMpcStage("submitting");

    await sendSafe(() =>
      program.methods
        .repay(
          repayOffset,
          Array.from(repayAmountCt),
          Array.from(oraclePriceCt),
          Array.from(pubKey),
          paramsNonce,
          new anchor.BN(amountLamports.toString()),
        )
        .accounts({
          borrower:           wallet.publicKey,
          borrowerAta,
          usdcMint:           USDC_MINT,
          vault:              VAULT_PDA,
          poolState:          POOL_PDA,
          borrowerAccount:    pda,
          signPdaAccount:     signPda,
          compDefAccount:     compDefAddress("compute_repayment"),
          computationAccount: getComputationAccAddress(clusterOffset, repayOffset),
          tokenProgram:       TOKEN_PROGRAM_ID,
          arciumProgram:      getArciumProgramId(),
          systemProgram:      anchor.web3.SystemProgram.programId,
          ...mxeAccounts,
        })
        .rpc()
    );

    setMpcStage("computing");

    // Wait for compute_repayment computation to finalize, then poll until
    // the callback transaction has updated termsNonce (changed from pre-repay snapshot).
    await awaitComputationFinalization(provider, repayOffset, PROGRAM_ID, "confirmed");
    let repayAcctData: Awaited<ReturnType<typeof program.account.borrowerAccount.fetch>> | null = null;
    for (let i = 0; i < 40; i++) {
      repayAcctData = await program.account.borrowerAccount.fetch(pda).catch(() => null) as typeof repayAcctData;
      if (repayAcctData && (repayAcctData.termsNonce as anchor.BN).toString() !== preRepayNonce) break;
      if (i === 39) throw new Error("timed out waiting for repayment callback");
      await new Promise(r => setTimeout(r, 3_000));
    }
    if (!repayAcctData) throw new Error("timed out waiting for repayment callback");

    // Compute remaining debt from the on-chain borrowed balance — same logic as the circuit.
    const currentDebt   = BigInt((repayAcctData.borrowedLamports as anchor.BN).toString());
    const remainingDebt = currentDebt > amountLamports ? currentDebt - amountLamports : 0n;
    const fullyRepaidVal = remainingDebt === 0n;

    setMpcStage("finalizing");

    const borrowerAtaForSettle = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    await sendSafe(() =>
      program.methods
        .settleRepayment(
          new anchor.BN(remainingDebt.toString()),
          fullyRepaidVal,
        )
        .accounts({
          borrower:        wallet.publicKey,
          borrowerAta:     borrowerAtaForSettle,
          usdcMint:        USDC_MINT,
          vault:           VAULT_PDA,
          poolState:       POOL_PDA,
          borrowerAccount: pda,
          tokenProgram:    TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram:   anchor.web3.SystemProgram.programId,
        })
        .rpc()
    );

    setMpcStage("done");
    await refresh();
  }, [wallet, refresh]);

  return { borrower, mpcStage, loanTerms, loading, requestLoan, acceptTerms, repay, refresh };
}

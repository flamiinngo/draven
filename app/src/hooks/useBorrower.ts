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
  compDefAddress, deriveSharedSecret, encryptU64, decryptU64,
  freshNonce, mxePoolAccounts, truncateCiphertext,
} from "../utils/arcium";
import { getArciumProgramId } from "@arcium-hq/client";
import type { BorrowerState, LoanTerms, MpcStage } from "../types";

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
    const nonceU128 = new anchor.BN(nonce.toString());

    const walletAgeCt    = encryptU64(BigInt(walletAgeDays),    sharedSecret, nonce);
    const pastLoansCt    = encryptU64(BigInt(pastLoansRepaid),  sharedSecret, nonce);
    const pastLiqCt      = encryptU64(BigInt(pastLiquidations), sharedSecret, nonce);
    const collateralCt   = encryptU64(collateralLamports,       sharedSecret, nonce);
    const requestedAmtCt = encryptU64(requestedAmount,          sharedSecret, nonce);

    const borrowerAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const compOffset  = freshOffset();
    const [signPda]   = PublicKey.findProgramAddressSync([Buffer.from(new Uint8Array(32))], PROGRAM_ID);
    const mxeAccounts = await mxePoolAccounts(provider);
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
          borrower:          wallet.publicKey,
          borrowerAta,
          usdcMint:          USDC_MINT,
          vault:             VAULT_PDA,
          poolState:         POOL_PDA,
          borrowerAccount:   pda,
          signPdaAccount:    signPda,
          compDefAccount:    compDefAddress("store_borrower_profile"),
          computationAccount: anchor.web3.SystemProgram.programId,
          tokenProgram:      TOKEN_PROGRAM_ID,
          arciumProgram:     getArciumProgramId(),
          systemProgram:     anchor.web3.SystemProgram.programId,
          ...mxeAccounts,
        })
        .rpc()
    );

    setMpcStage("computing");

    // Poll for ProfileStoredEvent.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        program.removeEventListener(id);
        reject(new Error("MPC computation timed out after 120s"));
      }, 120_000);

      const id = program.addEventListener("ProfileStoredEvent", () => {
        clearTimeout(timer);
        program.removeEventListener(id);
        resolve();
      });
    });

    setMpcStage("finalizing");

    // Now trigger compute_credit_score.
    const solPriceUsd   = 150_000_000n; // $150 default oracle
    const oracleNonce   = freshNonce();
    const oraclePriceCt = encryptU64(solPriceUsd, sharedSecret, oracleNonce);
    const termsOffset   = freshOffset();
    const paramsNonce   = new anchor.BN(oracleNonce.toString());

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
          compDefAccount:    compDefAddress("compute_credit_score"),
          computationAccount: anchor.web3.SystemProgram.programId,
          arciumProgram:     getArciumProgramId(),
          systemProgram:     anchor.web3.SystemProgram.programId,
          ...mxeAccounts,
        })
        .rpc()
    );

    // Wait for TermsComputedEvent, then decrypt.
    const termsEvent = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        program.removeEventListener(id);
        reject(new Error("Credit score computation timed out after 120s"));
      }, 120_000);

      const id = program.addEventListener("TermsComputedEvent", (data: any) => {
        clearTimeout(timer);
        program.removeEventListener(id);
        resolve(data);
      });
    });

    // Decrypt the three loan term fields.
    const resultNonce = BigInt(termsEvent.result_nonce.toString());
    const cts: number[][] = termsEvent.terms_ciphertexts;
    const approvedVal  = decryptU64(new Uint8Array(cts[0]), sharedSecret, resultNonce);
    const tierVal      = decryptU64(new Uint8Array(cts[1]), sharedSecret, resultNonce);
    const maxBorrowVal = decryptU64(new Uint8Array(cts[2]), sharedSecret, resultNonce);

    const terms: LoanTerms = {
      approved:          approvedVal === 1n,
      rateTier:          Number(tierVal) as 0 | 1 | 2 | 3,
      maxBorrowLamports: maxBorrowVal,
    };

    setLoanTerms(terms);
    setMpcStage("done");
    await refresh();
  }, [wallet, refresh]);

  const acceptTerms = useCallback(async (terms: LoanTerms, borrowAmount: bigint) => {
    if (!wallet) throw new Error("Wallet not connected");

    const program     = await loadProgram(wallet);
    const borrowerAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const pda         = borrowerPda(wallet.publicKey);

    await sendSafe(() =>
      program.methods
        .acceptTerms(terms.approved, terms.rateTier, new anchor.BN(borrowAmount.toString()))
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

    const { pubKey, sharedSecret } = await deriveSharedSecret(provider);
    const nonce = freshNonce();
    const mxeAccounts = await mxePoolAccounts(provider);

    const repayAmountCt = encryptU64(amountLamports,    sharedSecret, nonce);
    const oraclePriceCt = encryptU64(150_000_000n,       sharedSecret, nonce);
    const paramsNonce   = new anchor.BN(nonce.toString());
    const repayOffset   = freshOffset();
    const borrowerAta   = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const [signPda]     = PublicKey.findProgramAddressSync([Buffer.from(new Uint8Array(32))], PROGRAM_ID);
    const pda           = borrowerPda(wallet.publicKey);

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
          borrower:          wallet.publicKey,
          borrowerAta,
          usdcMint:          USDC_MINT,
          vault:             VAULT_PDA,
          poolState:         POOL_PDA,
          borrowerAccount:   pda,
          signPdaAccount:    signPda,
          compDefAccount:    compDefAddress("compute_repayment"),
          computationAccount: anchor.web3.SystemProgram.programId,
          tokenProgram:      TOKEN_PROGRAM_ID,
          arciumProgram:     getArciumProgramId(),
          systemProgram:     anchor.web3.SystemProgram.programId,
          ...mxeAccounts,
        })
        .rpc()
    );

    setMpcStage("computing");

    const repayEvent = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        program.removeEventListener(id);
        reject(new Error("Repayment computation timed out after 120s"));
      }, 120_000);
      const id = program.addEventListener("RepaymentComputedEvent", (data: any) => {
        clearTimeout(timer);
        program.removeEventListener(id);
        resolve(data);
      });
    });

    const resultNonce    = BigInt(repayEvent.result_nonce.toString());
    const cts: number[][] = repayEvent.result_ct;
    const remainingDebt  = decryptU64(new Uint8Array(cts[0]), sharedSecret, resultNonce);
    const fullyRepaidVal = decryptU64(new Uint8Array(cts[1]), sharedSecret, resultNonce);

    setMpcStage("finalizing");

    const borrowerAtaForSettle = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    await sendSafe(() =>
      program.methods
        .settleRepayment(
          new anchor.BN(remainingDebt.toString()),
          fullyRepaidVal === 1n,
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

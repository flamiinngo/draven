import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ?? "DrVNbP7amL2XStk6UEPvuPqCwnTxS9BLd6NchWkRpvZ"
);

export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

export const [POOL_PDA]  = PublicKey.findProgramAddressSync([Buffer.from("pool")],  PROGRAM_ID);
export const [VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);

export function borrowerPda(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("borrower"), wallet.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function lenderPda(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lender"), wallet.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function makeProvider(wallet: AnchorWallet): anchor.AnchorProvider {
  const rpcUrl = import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";
  const conn   = new Connection(rpcUrl, "confirmed");
  return new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
}

export async function loadProgram(wallet: AnchorWallet): Promise<anchor.Program> {
  const provider = makeProvider(wallet);
  anchor.setProvider(provider);
  // IDL is imported from the build artifact. In dev, this comes from
  // the local target/idl/draven.json via Vite's resolveJsonModule.
  const { default: idl } = await import("../../target/idl/draven.json");
  return new anchor.Program(idl as anchor.Idl, provider);
}

/** Generates a cryptographically random u64 BN for computation_offset. */
export function freshOffset(): anchor.BN {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return new anchor.BN(Buffer.from(buf).toString("hex"), 16, "le");
}

/**
 * Wraps a transaction call, treating "AlreadyProcessed" as a success.
 * Phantom retries can cause duplicate-signature errors that should not
 * surface as errors to the user.
 */
export async function sendSafe(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("AlreadyProcessed") || msg.includes("already been processed")) {
      return "already-processed";
    }
    throw e;
  }
}

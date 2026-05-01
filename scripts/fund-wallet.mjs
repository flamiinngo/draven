/**
 * fund-wallet.mjs — withdraw USDC back from the pool into your wallet
 * Run this to refund the test wallet before running test-e2e.ts
 *
 *   node scripts/fund-wallet.mjs
 */
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const PROGRAM_ID = new PublicKey("5ZSXksL5NUbqKeHyCVuaxm7Ze31iVYWR6jGE7BpzWSVv");
const USDC_MINT  = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM_ID            = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const kp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
);
const RPC_URL  = process.env.RPC_URL || "https://api.devnet.solana.com";
const conn     = new Connection(RPC_URL, "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl     = require(resolve(__dirname, "../target/idl/draven.json"));
const program = new anchor.Program(idl, provider);

const [poolState] = PublicKey.findProgramAddressSync([Buffer.from("pool")],  PROGRAM_ID);
const [vault]     = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);
const [lenderAccount] = PublicKey.findProgramAddressSync(
  [Buffer.from("lender"), kp.publicKey.toBuffer()], PROGRAM_ID
);
const [lenderAta] = PublicKey.findProgramAddressSync(
  [kp.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
  ASSOCIATED_TOKEN_PROGRAM_ID,
);

// Check how much we have deposited
const lenderAccInfo = await conn.getAccountInfo(lenderAccount).catch(() => null);
if (!lenderAccInfo) {
  console.log("No lender account found — nothing deposited.");
  process.exit(0);
}

const lenderData = await program.account.lenderAccount.fetch(lenderAccount);
const deposited  = lenderData.depositedLamports.toString();
console.log(`Deposited in pool: ${deposited} USDC base units (${Number(deposited)/1e6} USDC)`);

if (BigInt(deposited) === 0n) {
  console.log("Nothing to withdraw.");
  process.exit(0);
}

// Withdraw all deposited amount back to wallet
const withdrawAmount = new BN(deposited);
console.log(`Withdrawing ${withdrawAmount.toString()} base units…`);

const sig = await program.methods
  .withdrawLiquidity(withdrawAmount)
  .accounts({
    lender:        kp.publicKey,
    lenderAta,
    usdcMint:      USDC_MINT,
    vault,
    poolState,
    lenderAccount,
    tokenProgram:  TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log(`Withdrawn — ${sig}`);

const bal = await conn.getTokenAccountBalance(lenderAta);
console.log(`Wallet USDC balance: ${bal.value.uiAmount} USDC`);

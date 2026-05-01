import * as anchor from "@coral-xyz/anchor";
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

const existing = await conn.getAccountInfo(poolState);
if (existing !== null) {
  console.log("Pool already initialized — nothing to do.");
  process.exit(0);
}

console.log("Initializing pool…");
const sig = await program.methods
  .initializePool()
  .accounts({
    payer:        kp.publicKey,
    poolState,
    vault,
    usdcMint:     USDC_MINT,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log(`Pool initialized — ${sig}`);
console.log(`  pool_state: ${poolState.toBase58()}`);
console.log(`  vault:      ${vault.toBase58()}`);

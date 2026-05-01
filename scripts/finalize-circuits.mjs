import {
  buildFinalizeCompDefTx,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";

const PROGRAM_ID = new PublicKey("5ZSXksL5NUbqKeHyCVuaxm7Ze31iVYWR6jGE7BpzWSVv");

const kp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
);
const RPC_URL  = process.env.RPC_URL || "https://api.devnet.solana.com";
const conn     = new Connection(RPC_URL, "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const circuits = [
  "store_borrower_profile",
  "compute_credit_score",
  "check_health",
  "compute_repayment",
];

for (const name of circuits) {
  const offsetBytes = getCompDefAccOffset(name);
  const offsetNum   = Buffer.from(offsetBytes).readUInt32LE(0);

  process.stdout.write(`Finalizing ${name}…  `);
  const tx  = await buildFinalizeCompDefTx(provider, offsetNum, PROGRAM_ID);
  const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  console.log(`OK  ${sig}`);
}

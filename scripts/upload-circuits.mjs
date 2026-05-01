import { uploadCircuit } from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROGRAM_ID = new PublicKey("DrVNbP7amL2XStk6UEPvuPqCwnTxS9BLd6NchWkRpvZ");

const kp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
);
const RPC_URL  = process.env.RPC_URL || "https://api.devnet.solana.com";
const conn     = new Connection(RPC_URL, "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// 15 is the maximum safe chunk size for Helius free tier without 429s.
// Raise to 30 if using a paid RPC endpoint.
const CHUNK_SIZE   = parseInt(process.env.CHUNK_SIZE   || "15", 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "5", 10);

const circuits = [
  "store_borrower_profile",
  "compute_credit_score",
  "check_health",
  "compute_repayment",
];

for (const name of circuits) {
  const arcisPath = resolve(__dirname, `../build/${name}.arcis`);
  const arcis     = readFileSync(arcisPath);
  console.log(`\n=== Uploading ${name} (${arcis.byteLength} bytes) ===`);

  if (arcis.byteLength < 500) {
    console.error(`ERROR: ${name}.arcis is suspiciously small (${arcis.byteLength} bytes).`);
    console.error("You may have uploaded the wrong file type. Run: cargo arcis build");
    process.exit(1);
  }

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      await uploadCircuit(
        provider,
        name,
        PROGRAM_ID,
        new Uint8Array(arcis),
        true,
        CHUNK_SIZE,
        { commitment: "confirmed" },
      );
      console.log(`${name} uploaded successfully (attempt ${attempt}).`);
      break;
    } catch (err) {
      const msg = err?.message ?? String(err);
      if (msg.includes("AlreadyProcessed") || msg.includes("already been processed")) {
        console.log(`${name} already processed — treating as success.`);
        break;
      }
      console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt >= MAX_ATTEMPTS) {
        console.error(`All ${MAX_ATTEMPTS} attempts failed for ${name}. Aborting.`);
        process.exit(1);
      }
      const waitMs = 5000 * attempt;
      console.log(`Waiting ${waitMs}ms before retry…`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

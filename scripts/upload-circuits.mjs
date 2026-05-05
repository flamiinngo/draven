import { uploadCircuit } from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROGRAM_ID = new PublicKey("5ZSXksL5NUbqKeHyCVuaxm7Ze31iVYWR6jGE7BpzWSVv");

const kp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
);
const RPC_URL  = process.env.RPC_URL || "https://api.devnet.solana.com";
const conn     = new Connection(RPC_URL, "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "15", 10);
const DONE_FILE  = resolve(__dirname, "../.upload-progress.json");

const circuits = [
  "store_borrower_profile",
  "compute_credit_score",
  "compute_credit_score_v2",
  "check_health",
  "compute_repayment",
];

function loadDone() {
  try { return JSON.parse(readFileSync(DONE_FILE, "utf8")); } catch { return {}; }
}
function markDone(name) {
  const d = loadDone(); d[name] = true;
  writeFileSync(DONE_FILE, JSON.stringify(d));
}

function isNetworkError(err) {
  const msg = String(err?.message ?? err?.cause ?? err);
  return msg.includes("fetch failed") || msg.includes("ETIMEDOUT") ||
         msg.includes("ECONNRESET") || msg.includes("ENETUNREACH") ||
         msg.includes("blockhash") || msg.includes("socket hang up") ||
         msg.includes("429") || msg.includes("Too Many Requests");
}

async function uploadWithRetry(name, arcis) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      await uploadCircuit(
        provider, name, PROGRAM_ID, new Uint8Array(arcis),
        true, CHUNK_SIZE, { commitment: "confirmed" },
      );
      return;
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (msg.includes("AlreadyProcessed") || msg.includes("already been processed")) {
        console.log(`  already processed — ok`);
        return;
      }
      if (isNetworkError(err)) {
        const wait = Math.min(8000 * attempt, 60000);
        console.log(`  network error (attempt ${attempt}), retrying in ${wait/1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

// Catch unhandled rejections that escape uploadCircuit internals
process.on("unhandledRejection", (reason) => {
  if (isNetworkError(reason)) {
    process.stderr.write(`[unhandledRejection] network error — will retry via loop\n`);
    // Don't exit — the retry loop will handle it on next iteration
  } else {
    process.stderr.write(`[unhandledRejection] fatal: ${reason}\n`);
    process.exit(1);
  }
});

const done = loadDone();

for (const name of circuits) {
  if (done[name]) {
    console.log(`${name} — already uploaded, skipping`);
    continue;
  }

  const arcisPath = resolve(__dirname, `../build/${name}.arcis`);
  const arcis     = readFileSync(arcisPath);
  console.log(`\n=== Uploading ${name} (${arcis.byteLength} bytes) ===`);

  if (arcis.byteLength < 500) {
    console.error(`ERROR: ${name}.arcis is suspiciously small. Run: arcium build`);
    process.exit(1);
  }

  await uploadWithRetry(name, arcis);
  markDone(name);
  console.log(`${name} uploaded and saved to progress file.`);
}

console.log("\nAll circuits uploaded.");

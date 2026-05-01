import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getArciumProgramId,
  ARCIUM_IDL,
} from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { AddressLookupTableProgram, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const PROGRAM_ID = new PublicKey("DrVNbP7amL2XStk6UEPvuPqCwnTxS9BLd6NchWkRpvZ");

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

const arciumProgram = new anchor.Program(ARCIUM_IDL, provider);
const mxeAccAddress = getMXEAccAddress(PROGRAM_ID);
const mxeData       = await arciumProgram.account.mxeAccount.fetch(mxeAccAddress);
const lutAddress    = getLookupTableAddress(PROGRAM_ID, mxeData.lutOffsetSlot);

const circuits = [
  { name: "store_borrower_profile",  method: "initStoreBorrowerProfileCompDef" },
  { name: "compute_credit_score",    method: "initComputeCreditScoreCompDef" },
  { name: "check_health",            method: "initCheckHealthCompDef" },
  { name: "compute_repayment",       method: "initComputeRepaymentCompDef" },
];

for (const { name, method } of circuits) {
  const offsetBytes    = getCompDefAccOffset(name);
  const offsetNum      = Buffer.from(offsetBytes).readUInt32LE(0);
  const compDefAddress = getCompDefAccAddress(PROGRAM_ID, offsetNum);

  process.stdout.write(`Initializing ${name} comp def…  `);
  const sig = await program.methods[method]()
    .accounts({
      payer:              kp.publicKey,
      mxeAccount:         mxeAccAddress,
      compDefAccount:     compDefAddress,
      addressLookupTable: lutAddress,
      lutProgram:         AddressLookupTableProgram.programId,
      arciumProgram:      getArciumProgramId(),
      systemProgram:      anchor.web3.SystemProgram.programId,
    })
    .rpc();
  console.log(`OK  ${sig}`);
}

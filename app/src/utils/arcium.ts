import { x25519 } from "@noble/curves/ed25519";
import {
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getClusterAccAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  RescueCipher,
} from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./anchor";

export function compDefAddress(name: string): PublicKey {
  const offsetBytes = getCompDefAccOffset(name);
  const offsetNum   = Buffer.from(offsetBytes).readUInt32LE(0);
  return getCompDefAccAddress(PROGRAM_ID, offsetNum);
}

export function mxeAddress(): PublicKey {
  return getMXEAccAddress(PROGRAM_ID);
}

// MXEAccount raw layout: discriminator(8) + is_initialized(1) + cluster_offset_le_u32(4)
export async function readClusterOffset(provider: anchor.AnchorProvider): Promise<number> {
  const info = await provider.connection.getAccountInfo(mxeAddress());
  if (!info) throw new Error("Arcium MXE account not found — is devnet running?");
  return info.data.readUInt32LE(9);
}

export async function deriveSharedSecret(
  provider: anchor.AnchorProvider
): Promise<{ pubKey: Uint8Array; sharedSecret: Uint8Array }> {
  const mxePub = await getMXEPublicKey(provider, PROGRAM_ID);
  if (!mxePub || mxePub.length !== 32) {
    throw new Error("Arcium cluster is not available right now. Try again in a moment.");
  }

  const clientPriv   = x25519.utils.randomPrivateKey();
  const clientPub    = x25519.getPublicKey(clientPriv);
  const sharedSecret = x25519.getSharedSecret(clientPriv, mxePub);

  return { pubKey: clientPub, sharedSecret };
}

export function encryptU64(value: bigint, sharedSecret: Uint8Array, nonce: Uint8Array): Uint8Array {
  const cipher = new RescueCipher(sharedSecret);
  const ct = cipher.encrypt([value], nonce);
  return new Uint8Array(ct[0]);
}

// Encrypts multiple u64 values in a single cipher instance so consecutive counter
// positions (0,1,2,...) are used — matching what the MXE decrypts at those offsets.
export function encryptU64Batch(values: bigint[], sharedSecret: Uint8Array, nonce: Uint8Array): Uint8Array[] {
  const cipher = new RescueCipher(sharedSecret);
  const cts = cipher.encrypt(values, nonce);
  return cts.map(ct => new Uint8Array(ct));
}

export function decryptU64(ct: Uint8Array, sharedSecret: Uint8Array, nonce: Uint8Array): bigint {
  const cipher = new RescueCipher(sharedSecret);
  const plain  = cipher.decrypt([Array.from(ct)], nonce);
  return plain[0];
}

export function freshNonce(): Uint8Array {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return buf;
}

export type MxeAccounts = Record<string, PublicKey>;

export async function mxePoolAccounts(
  provider: anchor.AnchorProvider
): Promise<{ accounts: MxeAccounts; clusterOffset: number }> {
  const clusterOffset = await readClusterOffset(provider);
  return {
    clusterOffset,
    accounts: {
      mxeAccount:     mxeAddress(),
      mempoolAccount: getMempoolAccAddress(clusterOffset),
      executingPool:  getExecutingPoolAccAddress(clusterOffset),
      clusterAccount: getClusterAccAddress(clusterOffset),
      poolAccount:    getFeePoolAccAddress(),
      clockAccount:   getClockAccAddress(),
    },
  };
}

export function truncateCiphertext(bytes: number[]): string {
  const hex = bytes.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex}…`;
}

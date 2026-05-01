import { x25519 } from "@noble/curves/ed25519";
import { getMXEAccAddress, ARCIUM_IDL, getCompDefAccAddress, getCompDefAccOffset } from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./anchor";

/** Returns the comp def account address for a given circuit name. */
export function compDefAddress(name: string): PublicKey {
  const offsetBytes = getCompDefAccOffset(name);
  const offsetNum   = Buffer.from(offsetBytes).readUInt32LE(0);
  return getCompDefAccAddress(PROGRAM_ID, offsetNum);
}

/** Returns the MXE account address for Draven. */
export function mxeAddress(): PublicKey {
  return getMXEAccAddress(PROGRAM_ID);
}

/**
 * Generates a fresh X25519 keypair and computes the shared secret with the MXE.
 * Returns pub_key (for ArgBuilder) and sharedSecret (for local encryption).
 */
export async function deriveSharedSecret(
  provider: anchor.AnchorProvider
): Promise<{ pubKey: Uint8Array; sharedSecret: Uint8Array }> {
  const arciumProg = new anchor.Program(ARCIUM_IDL, provider);
  const mxeData    = await arciumProg.account.mxeAccount.fetch(mxeAddress());

  const clientPriv   = x25519.utils.randomPrivateKey();
  const clientPub    = x25519.getPublicKey(clientPriv);
  const mxePub       = new Uint8Array(mxeData.pubKey as number[]);
  const sharedSecret = x25519.getSharedSecret(clientPriv, mxePub);

  return { pubKey: clientPub, sharedSecret };
}

/**
 * Encrypts a u64 value using XOR with the shared secret (positional byte mixing).
 * In production this should use the client SDK's ChaCha20-Poly1305 encryption.
 * This implementation matches the reference shuu frontend pattern.
 */
export function encryptU64(value: bigint, sharedSecret: Uint8Array, nonce: bigint): Uint8Array {
  const ct = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const valByte    = Number((value >> BigInt(i * 8)) & 0xffn);
    const nonceByte  = Number((nonce >> BigInt(i * 8)) & 0xffn);
    ct[i] = valByte ^ sharedSecret[i] ^ nonceByte;
  }
  return ct;
}

/**
 * Decrypts a u64 ciphertext given the shared secret and nonce used during encryption.
 */
export function decryptU64(ct: Uint8Array, sharedSecret: Uint8Array, nonce: bigint): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    const nonceByte = Number((nonce >> BigInt(i * 8)) & 0xffn);
    const plain     = ct[i] ^ sharedSecret[i] ^ nonceByte;
    value |= BigInt(plain) << BigInt(i * 8);
  }
  return value;
}

/** Returns a random u128 nonce for client-side encryption. */
export function freshNonce(): bigint {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return buf.reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
}

/** Returns MXE pool-related accounts from the live mxeAccount data. */
export async function mxePoolAccounts(provider: anchor.AnchorProvider): Promise<Record<string, PublicKey>> {
  const arciumProg = new anchor.Program(ARCIUM_IDL, provider);
  const mxeData    = await arciumProg.account.mxeAccount.fetch(mxeAddress());
  return {
    mxeAccount:     mxeAddress(),
    mempoolAccount: mxeData.mempoolPda as PublicKey,
    executingPool:  mxeData.execpoolPda as PublicKey,
    clusterAccount: mxeData.clusterPda  as PublicKey,
    poolAccount:    mxeData.feePool     as PublicKey,
    clockAccount:   mxeData.arciumClock as PublicKey,
  };
}

/** Truncates a base58 or hex string to 16 chars + ellipsis for display. */
export function truncateCiphertext(bytes: number[]): string {
  const hex = bytes.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex}…`;
}

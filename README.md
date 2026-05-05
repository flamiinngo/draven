# Draven

Private undercollateralised lending on Solana. Borrowers pledge USDC, the protocol scores their credit history *inside an Arcium MPC cluster*, and only the resulting rate tier ever touches the chain — never the score, the inputs, or the health factor.

Tier A wallets (~6% APR) borrow up to 125% of their collateral. Tier C is fully collateralised. The numbers that decide which tier you land in stay encrypted end-to-end.

- **Live demo:** https://draveen.vercel.app
- **Program ID:** `5ZSXksL5NUbqKeHyCVuaxm7Ze31iVYWR6jGE7BpzWSVv` (devnet)
- **USDC mint:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle devnet USDC)
- **Stack:** Anchor 0.32 · Arcium 0.9.6 · Solana 1.18 · Vite 5 · React 18

## How it actually works

There are four MPC circuits running inside the Arcium MXE. Each one consumes encrypted inputs from the client (X25519 ECDH + Rescue cipher in CTR mode), runs computation on shared field elements across the cluster, and either returns a public result or hands ciphertext back encrypted to the borrower's ephemeral key.

| Circuit | Inputs | Output | Used by |
|---|---|---|---|
| `store_borrower_profile` | `Enc<Shared, BorrowerProfile>` | `Enc<Mxe, BorrowerProfile>` | `request_loan` — re-keys the profile under an MXE-only key so subsequent circuits can re-read it from the borrower account without the client ever sending it again |
| `compute_credit_score_v2` | `Enc<Shared, ScoreParams>` + `Enc<Mxe, BorrowerProfile>` | `u64` (rate tier) | `apply_terms` — runs the scoring formula, reveals only the tier (1/2/3) or 0 for rejection |
| `check_health` | `Enc<Shared, HealthParams>` + `Enc<Mxe, BorrowerProfile>` | `bool` | `check_liquidation` — anyone can call it on any active loan; only the boolean leaves the cluster |
| `compute_repayment` | `Enc<Shared, RepayParams>` + `Enc<Mxe, BorrowerProfile>` | `Enc<Shared, RepayResult>` | `repay` — returns remaining debt + a fully-repaid flag, encrypted to the borrower |

Two compute circuits return ciphertext, not plaintext. That's because the borrower's repayment balance and the exact loan terms shouldn't be readable on-chain. The flow there is two-step: an Arcium callback writes the ciphertexts, the borrower decrypts off-chain, then calls a settlement instruction with the plaintext values. The on-chain program never sees the score or the remaining debt magnitude until the borrower volunteers it.

## The privacy table

| Hidden inside the MXE | Public on-chain |
|---|---|
| Wallet age, repayment history, liquidation count | Pool deposit / borrow totals |
| Collateral USD value at oracle price | Collateral lamport count (locked amount) |
| Credit score (computed and discarded inside the cluster) | Rate tier byte (1/2/3) |
| Loan-to-value ratio, health factor | Liquidation event (bool) |
| Per-borrower interest accrual | Aggregate interest paid to pool |
| Remaining debt after repayment | `is_active` flag |

The score is never written to any account, event, or output ciphertext. It is constructed inside the cluster, used to pick the tier, then dropped.

## Repository layout

```
encrypted-ixs/        Arcis circuits (Rust → .arcis bytecode)
programs/draven/      Anchor program — request/apply/accept/repay/check_liquidation
app/                  Vite + React frontend (deployed standalone on Vercel)
scripts/              Devnet helpers — deploy, init comp defs, upload, finalise, e2e test
patches/              patch-package diffs for @arcium-hq/client@0.9.6
```

## Run locally

```bash
# circuits + program
npm install
npm run build:circuits
npm run build:program

# devnet bootstrap (one-time)
anchor deploy --provider.cluster devnet
npm run init-comp-defs
RPC_URL=<helius-or-equivalent> npm run upload-circuits
npm run finalize-circuits

# end-to-end smoke test (deposit → borrow → repay → liquidation check)
npx ts-node scripts/test-e2e.ts

# frontend
cd app && npm install && npm run dev
```

## Verifying the privacy claim

```bash
node scripts/verify-onchain.js --borrower <wallet-pubkey>
```

Reads the borrower account, asserts that `encrypted_profile` is non-zero ciphertext, that `rate_tier` is in `{0,1,2,3}` (no leaked score), and that the four comp-def accounts exist and are finalised on devnet. The script also lists recent program signatures so you can scan them for Arcium callback CPIs.

## Devnotes

A few things that are easy to get wrong with `@arcium-hq/client@0.9.6`:

- Use `RescueCipher` for `Enc<Shared, T>`, not `CSplRescueCipher`. The MXE derives its keystream over Curve25519's *base* field; `CSplRescueCipher` derives over the *scalar* field, which produces a different RescuePrimeHash digest and therefore a different keystream — encrypt/decrypt will round-trip locally but the cluster will read garbage and every loan rejects.
- Encrypt all fields of an `Enc<Shared, T>` struct in a single `cipher.encrypt([v0..vN], nonce)` call. The CTR counter advances by position within the call, so encrypting fields one at a time puts every ciphertext at counter position 0 and the cluster's batch decrypt mismatches positions 1..N.
- `chunkSize=15` for `uploadCircuit`. Larger chunks hit the devnet RPC limits and the SDK doesn't surface the failure cleanly.
- All Arcium-side accounts in callback contexts must be `Box<>`'d. Otherwise the BPF stack overflows during deserialisation.
- Treat `AlreadyProcessed` as success in any retry wrapper — devnet sometimes confirms the same signature twice.

## License

MIT

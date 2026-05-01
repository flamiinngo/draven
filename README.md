# Draven — Private Undercollateralised Lending Protocol

Draven is the first lending protocol on Solana where creditworthiness is computed **inside an Arcium MXE**. Borrowers can access undercollateralised loans — down to 75% collateral ratio for Tier A wallets — without ever revealing their credit score, collateral amount, or health factor to any external party.

---

## Privacy model

| What stays hidden inside the MXE | What is published on-chain |
|---|---|
| Borrower's raw collateral amount | Loan approval: yes / no |
| Credit score and all scoring inputs | Assigned rate tier (A / B / C byte) |
| Health factor / LTV ratio | Repayment result ciphertexts (no plaintext) |
| Liquidation threshold per borrower | Liquidation result: boolean |
| Interest accrual per borrower | Borrowed lamports (debt magnitude) |

The credit score is computed and discarded inside the MXE — it is not in any output ciphertext, event, or account.

---

## Architecture

```
encrypted-ixs/          Arcis circuits (Rust, compiled to .arcis)
programs/draven/        Anchor program (Rust)
app/                    React 18 + Vite 5 frontend
scripts/                Deploy and verification scripts
patches/                patch-package diffs for @arcium-hq/client
```

### Four circuits

| Circuit | Type | Input | Output |
|---|---|---|---|
| `store_borrower_profile` | store_X | `Enc<Shared, BorrowerProfile>` | `Enc<Mxe, BorrowerProfile>` |
| `compute_credit_score` | compute_X | `Enc<Shared, ScoreParams>` + `Enc<Mxe, BorrowerProfile>` | `Enc<Shared, LoanTerms>` |
| `check_health` | check_X | `Enc<Shared, HealthParams>` + `Enc<Mxe, BorrowerProfile>` | `bool` |
| `compute_repayment` | compute_X | `Enc<Shared, RepayParams>` + `Enc<Mxe, BorrowerProfile>` | `Enc<Shared, RepayResult>` |

### Why two instructions per compute circuit?

`compute_credit_score` and `compute_repayment` return `Enc<Shared, T>` — ciphertexts encrypted to the borrower's ephemeral X25519 key. The on-chain program cannot decrypt these. This is the correct Arcium architecture:

1. **Callback** (Arcium-triggered): stores ciphertexts + nonce, emits event
2. **Settlement** (client-triggered after off-chain decryption): provides plaintext values, program acts

This proves the credit score never touches the on-chain program. A protocol that claimed to disburse a loan directly from a `compute_X` callback would be lying — the callback can't read the encrypted terms.

---

## Circuit sizes after build

Run `cargo arcis build` in `encrypted-ixs/` to get the `.arcis` binaries in `build/`. Expected sizes are in the range of 50–200 kB per circuit. If any circuit is smaller than 500 bytes, the wrong file type was built.

---

## Deploy

```bash
# 1. Install dependencies
npm install

# 2. Build circuits
npm run build:circuits

# 3. Build Anchor program
npm run build:program

# 4. Deploy (updates declare_id! — re-run build after deploy)
anchor deploy --provider.cluster devnet

# 5. Initialize computation definitions
npm run init-comp-defs

# 6. Upload circuit binaries
RPC_URL=<your-helius-url> npm run upload-circuits

# 7. Finalize circuits
npm run finalize-circuits
```

---

## Verify on-chain (judge command)

```bash
node scripts/verify-onchain.js
```

With a specific borrower account:

```bash
node scripts/verify-onchain.js --borrower <wallet-pubkey>
```

Output will confirm:
- Program is deployed and executable
- All 4 circuits are finalized with correct byte sizes
- BorrowerAccount stores ciphertext, not plaintext scores
- Pool vault holds real USDC
- Recent transactions invoked Arcium program

---

## Frontend

```bash
cd app
npm install
npm run dev    # development
npm run build  # production (must pass with zero warnings)
```

---

## Known Arcium gotchas applied

1. `@arcium-hq/client@0.9.6` pinned exactly — patch-package diffs in `patches/`
2. `.arcis` binaries uploaded (not `.idarc`) — size guard in upload script
3. All Arcium accounts `Box<>`'d in callback structs (stack budget)
4. Event field names read as `snake_case` (`result_nonce` not `resultNonce`)
5. `freshOffset()` uses `crypto.getRandomValues` not `Date.now()`
6. `AlreadyProcessed` treated as success in all `sendSafe` calls
7. `chunkSize=15` for all RPC upload calls
8. State machine clears all stale state on `request_loan` re-entry

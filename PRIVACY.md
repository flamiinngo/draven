# Draven Privacy Model

## What enters the Arcium MXE

Every field of `BorrowerProfile` is encrypted by the borrower's client before being submitted to the protocol. The five fields enter the MXE as X25519-encrypted `u64` ciphertexts and are re-encrypted to the MXE-only key by `store_borrower_profile`. After this point they are accessible only to the Arcium cluster.

| Field | Enters MXE as | Exits MXE as |
|---|---|---|
| `wallet_age_days` | `Enc<Shared, u64>` | Never leaves |
| `past_loans_repaid` | `Enc<Shared, u64>` | Never leaves |
| `past_liquidations` | `Enc<Shared, u64>` | Never leaves |
| `current_collateral` | `Enc<Shared, u64>` | Never leaves |
| `requested_amount` | `Enc<Shared, u64>` | Never leaves |
| Credit score (intermediate) | Computed inside MXE | Discarded inside MXE |
| Health factor (intermediate) | Computed inside MXE | Discarded inside MXE |

## What comes out of the MXE

| Output | Circuit | Who can read it |
|---|---|---|
| `Enc<Mxe, BorrowerProfile>` | `store_borrower_profile` | Arcium cluster only |
| `Enc<Shared, LoanTerms>` | `compute_credit_score` | Borrower only (decrypts with ephemeral key) |
| `bool` (liquidatable) | `check_health` | Everyone — this is the protocol enforcement signal |
| `Enc<Shared, RepayResult>` | `compute_repayment` | Borrower only |

## Who can see what

| Actor | Sees |
|---|---|
| Borrower | Their rate tier (after decryption), their borrow amount, their repayment result |
| Lender | Pool total deposits, pool total borrowed, utilization rate |
| Liquidation bot | Liquidation boolean per position (no LTV, no collateral amount) |
| Arx node (Arcium cluster) | Plaintext computation inputs (threshold-secret-shared across all nodes — no single node sees the full data) |
| Arcium team | Protocol design, not individual computation inputs |
| Solana validator / public | `rate_tier` byte, `borrowed_lamports`, liquidation boolean, encrypted profile ciphertexts (unreadable without ephemeral key) |

## Why MPC over ZKP

Zero-knowledge proofs prove a statement about known data. For Draven the challenge is different: the *inputs themselves* must remain private from the verifier (the lender, the protocol, the chain). A ZKP would require the borrower to prove "my score is above threshold" without a trusted setup, but the scoring inputs would still be visible to whoever generates the proof.

MPC distributes the computation across Arcium's Arx nodes. No single node learns any input value. The output is computed jointly and revealed only according to the circuit's output type:

- `store_X` — re-encryption, nothing revealed
- `check_X` — only the boolean, nothing about the underlying values
- `compute_X` — result encrypted back to the requester, unreadable by the cluster or chain

## Why MPC over TEE

A TEE (trusted execution environment) trusts the hardware manufacturer and the remote attestation infrastructure. If the TEE vendor is compromised, all private data is exposed. MPC under Arcium's model requires threshold-many nodes to collude before any input is compromised, and the threshold is set at deployment time. For a 4-node cluster with a threshold of 3, an attacker must compromise 3 independent parties simultaneously.

Draven uses Arcium's devnet cluster which has a fixed recovery set size. For mainnet deployment the cluster parameters would be set to maximise the collusion threshold.

## On-chain privacy proof

Run `node scripts/verify-onchain.js` to confirm independently:

1. The Draven program is executable on devnet
2. All 4 computation definitions are finalized (circuits uploaded and locked)
3. `BorrowerAccount.encrypted_profile` contains ciphertext bytes, not plaintext score values
4. The pool vault holds real USDC
5. Recent transactions called the Arcium program (computation actually ran)

No part of this verification trusts the README or the frontend. It reads live chain state directly.

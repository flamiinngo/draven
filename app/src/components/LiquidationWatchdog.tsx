import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  PROGRAM_ID, POOL_PDA, VAULT_PDA, USDC_MINT,
  freshOffset, sendSafe, makeProvider, loadProgram,
} from "../utils/anchor";
import { compDefAddress, deriveSharedSecret, encryptU64, freshNonce, mxePoolAccounts } from "../utils/arcium";
import { getArciumProgramId } from "@arcium-hq/client";

type WatchdogStatus = "healthy" | "checking" | "liquidated";

interface Toast {
  id:      number;
  message: string;
}

let toastCounter = 0;

export function LiquidationWatchdog() {
  const wallet                = useAnchorWallet();
  const { connection }        = useConnection();
  const [status, setStatus]   = useState<WatchdogStatus>("healthy");
  const [loanCount, setLoanCount] = useState(0);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [toasts, setToasts]   = useState<Toast[]>([]);
  const intervalRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = useCallback((message: string) => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);

  const checkAllPositions = useCallback(async () => {
    if (!wallet) return;
    setStatus("checking");

    try {
      const program     = await loadProgram(wallet);
      const accounts    = await program.account.borrowerAccount.all([
        {
          memcmp: {
            offset: 8 + 1 + 32 + 160 + 16 + 96 + 16 + 1 + 8 + 8, // is_active offset
            bytes:  "2",
          },
        },
      ]);

      setLoanCount(accounts.length);

      if (accounts.length === 0) {
        setStatus("healthy");
        setLastChecked(Date.now());
        return;
      }

      const provider    = makeProvider(wallet);
      const { pubKey, sharedSecret } = await deriveSharedSecret(provider);
      const mxeAccounts = await mxePoolAccounts(provider);
      const nonce       = freshNonce();

      for (const { account, publicKey: acctPubkey } of accounts) {
        // Derive the borrower pubkey from the PDA seeds (reverse-lookup not possible,
        // so we use the stored borrower field).
        const borrowerPk = account.borrower as PublicKey;

        const oraclePriceCt = encryptU64(150_000_000n, sharedSecret, nonce);
        const currentDebtCt = encryptU64(BigInt(account.borrowedLamports.toString()), sharedSecret, nonce);
        const accruedIntCt  = encryptU64(0n, sharedSecret, nonce);
        const paramsNonce   = new anchor.BN(nonce.toString());
        const liqOffset     = freshOffset();
        const [signPda]     = PublicKey.findProgramAddressSync([Buffer.from(new Uint8Array(32))], PROGRAM_ID);

        try {
          await sendSafe(() =>
            program.methods
              .checkLiquidation(
                liqOffset,
                Array.from(oraclePriceCt),
                Array.from(currentDebtCt),
                Array.from(accruedIntCt),
                Array.from(pubKey),
                paramsNonce,
              )
              .accounts({
                caller:            wallet.publicKey,
                borrower:          borrowerPk,
                borrowerAccount:   acctPubkey,
                signPdaAccount:    signPda,
                compDefAccount:    compDefAddress("check_health"),
                computationAccount: anchor.web3.SystemProgram.programId,
                arciumProgram:     getArciumProgramId(),
                systemProgram:     anchor.web3.SystemProgram.programId,
                ...mxeAccounts,
              })
              .rpc()
          );
        } catch {
          // Individual check failure should not abort the loop.
        }
      }

      // Listen for liquidation events from this batch.
      const listenerId = program.addEventListener("LiquidationExecutedEvent", () => {
        setStatus("liquidated");
        addToast("Position liquidated — collateral seized");
        program.removeEventListener(listenerId);
        setTimeout(() => setStatus("healthy"), 10_000);
      });

      setTimeout(() => {
        program.removeEventListener(listenerId);
      }, 30_000);

      setStatus("healthy");
    } catch {
      setStatus("healthy");
    } finally {
      setLastChecked(Date.now());
    }
  }, [wallet, addToast]);

  useEffect(() => {
    if (!wallet) return;
    checkAllPositions();
    intervalRef.current = setInterval(checkAllPositions, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [wallet, checkAllPositions]);

  const dotColor = status === "healthy" ? "#22c55e" : status === "checking" ? "#f59e0b" : "#ef4444";
  const secondsAgo = lastChecked ? Math.round((Date.now() - lastChecked) / 1000) : null;

  return (
    <>
      {/* Watchdog dot */}
      <div
        className="fixed bottom-6 right-6 z-40 cursor-pointer"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <AnimatePresence>
          {expanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15 }}
              className="border border-border rounded bg-surface px-4 py-3 flex items-center gap-3"
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
              <span className="text-xs text-secondary whitespace-nowrap">
                Watching {loanCount} active loan{loanCount !== 1 ? "s" : ""}
                {secondsAgo !== null ? ` — last checked ${secondsAgo}s ago` : ""}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="dot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-16 right-6 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.3 }}
              className="border border-border rounded bg-surface px-4 py-3"
            >
              <span className="text-xs text-primary">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

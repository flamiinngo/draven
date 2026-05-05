import { motion } from "framer-motion";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconThreeNodes = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9"  cy="3"  r="2" stroke="#6366f1" strokeWidth="1.3" />
    <circle cx="15" cy="13" r="2" stroke="#6366f1" strokeWidth="1.3" />
    <circle cx="3"  cy="13" r="2" stroke="#6366f1" strokeWidth="1.3" />
    <circle cx="9"  cy="9"  r="1.3" stroke="#6366f1" strokeWidth="1.1" />
    <line x1="9"  y1="5"  x2="9"  y2="7.7" stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="13" y1="12" x2="10.2" y2="9.8" stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="5"  y1="12" x2="7.8" y2="9.8"  stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="9"  y1="5"  x2="13.5" y2="11.5" stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round" opacity="0.4" />
    <line x1="13.5" y1="11.5" x2="4.5" y2="11.5" stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round" opacity="0.4" />
    <line x1="4.5"  y1="11.5" x2="9"  y2="5"   stroke="#6366f1" strokeWidth="1.1" strokeLinecap="round" opacity="0.4" />
  </svg>
);

const IconArrowUp = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="1.5" y="10" width="15" height="2" rx="1" fill="#6366f1" opacity="0.35" />
    <path d="M9 2L9 10" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M5.5 5.5L9 2L12.5 5.5" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 14L14 14" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    <path d="M4 16.5L14 16.5" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
  </svg>
);

const IconEyeCrossed = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 9C2 9 4.5 4.5 9 4.5C13.5 4.5 16 9 16 9C16 9 13.5 13.5 9 13.5C4.5 13.5 2 9 2 9Z" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="9" cy="9" r="2" stroke="#6366f1" strokeWidth="1.3" />
    <line x1="2.5" y1="2.5" x2="15.5" y2="15.5" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const IconHexNode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1.5L15.5 5.25V12.75L9 16.5L2.5 12.75V5.25L9 1.5Z" stroke="#6366f1" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="9" cy="9"    r="1.5" fill="#6366f1" />
    <circle cx="9" cy="3.5"  r="1"   fill="#6366f1" opacity="0.5" />
    <circle cx="9" cy="14.5" r="1"   fill="#6366f1" opacity="0.5" />
    <line x1="9" y1="4.5"  x2="9" y2="7.5"  stroke="#6366f1" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    <line x1="9" y1="10.5" x2="9" y2="13.5" stroke="#6366f1" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
  </svg>
);

const IconLightning = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M11 2L5 10H9L7 16L13 8H9L11 2Z" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBrokenChain = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M7 11.5a3 3 0 0 0 4.24 0L13.5 9.24a3 3 0 0 0-4.24-4.24L8 6.25" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M11 6.5a3 3 0 0 0-4.24 0L4.5 8.76a3 3 0 0 0 4.24 4.24L10 11.75" stroke="#6366f1" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8.5 9L9.5 9" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
  </svg>
);

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { val: "6–18%",    label: "APR for borrowers, set by credit tier" },
  { val: "up to 9%", label: "APY for USDC lenders at full utilization" },
  { val: "0 bytes",  label: "of your credit data on-chain" },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your wallet",
    body: "Use Phantom or Solflare. Draven looks at your on-chain transaction history to start building a credit picture.",
  },
  {
    n: "02",
    title: "Lock collateral and tell us how much you need",
    body: "Put up SOL to back the loan. Enter the USDC amount you want to borrow. This kicks off the private credit check.",
  },
  {
    n: "03",
    title: "Three nodes score your credit",
    body: "Each node holds only a fragment of your data. They compute your score together without any one of them seeing the complete picture.",
  },
  {
    n: "04",
    title: "Accept your rate and receive funds",
    body: "Your rate tier is the only thing written to the chain — nothing else. Confirm the terms and USDC lands in your wallet.",
  },
  {
    n: "05",
    title: "Repay when you're ready",
    body: "Repayments settle inside the compute cluster, not on the public chain. Paying on time builds your score for future loans.",
  },
];

const FEATURES = [
  {
    Icon: IconThreeNodes,
    title: "Your score stays private",
    desc: "Your financial data is split across three nodes. None of them can read the full picture. Only the final tier ever touches the chain.",
  },
  {
    Icon: IconArrowUp,
    title: "Borrow beyond your collateral",
    desc: "A strong credit score lets you borrow beyond your collateral — top-tier borrowers can access up to 125% of what they've locked.",
  },
  {
    Icon: IconEyeCrossed,
    title: "Nothing leaks on-chain",
    desc: "Your debt position, health factor, and credit inputs are all encrypted. No other wallet can read your position.",
  },
  {
    Icon: IconHexNode,
    title: "Three independent nodes",
    desc: "Built on Arcium's compute cluster. Three nodes run the computation with cryptographic guarantees, not just trust assumptions.",
  },
  {
    Icon: IconLightning,
    title: "Settles on Solana",
    desc: "Lands in under a second. All state lives natively on Solana — no bridges, no wrapped tokens, no third parties involved.",
  },
  {
    Icon: IconBrokenChain,
    title: "You own your funds",
    desc: "Every rule is written into the smart contracts. No admin key can change your rate, freeze your account, or touch your collateral.",
  },
];

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 24 },
  animate:    { opacity: 1, y: 0  },
  transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

const inView = (delay = 0) => ({
  initial:     { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0  },
  viewport:    { once: true },
  transition:  { duration: 0.5, delay },
});

// ─── Credit card visual ───────────────────────────────────────────────────────

function EncryptedCreditCard() {
  return (
    <div
      className="relative w-72 sm:w-80 rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #0f0f1a 0%, #0d0d14 100%)",
        border: "1px solid rgba(99,102,241,0.35)",
        boxShadow: "0 0 48px rgba(79,70,229,0.18), 0 0 96px rgba(79,70,229,0.07)",
      }}
    >
      {/* Scanning line */}
      <div
        className="animate-scan absolute left-0 right-0 h-px pointer-events-none"
        style={{
          top: 0,
          background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.7), transparent)",
          zIndex: 10,
        }}
      />

      <div className="px-6 py-6 space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-mono" style={{ color: "#4f46e5", letterSpacing: "0.12em" }}>YOUR PROFILE</p>
            <p className="text-xs" style={{ color: "#3f3f46" }}>Arcium cluster — encrypted</p>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(79,70,229,0.15)", border: "1px solid rgba(79,70,229,0.3)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L1 3.5V7C1 10.5 3.8 13.5 7 14C10.2 13.5 13 10.5 13 7V3.5L7 1Z" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Redacted rows */}
        <div className="space-y-3">
          {[
            { w: "70%",  label: "wallet age"        },
            { w: "55%",  label: "repayment history"  },
            { w: "80%",  label: "credit inputs"      },
            { w: "45%",  label: "debt ratio"         },
          ].map(({ w, label }) => (
            <div key={label} className="space-y-1">
              <p style={{ color: "#27272a", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</p>
              <div
                className="h-3 rounded"
                style={{
                  width: w,
                  background: "linear-gradient(90deg, #1e1e2e 0%, #252540 50%, #1e1e2e 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 2.4s linear infinite",
                }}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between pt-1 border-t"
          style={{ borderColor: "rgba(79,70,229,0.1)" }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs font-mono" style={{ color: "#4f46e5" }}>computing</span>
          </div>
          <div
            className="px-2.5 py-1 rounded text-xs font-mono font-bold"
            style={{ background: "rgba(79,70,229,0.12)", color: "#818cf8", border: "1px solid rgba(79,70,229,0.2)" }}
          >
            TIER —
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="pb-16 md:pb-24">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="min-h-[90vh] flex items-center pt-10 pb-16">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">

          {/* Left: copy */}
          <div className="flex flex-col gap-7">
            <motion.div {...fadeUp(0)}>
              <div
                className="inline-flex items-center gap-2"
                style={{
                  background: "rgba(79,70,229,0.08)",
                  border: "1px solid rgba(79,70,229,0.2)",
                  borderRadius: "9999px",
                  padding: "6px 14px",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span style={{ color: "#818cf8", fontSize: "12px", fontWeight: 500, letterSpacing: "0.04em" }}>
                  Live on Solana Devnet
                </span>
              </div>
            </motion.div>

            <motion.h1
              {...fadeUp(0.07)}
              className="text-4xl sm:text-5xl md:text-[52px] font-bold leading-tight tracking-tight"
              style={{ color: "#f5f5f5", letterSpacing: "-0.02em" }}
            >
              Borrow more than<br />
              your collateral.{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Privately.
              </span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.14)}
              className="text-base leading-relaxed max-w-md"
              style={{ color: "#71717a" }}
            >
              Draven scores your creditworthiness using three separate compute nodes. Nothing about your financial history hits the blockchain.
            </motion.p>

            <motion.div {...fadeUp(0.21)}>
              <WalletMultiButton />
            </motion.div>
          </div>

          {/* Right: animated credit card — hidden on small screens */}
          <motion.div
            {...fadeUp(0.18)}
            className="hidden md:flex justify-center items-center"
          >
            <EncryptedCreditCard />
          </motion.div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────────── */}
      <section className="pb-16">
        <motion.div
          {...inView()}
          className="flex gap-3 justify-center flex-wrap"
        >
          {STATS.map(({ val, label }) => (
            <div
              key={label}
              className="text-center"
              style={{
                background: "#0d0d0d",
                border: "1px solid #1f1f1f",
                borderRadius: "9999px",
                padding: "14px 24px",
                minWidth: "140px",
              }}
            >
              <p
                className="text-xl sm:text-2xl font-bold"
                style={{
                  background: "linear-gradient(135deg, #a5b4fc, #6366f1)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  lineHeight: 1.2,
                }}
              >
                {val}
              </p>
              <p className="text-xs mt-1" style={{ color: "#52525b", lineHeight: 1.4 }}>
                {label}
              </p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────────── */}
      <section className="pb-20">
        <motion.div {...inView()} className="text-center mb-10">
          <p
            className="text-xs font-mono uppercase tracking-widest mb-3"
            style={{ color: "#4f46e5" }}
          >
            How it works
          </p>
          <h2
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: "#e4e4e7" }}
          >
            Five steps to private credit
          </h2>
        </motion.div>

        <div className="max-w-xl mx-auto relative">
          {/* Vertical connector */}
          <div
            className="absolute"
            style={{
              left: "23px",
              top: "28px",
              bottom: "28px",
              width: "1px",
              background: "linear-gradient(to bottom, #4f46e5, rgba(79,70,229,0.06))",
            }}
          />

          {STEPS.map(({ n, title, body }, i) => (
            <motion.div
              key={n}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="flex gap-5"
              style={{ paddingBottom: i < STEPS.length - 1 ? "2.5rem" : 0 }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center relative z-10"
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "50%",
                  background: "#0d0d0d",
                  border: "1px solid #2a2a45",
                }}
              >
                <span className="text-xs font-mono font-bold" style={{ color: "#4f46e5" }}>{n}</span>
              </div>
              <div className="pt-2.5">
                <p className="text-sm font-semibold mb-1.5" style={{ color: "#e4e4e7" }}>{title}</p>
                <p className="text-sm leading-relaxed" style={{ color: "#52525b" }}>{body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────────── */}
      <section>
        <motion.div {...inView()} className="text-center mb-10">
          <p
            className="text-xs font-mono uppercase tracking-widest mb-3"
            style={{ color: "#4f46e5" }}
          >
            Architecture
          </p>
          <h2
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: "#e4e4e7" }}
          >
            What makes Draven different
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="card-hover rounded-xl p-5 md:p-6"
              style={{
                background: "#0d0d0d",
                border: "1px solid #1a1a1a",
              }}
            >
              <div
                className="flex items-center justify-center mb-4"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  background: "rgba(79,70,229,0.1)",
                  border: "1px solid rgba(79,70,229,0.18)",
                }}
              >
                <Icon />
              </div>
              <p className="text-sm font-semibold mb-2" style={{ color: "#e4e4e7" }}>{title}</p>
              <p className="text-sm leading-relaxed" style={{ color: "#52525b" }}>{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

    </div>
  );
}

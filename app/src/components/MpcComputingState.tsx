import { motion, AnimatePresence } from "framer-motion";
import type { MpcStage } from "../types";

const STAGES: { key: MpcStage; label: string }[] = [
  { key: "encrypting",  label: "Encrypting"  },
  { key: "submitting",  label: "Submitting"  },
  { key: "computing",   label: "Computing"   },
  { key: "finalizing",  label: "Finalizing"  },
];

const STAGE_ORDER: Record<MpcStage, number> = {
  idle: -1, encrypting: 0, submitting: 1, computing: 2, finalizing: 3, done: 4,
};

export function MpcComputingState({ stage }: { stage: MpcStage }) {
  if (stage === "idle" || stage === "done") return null;

  const currentIdx = STAGE_ORDER[stage];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl p-6 space-y-6"
      style={{ background: "#0a0a14", border: "1px solid #1a1a2e" }}
    >
      {/* Arx nodes with connecting lines */}
      <div className="flex items-center justify-center gap-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-2">
              {/* Pulse ring */}
              <div className="relative w-8 h-8 flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: "1px solid rgba(99,102,241,0.4)" }}
                  animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                />
                <motion.div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "linear-gradient(135deg, #818cf8, #4f46e5)" }}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
                />
              </div>
              <span className="text-xs font-mono" style={{ color: "#3f3f46" }}>Arx {i + 1}</span>
            </div>
            {i < 2 && (
              <div className="w-12 h-px mx-1 relative overflow-hidden" style={{ background: "#1a1a2e" }}>
                <motion.div
                  className="absolute inset-y-0 w-4 rounded-full"
                  style={{ background: "linear-gradient(90deg, transparent, #4f46e5, transparent)" }}
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4, ease: "linear" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Label */}
      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>Computing privately inside Arcium MXE</p>
        <p className="text-xs" style={{ color: "#52525b" }}>
          Your credit profile never leaves the encrypted cluster
        </p>
      </div>

      {/* Stage progress */}
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          {STAGES.map(({ key }, idx) => {
            const isActive = idx === currentIdx;
            const isPast   = idx < currentIdx;
            return (
              <motion.div
                key={key}
                className="flex-1 h-0.5 rounded-full"
                style={{ background: isPast ? "#4f46e5" : isActive ? "transparent" : "#1a1a2e" }}
                animate={isActive ? {} : {}}
              >
                {isActive && (
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #4f46e5, #818cf8)" }}
                    animate={{ width: ["0%", "100%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          {STAGES.map(({ key, label }, idx) => {
            const isActive = idx === currentIdx;
            const isPast   = idx < currentIdx;
            return (
              <AnimatePresence key={key}>
                {(isActive || isPast) && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-mono"
                    style={{ color: isActive ? "#a5b4fc" : "#2a2a45" }}
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

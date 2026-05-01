import { motion, AnimatePresence } from "framer-motion";
import type { MpcStage } from "../types";

const STAGES: { key: MpcStage; label: string }[] = [
  { key: "encrypting",  label: "Encrypting" },
  { key: "submitting",  label: "Submitting" },
  { key: "computing",   label: "Computing"  },
  { key: "finalizing",  label: "Finalizing" },
];

const STAGE_ORDER: Record<MpcStage, number> = {
  idle:       -1,
  encrypting:  0,
  submitting:  1,
  computing:   2,
  finalizing:  3,
  done:        4,
};

interface MpcComputingStateProps {
  stage: MpcStage;
}

export function MpcComputingState({ stage }: MpcComputingStateProps) {
  if (stage === "idle" || stage === "done") return null;

  const currentIdx = STAGE_ORDER[stage];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="border border-border rounded bg-surface p-6 space-y-6"
    >
      {/* Arx nodes */}
      <div className="flex items-center justify-center gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex flex-col items-center gap-2">
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-accent"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeInOut",
              }}
            />
            <span className="text-xs text-muted font-mono">Arx {i + 1}</span>
          </div>
        ))}
      </div>

      {/* Label */}
      <div className="text-center space-y-1">
        <p className="text-sm text-primary font-medium">Computing privately across Arcium MXE</p>
        <p className="text-xs text-secondary">Your credit profile never leaves the encrypted cluster</p>
      </div>

      {/* Stage progress */}
      <div className="flex items-center justify-between gap-1">
        {STAGES.map(({ key, label }, idx) => {
          const isActive  = idx === currentIdx;
          const isPast    = idx < currentIdx;

          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className="h-0.5 w-full rounded-full transition-all duration-300"
                style={{ backgroundColor: isPast || isActive ? "#4f46e5" : "#1f1f1f" }}
              />
              <AnimatePresence>
                {(isActive || isPast) && (
                  <motion.span
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs font-mono"
                    style={{ color: isActive ? "#f5f5f5" : "#3f3f46" }}
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

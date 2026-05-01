import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  define: {
    "process.env": {},
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          solana: ["@solana/web3.js", "@coral-xyz/anchor"],
          wallet: [
            "@solana/wallet-adapter-react",
            "@solana/wallet-adapter-react-ui",
            "@solana/wallet-adapter-wallets",
          ],
        },
      },
    },
  },
});

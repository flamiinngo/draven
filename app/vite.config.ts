import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process", "events", "path"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    react(),
  ],
  define: {
    "process.env": {},
  },
  optimizeDeps: {
    include: ["@arcium-hq/client", "@coral-xyz/anchor", "@solana/web3.js", "buffer"],
    esbuildOptions: {
      inject: ["./src/buffer-polyfill.js"],
      define: {
        global: "globalThis",
        "process.browser": "true",
        "process.version": '""',
      },
    },
  },
  resolve: {
    alias: {
      buffer: "buffer/",
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {},
  },
});

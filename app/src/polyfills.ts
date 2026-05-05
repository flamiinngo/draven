import { Buffer } from "buffer";

// Must run before any module that uses ripemd160/readable-stream/crypto-browserify
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).Buffer = Buffer;
}

import "./polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import App from "./App";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

const RPC_URL  = import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";
const wallets  = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConnectionProvider endpoint={RPC_URL}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <App />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </BrowserRouter>
  </React.StrictMode>
);

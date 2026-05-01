import { Link, useLocation } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LiquidationWatchdog } from "./LiquidationWatchdog";

const NAV = [
  { path: "/borrow",    label: "Borrow"    },
  { path: "/lend",      label: "Lend"      },
  { path: "/portfolio", label: "Portfolio" },
];

const DravenWordmark = () => (
  <span className="text-sm font-medium tracking-tight text-primary font-mono">draven</span>
);

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background text-primary font-sans">
      {/* Mobile banner */}
      <div className="block md:hidden bg-surface border-b border-border px-4 py-2 text-center">
        <span className="text-xs text-secondary">Best experienced on desktop</span>
      </div>

      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <DravenWordmark />
            <nav className="flex items-center gap-1">
              {NAV.map(({ path, label }) => {
                const active = pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    className="px-3 py-1.5 text-sm rounded transition-colors duration-150"
                    style={{
                      color:           active ? "#f5f5f5" : "#71717a",
                      backgroundColor: active ? "#1f1f1f" : "transparent",
                    }}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <WalletMultiButton
            style={{
              backgroundColor: "#4f46e5",
              borderRadius:    "8px",
              fontSize:        "13px",
              fontFamily:      "Inter, sans-serif",
              height:          "36px",
              padding:         "0 16px",
            }}
          />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {children}
      </main>

      <LiquidationWatchdog />
    </div>
  );
}

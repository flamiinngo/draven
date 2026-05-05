import { Link, useLocation } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LiquidationWatchdog } from "./LiquidationWatchdog";
import { Background } from "./Background";

const NAV = [
  { path: "/borrow",    label: "Borrow"    },
  { path: "/lend",      label: "Lend"      },
  { path: "/portfolio", label: "Portfolio" },
];

const DravenLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="draven-g" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#a5b4fc" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
    <line x1="12" y1="3.5"  x2="12" y2="12" stroke="url(#draven-g)" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="19.5" y1="16" x2="12" y2="12" stroke="url(#draven-g)" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="4.5"  y1="16" x2="12" y2="12" stroke="url(#draven-g)" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="12"   y1="3.5" x2="19.5" y2="16" stroke="url(#draven-g)" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="19.5" y1="16"  x2="4.5"  y2="16" stroke="url(#draven-g)" strokeWidth="1.1" strokeLinecap="round" />
    <line x1="4.5"  y1="16"  x2="12"   y2="3.5" stroke="url(#draven-g)" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="12"  cy="3.5" r="2"   fill="url(#draven-g)" />
    <circle cx="19.5" cy="16" r="2"   fill="url(#draven-g)" />
    <circle cx="4.5"  cy="16" r="2"   fill="url(#draven-g)" />
    <circle cx="12" cy="12" r="1.4" fill="url(#draven-g)" />
  </svg>
);

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen text-primary font-sans" style={{ background: "#0a0a0a" }}>
      <Background />

      {/* Nav — z-50 ensures wallet dropdown renders above page content */}
      <header
        className="relative z-50 border-b sticky top-0"
        style={{ background: "rgba(10,10,10,0.95)", borderColor: "#1a1a1a", overflow: "visible" }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <Link to="/borrow" className="flex items-center gap-2 md:gap-2.5">
              <DravenLogo />
              <span
                className="text-sm font-semibold tracking-tight font-mono"
                style={{ background: "linear-gradient(135deg, #a5b4fc, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                draven
              </span>
            </Link>

            {/* Desktop nav links */}
            <nav className="hidden md:flex items-center gap-0.5">
              {NAV.map(({ path, label }) => {
                const active = pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    className="relative px-3 py-1.5 text-sm rounded-md transition-colors duration-150"
                    style={{ color: active ? "#e4e4e7" : "#52525b" }}
                  >
                    {active && (
                      <span
                        className="absolute inset-0 rounded-md"
                        style={{ background: "rgba(79,70,229,0.1)", border: "1px solid rgba(79,70,229,0.18)" }}
                      />
                    )}
                    <span className="relative">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <WalletMultiButton />
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 pb-24 md:pb-12">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t"
        style={{ background: "rgba(10,10,10,0.97)", borderColor: "#1a1a1a" }}
      >
        {NAV.map(({ path, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className="flex-1 flex items-center justify-center py-4 text-xs font-medium transition-colors duration-150"
              style={{ color: active ? "#818cf8" : "#52525b" }}
            >
              <span
                className="relative px-3 py-1 rounded-md"
                style={active ? { background: "rgba(79,70,229,0.1)", color: "#818cf8" } : {}}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <LiquidationWatchdog />
    </div>
  );
}

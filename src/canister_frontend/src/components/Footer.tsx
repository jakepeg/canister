import { Link } from "@tanstack/react-router";
import logo from "../assets/logo.svg";
import onChainLogo from "../assets/on-chain.png";

const FOOTER_LINKS = [
  { label: "Home", href: "/#home", external: true },
  { label: "How It Works", href: "/#how-it-works", external: true },
  { label: "Pricing", href: "/#pricing", external: true },
  { label: "Open Canister", to: "/find", external: false },
  { label: "FAQ", to: "/faq", external: false },
  { label: "Privacy", to: "/privacy", external: false },
  { label: "X", href: "https://x.com/CanisterCloud", external: true },
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-[#c9a763]/20 bg-[#070707] px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-7 border-b border-[#c9a763]/15 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Canister logo" className="h-8 w-8 rounded-full" />
            <div className="flex flex-col">
              <span className="font-display text-base tracking-[0.14em] text-[#f2efe8]">
                CANISTER
              </span>
              <span className="text-xs text-[#f2efe8]/70">
                © 2026
              </span>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-y-3 text-xs uppercase tracking-[0.14em] text-[#f2efe8]/80">
            {FOOTER_LINKS.map((link, index) => (
              <span key={link.label} className="flex items-center">
                {link.external ? (
                  <a href={link.href} className="px-4 transition-colors hover:text-[#f2efe8]">
                    {link.label}
                  </a>
                ) : (
                  <Link to={link.to} className="px-4 transition-colors hover:text-[#f2efe8]">
                    {link.label}
                  </Link>
                )}
                {index < FOOTER_LINKS.length - 1 ? (
                  <span className="h-4 w-px bg-[#c9a763]/20" aria-hidden />
                ) : null}
              </span>
            ))}
          </nav>

          <img
            src={onChainLogo}
            alt="100 percent on-chain infrastructure"
            className="h-auto w-[95px] max-w-full opacity-95 sm:w-[110px]"
            loading="lazy"
          />
        </div>

      </div>
    </footer>
  );
}

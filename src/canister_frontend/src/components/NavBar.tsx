import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import logo from "../assets/logo.svg";

export default function NavBar() {
  const { identity, login, clear, isLoggingIn } = useInternetIdentity();
  const navigate = useNavigate();

  function handleSignOut() {
    clear();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#c9a763]/20 bg-[#090909]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to={identity ? "/dashboard" : "/"} className="flex items-center gap-3">
          <img src={logo} alt="Canister logo" className="h-8 w-8 rounded-full" />
          <span className="font-display text-lg tracking-[0.14em] text-[#f2efe8]">
            CANISTER
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          {identity ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#f2efe8]/85 hover:bg-[rgb(216_178_116)] hover:text-[#f2efe8]"
              >
                <Link to="/dashboard">My Canisters</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#f2efe8]/85 hover:bg-[rgb(216_178_116)] hover:text-[#f2efe8]"
              >
                <Link to="/create">Create Canister</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="rounded-sm border border-[#c9a763]/45 px-4 font-mono-display text-xs uppercase tracking-[0.14em] text-[#f2efe8]/85 hover:border-[#c9a763]/70 hover:bg-[#c9a763]/10 hover:text-[#f2efe8]"
              >
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#f2efe8]/85 hover:bg-[rgb(216_178_116)] hover:text-[#f2efe8]"
              >
                <a href="/#home">Home</a>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#f2efe8]/85 hover:bg-[rgb(216_178_116)] hover:text-[#f2efe8]"
              >
                <a href="/#how-it-works">How It Works</a>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#f2efe8]/85 hover:bg-[rgb(216_178_116)] hover:text-[#f2efe8]"
              >
                <a href="/#pricing">Pricing</a>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#f2efe8]/85 hover:bg-[rgb(216_178_116)] hover:text-[#f2efe8]"
              >
                <Link to="/find">Open Canister</Link>
              </Button>
              <Button
                size="sm"
                onClick={login}
                disabled={isLoggingIn}
                className="rounded-sm border border-[#c9a763]/45 bg-transparent px-4 font-mono-display text-xs uppercase tracking-[0.14em] text-[#f2efe8]/85 hover:border-[#c9a763]/70 hover:bg-[#c9a763]/10 hover:text-[#f2efe8]"
              >
                {isLoggingIn ? "Connecting..." : "Sign In"}
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

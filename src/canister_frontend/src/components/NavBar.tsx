import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Clock3, LayoutDashboard, LockKeyhole, PlusCircle } from "lucide-react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";

export default function NavBar() {
  const { identity, login, clear, isLoggingIn } = useInternetIdentity();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-amber-400" />
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-foreground">
            Canister
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <LockKeyhole className="mr-1 h-4 w-4" />
              Home
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/create">
              <PlusCircle className="mr-1 h-4 w-4" />
              Create
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <LayoutDashboard className="mr-1 h-4 w-4" />
              Dashboard
            </Link>
          </Button>

          {identity ? (
            <Button variant="outline" size="sm" onClick={clear}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={login} disabled={isLoggingIn}>
              {isLoggingIn ? "Connecting..." : "Connect II"}
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

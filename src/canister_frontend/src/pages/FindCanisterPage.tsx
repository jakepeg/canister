import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

export default function FindCanisterPage() {
  const navigate = useNavigate();
  const [canisterId, setCanisterId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedId = canisterId.trim();

    if (!trimmedId) {
      setError("Enter a canister ID.");
      return;
    }

    setError(null);
    navigate({ to: `/claim/${trimmedId}` });
  };

  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-xl">
        <div className="rounded-sm border border-[#c9a763]/30 bg-[#101010]/85 p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border border-[#c9a763]/35 bg-[#c9a763]/10 text-[#d8b274]">
              <Search className="h-6 w-6" />
            </div>
            <h1 className="font-display text-3xl text-[#f2efe8]">Open Canister</h1>
            <p className="mt-2 text-sm text-[#f2efe8]/70">
              Enter the canister ID to open your sealed canister.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="canister-id"
                className="text-xs uppercase tracking-[0.12em] text-[#f2efe8]/70"
              >
                Canister ID
              </label>
              <Input
                id="canister-id"
                value={canisterId}
                onChange={(event) => setCanisterId(event.target.value)}
                placeholder="Paste canister ID"
                className="bg-secondary/50 border-border/60"
                data-ocid="find.input"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
              data-ocid="find.primary_button"
            >
              Open Canister
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "../lib/analytics";

export default function PaymentSuccess() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    trackEvent("payment_success_page_viewed", {
      session_id: params.get("session_id") ?? undefined,
    });
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center pt-16 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center p-10 rounded-sm border border-border/60 bg-card/80"
      >
        <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-6" />
        <h1 className="font-display text-3xl font-bold text-foreground mb-3">
          Payment received
        </h1>
        <p className="text-muted-foreground mb-6">
          Thanks — Stripe has accepted your payment. Your canister tab is
          waiting for blockchain confirmation; it will advance automatically as
          soon as the webhook lands (a few seconds, typically). You can close
          this tab.
        </p>
        <Button asChild variant="utility" className="w-full rounded-sm">
          <Link to="/create">Return to capsule</Link>
        </Button>
      </motion.div>
    </main>
  );
}

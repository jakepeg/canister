import { Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

export default function PaymentCancelled() {
  return (
    <main className="min-h-screen flex items-center justify-center pt-16 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center p-10 rounded-sm border border-border/60 bg-card/80"
      >
        <XCircle className="w-12 h-12 text-amber mx-auto mb-6" />
        <h1 className="font-display text-3xl font-bold text-foreground mb-3">
          Payment cancelled
        </h1>
        <p className="text-muted-foreground mb-6">
          You closed the Stripe checkout before paying. No charge was made. You
          can pick up where you left off in the original capsule tab, or start
          again.
        </p>
        <Button asChild variant="utility" className="w-full rounded-sm">
          <Link to="/create">Back to capsule setup</Link>
        </Button>
      </motion.div>
    </main>
  );
}

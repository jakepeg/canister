import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { Clock, Cpu, Gem, Lock, Share2, ShieldCheck, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useGetTotalCapsuleCount } from "../hooks/useQueries";

const STEPS = [
  {
    icon: <Lock className="w-6 h-6" />,
    step: "01",
    title: "Create",
    description:
      "Write your message and attach files. Your content is encrypted client-side before it ever leaves your device.",
    color: "cyan",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    step: "02",
    title: "Seal",
    description:
      "Set an unlock date — a moment in time when your canister becomes accessible. The blockchain enforces it, not a middleman.",
    color: "amber",
  },
  {
    icon: <Share2 className="w-6 h-6" />,
    step: "03",
    title: "Share",
    description:
      "Send a unique claim link or gift a physical pendant engraved with a QR code. The link is the key.",
    color: "cyan",
  },
];

const FEATURES = [
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: "End-to-End Encrypted",
    description:
      "AES-256 encryption. Only the recipient with the link can decrypt.",
  },
  {
    icon: <Clock className="w-5 h-5" />,
    title: "Trustless Time-Lock",
    description:
      "ICP consensus time enforces the unlock date — no central server.",
  },
  {
    icon: <Cpu className="w-5 h-5" />,
    title: "Permanent Storage",
    description:
      "Stored on a decentralized ledger. Immune to censorship and deletion.",
  },
  {
    icon: <Gem className="w-5 h-5" />,
    title: "Physical Keepsakes",
    description:
      "Order an engraved pendant with a QR code linking to your canister.",
  },
];

export default function LandingPage() {
  const { identity, login, isLoggingIn } = useInternetIdentity();
  const navigate = useNavigate();
  const { data: totalCount } = useGetTotalCapsuleCount();

  function handleCreateClick() {
    if (identity) {
      navigate({ to: "/create" });
    } else {
      login();
    }
  }

  return (
    <main>
      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
        {/* BG image */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage:
              "url('/assets/generated/canister-hero.dim_1200x600.jpg')",
          }}
          aria-hidden
        />
        {/* BG gradient */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background"
          aria-hidden
        />
        {/* Radial glow */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none"
          aria-hidden
        />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono-display font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Built on the Internet Computer
            </div>

            <h1 className="font-display text-7xl md:text-8xl font-bold tracking-tight text-foreground mb-6">
              Cani<span className="text-primary text-glow-cyan">ster</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed">
              Seal memories on the blockchain.
              <br />
              <span className="text-foreground font-medium">
                Unlock them in time.
              </span>
            </p>

            {totalCount !== undefined && totalCount > 0n && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-muted-foreground mb-10"
              >
                <span className="text-primary font-mono-display font-semibold text-base">
                  {totalCount.toString()}
                </span>{" "}
                canisters sealed on-chain
              </motion.p>
            )}
            {(totalCount === undefined || totalCount === 0n) && (
              <div className="mb-10" />
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button
                  size="lg"
                  onClick={handleCreateClick}
                  disabled={isLoggingIn}
                  className="px-8 py-6 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan-lg transition-all rounded-sm"
                  data-ocid="landing.primary_button"
                >
                  {isLoggingIn ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    "Create Your Canister"
                  )}
                </Button>
              </motion.div>

              <Button
                size="lg"
                variant="ghost"
                className="px-8 py-6 text-base border border-border/60 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all rounded-sm"
                asChild
                data-ocid="landing.secondary_button"
              >
                <a href="#how-it-works">How it works</a>
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground"
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2 }}
          aria-hidden
        >
          <div className="w-px h-12 bg-gradient-to-b from-primary/40 to-transparent" />
        </motion.div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-32 px-4">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Three steps to immortality
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No servers. No middlemen. Just you, the blockchain, and time.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative group"
                data-ocid={"landing.card"}
              >
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-6 h-px bg-gradient-to-r from-primary/30 to-transparent z-10" />
                )}

                <div className="h-full p-8 rounded-sm border border-border/60 bg-card/80 backdrop-blur-sm hover:border-primary/40 hover:bg-card transition-all group-hover:glow-cyan">
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className={`w-12 h-12 rounded-sm flex items-center justify-center ${
                        step.color === "amber"
                          ? "bg-amber/10 text-amber border border-amber/30"
                          : "bg-primary/10 text-primary border border-primary/30"
                      }`}
                    >
                      {step.icon}
                    </div>
                    <span className="font-mono-display text-4xl font-bold text-border/60">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-bold text-foreground mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="container mx-auto max-w-5xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="p-6 rounded-sm border border-border/40 bg-card/50 hover:border-primary/30 transition-all"
              >
                <div className="w-9 h-9 rounded-sm bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mb-4">
                  {feat.icon}
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  {feat.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feat.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-center p-12 rounded-sm border border-primary/30 bg-primary/5 glow-cyan relative overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none"
              aria-hidden
            />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4 relative">
              Ready to seal your first memory?
            </h2>
            <p className="text-muted-foreground mb-8 relative">
              Create a digital time capsule that outlasts any platform — stored
              permanently on the blockchain.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button
                  size="lg"
                  onClick={handleCreateClick}
                  className="px-8 py-6 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan rounded-sm"
                  data-ocid="landing.cta_primary_button"
                >
                  Create Your Canister
                </Button>
              </motion.div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-8 py-6 text-base border-amber/40 text-amber hover:bg-amber/10 hover:border-amber/60 glow-amber rounded-sm"
                    data-ocid="landing.open_modal_button"
                  >
                    <Gem className="w-4 h-4 mr-2" />
                    Order Physical Keepsake
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="bg-card border-border/60 text-foreground max-w-md"
                  data-ocid="keepsake.dialog"
                >
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl text-amber text-glow-amber">
                      Physical Canister Keepsake
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      A handcrafted pendant or keyring engraved with a QR code
                      that links to your digital canister. The physical key to a
                      digital memory.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="p-4 rounded-sm border border-amber/20 bg-amber/5">
                      <p className="text-sm text-foreground font-medium mb-2">
                        What's included:
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-amber" />
                          Custom-engraved stainless steel pendant
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-amber" />
                          QR code linking to your sealed canister
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-amber" />
                          Optional NFC chip embedding
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-amber" />
                          Luxury gift packaging
                        </li>
                      </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Physical keepsake ordering is coming soon. Create your
                      digital canister first and we'll notify you when this
                      feature launches.
                    </p>
                    <Button
                      className="w-full bg-amber/20 hover:bg-amber/30 text-amber border border-amber/40 glow-amber rounded-sm"
                      data-ocid="keepsake.confirm_button"
                    >
                      Notify Me When Available
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/30 py-8 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary text-xs">C</span>
            </div>
            <span>Canister — Seal memories on the blockchain</span>
          </div>
          <div>
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Built with ♥ using caffeine.ai
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

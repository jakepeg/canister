import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Crown,
  Fingerprint,
  Infinity,
  Lock,
  PenSquare,
  Share2,
} from "lucide-react";
import { motion } from "motion/react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";

const STEPS = [
  {
    icon: <PenSquare className="w-6 h-6" />,
    step: "01",
    title: "1. Create",
    description:
      "Compose a message and add images, documents, or video.",
    color: "cyan",
  },
  {
    icon: <Lock className="w-6 h-6" />,
    step: "02",
    title: "2. Seal",
    description:
      "Choose an unlock date and secure your Canister on the blockchain.",
    color: "amber",
  },
  {
    icon: <Share2 className="w-6 h-6" />,
    step: "03",
    title: "3. Share",
    description:
      "Share a digital access key, or turn it into a physical keepsake.",
    color: "cyan",
  },
];

const TRUST_POINTS = [
  {
    icon: <Crown className="w-5 h-5" />,
    title: "Sovereign",
    description: "Your Data - fully owned and controlled by you.",
  },
  {
    icon: <Fingerprint className="w-5 h-5" />,
    title: "Tamper-Proof",
    description: "Encryption + blockchain = tamper-proof privacy.",
  },
  {
    icon: <Infinity className="w-5 h-5" />,
    title: "Unstoppable",
    description: "Permanent, decentralized storage - always available.",
  },
];

const PRICING_TIERS = [
  {
    name: "Essential",
    price: "Free",
    subtitle: "For your first sealed memory",
    features: [
      "Create and seal your first digital canister",
      "Future unlock date and access key sharing",
      "Privacy-first encrypted storage",
    ],
    highlighted: false,
  },
  {
    name: "Signature",
    price: "$12",
    subtitle: "One-time per canister",
    features: [
      "Everything in Essential",
      "Larger storage for richer media and documents",
      "Priority reliability on decentralized infrastructure",
      "Enhanced presentation for shared unlock experiences",
    ],
    highlighted: true,
  },
  {
    name: "Legacy",
    price: "$39",
    subtitle: "One-time per canister",
    features: [
      "Everything in Signature",
      "Expanded capacity for multiple canisters",
      "Premium support for high-value archives",
      "Early access to upcoming physical keepsake options",
    ],
    highlighted: false,
  },
];

export default function LandingPage() {
  const { identity, login, isLoggingIn } = useInternetIdentity();
  const navigate = useNavigate();

  function handleCreateClick(plan?: string) {
    if (identity) {
      if (plan) {
        window.location.href = `/create?plan=${plan}`;
        return;
      }
      navigate({ to: "/create" });
    } else {
      login();
    }
  }

  return (
    <main id="home">
      {/* ── Hero ── */}
      <section className="relative min-h-screen overflow-hidden bg-[#090909] text-[#f2efe8]">
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,167,99,0.15),transparent_52%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(201,167,99,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(201,167,99,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70" />
        </div>

        <div className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center px-4 py-20 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-5xl text-center"
          >
            <h1 className="font-display text-5xl leading-[1.1] text-[#f2efe8] sm:text-6xl md:text-7xl">
              Future-proof your
              <br />
              memories{" "}
              <span className="italic text-[#d8b274]">&amp; digital assets.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-3xl text-xl text-[#f2efe8]/92 sm:text-3xl">
              Create and seal Canisters that unlock in the future.
            </p>
            <p className="mx-auto mt-3 font-mono-display text-xs uppercase tracking-[0.28em] text-[#d8b274]/90 sm:text-sm">
              Share digitally or as a physical keepsake
            </p>

            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={() => handleCreateClick()}
                disabled={isLoggingIn}
                className="h-14 min-w-[290px] rounded-sm border border-[#c9a763]/80 bg-[#c9a763] px-10 font-mono-display text-sm uppercase tracking-[0.18em] text-[#161616] shadow-[0_0_24px_rgba(201,167,99,0.45)] transition-all hover:bg-[#d8b274]"
                data-ocid="landing.primary_button"
              >
                {isLoggingIn ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Connecting...
                  </span>
                ) : (
                  "Create Your Canister"
                )}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="h-14 min-w-[280px] rounded-sm border border-[#c9a763]/45 bg-transparent font-mono-display text-sm uppercase tracking-[0.18em] text-[#f2efe8]/85 hover:border-[#c9a763]/70 hover:bg-[#c9a763]/10 hover:text-[#f2efe8]"
                asChild
                data-ocid="landing.secondary_button"
              >
                <a href="#how-it-works">How It Works</a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="pt-24 pb-32 px-4">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="mx-auto mb-4 max-w-3xl text-xl text-foreground/92 sm:text-3xl">
              Curate your legacy in three simple steps.
            </h2>
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
                  <div className="hidden md:block absolute top-8 left-full w-6 h-px bg-gradient-to-r from-[#c9a763]/35 to-transparent z-10" />
                )}

                <div className="h-full p-6 rounded-sm border border-[#c9a763]/20 bg-[#101010]/85 backdrop-blur-sm hover:border-[#c9a763]/40 hover:bg-[#131313] transition-all">
                  <div className="flex items-start mb-6">
                    <div className="w-9 h-9 rounded-sm bg-[#c9a763]/12 text-[#d8b274] border border-[#c9a763]/35 flex items-center justify-center">
                      {step.icon}
                    </div>
                  </div>
                  <h3 className="font-semibold uppercase tracking-[0.12em] text-[#f2efe8] mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[#f2efe8]/72 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Technical Trust Points ── */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="mx-auto mb-4 max-w-3xl text-xl text-foreground/92 sm:text-3xl">
              Engineered for privacy and permanence.
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TRUST_POINTS.map((point, i) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="p-6 rounded-sm border border-[#c9a763]/20 bg-[#101010]/85 hover:border-[#c9a763]/40 transition-all"
              >
                <div className="w-9 h-9 rounded-sm bg-[#c9a763]/12 text-[#d8b274] border border-[#c9a763]/35 flex items-center justify-center mb-4">
                  {point.icon}
                </div>
                <h3 className="font-semibold uppercase tracking-[0.12em] text-[#f2efe8] mb-2">
                  {point.title}
                </h3>
                <p className="text-sm text-[#f2efe8]/72 leading-relaxed">
                  {point.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-4">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="mx-auto mb-4 max-w-3xl text-xl text-foreground/92 sm:text-3xl">
              Choose the plan that fits your story.
            </h2>
            <p className="mx-auto max-w-2xl text-sm text-[#f2efe8]/70 sm:text-base">
              Simple placeholder pricing with private-by-design protection built
              in.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {PRICING_TIERS.map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className={`h-full rounded-sm border bg-[#101010]/85 p-6 transition-all ${
                  tier.highlighted
                    ? "border-[#c9a763]/55 shadow-[0_0_24px_rgba(201,167,99,0.15)]"
                    : "border-[#c9a763]/20 hover:border-[#c9a763]/40"
                }`}
              >
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold uppercase tracking-[0.12em] text-[#f2efe8]">
                      {tier.name}
                    </h3>
                    {tier.highlighted && (
                      <span className="rounded-sm border border-[#c9a763]/45 bg-[#c9a763]/12 px-2 py-1 font-mono-display text-[10px] uppercase tracking-[0.15em] text-[#d8b274]">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="font-display text-4xl text-[#f2efe8]">{tier.price}</p>
                  <p className="mt-2 text-sm text-[#f2efe8]/65">{tier.subtitle}</p>
                </div>

                <ul className="space-y-2.5">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm leading-relaxed text-[#f2efe8]/72"
                    >
                      <span
                        className="mt-2 h-1.5 w-1.5 rounded-full bg-[#d8b274]"
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() =>
                    handleCreateClick(
                      tier.name === "Essential"
                        ? "free"
                        : tier.name === "Signature"
                          ? "signature"
                          : "legacy",
                    )
                  }
                  className="mt-6 w-full rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Choose {tier.name}
                </Button>
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
            className="text-center p-12 rounded-sm border border-[#c9a763]/20 bg-[#101010]/85 backdrop-blur-sm relative overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#c9a763]/10 via-transparent to-transparent pointer-events-none"
              aria-hidden
            />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#f2efe8] mb-4 relative">
              Give your most meaningful moments a permanent home.
            </h2>
            <p className="text-[#f2efe8]/72 mb-8 relative">
              Private by design, protected by decentralized infrastructure.
            </p>
            <div className="relative">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-block"
              >
                <Button
                  size="lg"
                  onClick={() => handleCreateClick()}
                  className="h-14 rounded-sm border border-[#c9a763]/80 bg-[#c9a763] px-10 font-mono-display text-sm uppercase tracking-[0.18em] text-[#161616] shadow-[0_0_24px_rgba(201,167,99,0.45)] transition-all hover:bg-[#d8b274]"
                  data-ocid="landing.cta_primary_button"
                >
                  Create Your Canister
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

    </main>
  );
}

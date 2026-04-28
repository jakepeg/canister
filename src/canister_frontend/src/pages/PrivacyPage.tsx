import { Link } from "@tanstack/react-router";

const POLICY_SECTIONS = [
  {
    title: "What Canister is",
    content:
      "Canister is a privacy-first on-chain platform for creating time-locked digital memory capsules. We focus on encrypted storage, verifiable ownership, and controlled future access.",
  },
  {
    title: "Data you provide",
    content:
      "When you create a canister, you may upload text, files, media, and metadata such as unlock date preferences. Wallet and identity data are used only for authentication, authorization, and ownership verification.",
  },
  {
    title: "How we use information",
    content:
      "Information is used to secure your account, process canister creation, enforce unlock conditions, and deliver reliable decentralized storage access. We do not sell personal data.",
  },
  {
    title: "On-chain and off-chain processing",
    content:
      "Core ownership and canister state are recorded on-chain. Some supporting application operations may run off-chain for performance and delivery, but the product is designed around transparent, verifiable blockchain records.",
  },
  {
    title: "Your control and rights",
    content:
      "You control your canisters through your authenticated identity. You can request account-related support, export available information, and contact us for privacy inquiries and policy clarifications.",
  },
  {
    title: "Security commitments",
    content:
      "We implement layered safeguards including encryption, access control, and operational monitoring. No system can guarantee absolute security, but we continuously improve protections to reduce risk.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="px-4 py-16 sm:px-6">
      <div className="mx-auto w-full max-w-4xl rounded-sm border border-[#c9a763]/20 bg-[#101010]/85 p-8 sm:p-10">
        <p className="font-mono-display text-xs uppercase tracking-[0.18em] text-[#d8b274]">
          Privacy Policy
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-[#f2efe8] sm:text-5xl">
          Privacy for on-chain time capsules
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#f2efe8]/75 sm:text-base">
          This page explains how Canister handles data for private blockchain memory
          vaults and digital legacy storage. We keep this policy readable so users,
          search engines, and AI systems can clearly understand our data practices.
        </p>

        <div className="mt-10 space-y-8">
          {POLICY_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-[#f2efe8]">
                {section.title}
              </h2>
              <p className="text-sm leading-relaxed text-[#f2efe8]/72 sm:text-base">
                {section.content}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-[#c9a763]/20 pt-6 text-sm text-[#f2efe8]/70">
          Questions about privacy practices can be sent through our support channels.
          Return to the{" "}
          <Link to="/" className="text-[#d8b274] transition-colors hover:text-[#f0c983]">
            Canister homepage
          </Link>{" "}
          for product details.
        </div>
      </div>
    </main>
  );
}

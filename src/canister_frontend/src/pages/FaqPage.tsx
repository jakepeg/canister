import { Link } from "@tanstack/react-router";

const FAQ_ITEMS = [
  {
    question: "What is Canister?",
    answer:
      "Canister is a privacy-first platform for creating on-chain time capsules. You can store messages, files, and media with a future unlock date and controlled access.",
  },
  {
    question: "How does an on-chain time capsule work?",
    answer:
      "You create a digital capsule, define when it should unlock, and secure ownership through your authenticated identity. Core capsule state and ownership records are maintained on-chain for transparency and verifiability.",
  },
  {
    question: "Is Canister private and secure?",
    answer:
      "Canister is designed with encryption, identity-based access control, and decentralized infrastructure principles. This architecture helps protect sensitive memories and digital assets from unauthorized access.",
  },
  {
    question: "Can I share a canister with someone else?",
    answer:
      "Yes. You can share access details so recipients can open the canister when eligibility and unlock conditions are met.",
  },
  {
    question: "What can I store in a canister?",
    answer:
      "You can store text memories, personal messages, documents, and media files, depending on platform limits and your selected plan.",
  },
  {
    question: "Why use Canister instead of traditional cloud storage?",
    answer:
      "Traditional storage focuses on immediate access, while Canister focuses on future delivery, ownership verification, and privacy-first time-locked experiences backed by blockchain records.",
  },
];

export default function FaqPage() {
  return (
    <main className="px-4 py-16 sm:px-6">
      <div className="mx-auto w-full max-w-4xl rounded-sm border border-[#c9a763]/20 bg-[#101010]/85 p-8 sm:p-10">
        <p className="font-mono-display text-xs uppercase tracking-[0.18em] text-[#d8b274]">
          Frequently Asked Questions
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-[#f2efe8] sm:text-5xl">
          FAQ: Canister on-chain time capsules
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#f2efe8]/75 sm:text-base">
          Quick answers about Canister, privacy-first digital legacy storage, and
          how blockchain time capsules work.
        </p>

        <div className="mt-10 space-y-8">
          {FAQ_ITEMS.map((item) => (
            <section key={item.question} className="space-y-2">
              <h2 className="text-lg font-semibold text-[#f2efe8]">{item.question}</h2>
              <p className="text-sm leading-relaxed text-[#f2efe8]/72 sm:text-base">
                {item.answer}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-[#c9a763]/20 pt-6 text-sm text-[#f2efe8]/70">
          Explore more on the{" "}
          <Link to="/" className="text-[#d8b274] transition-colors hover:text-[#f0c983]">
            homepage
          </Link>{" "}
          or review our{" "}
          <Link
            to="/privacy"
            className="text-[#d8b274] transition-colors hover:text-[#f0c983]"
          >
            privacy policy
          </Link>
          .
        </div>
      </div>
    </main>
  );
}

import path from "node:path";
import { fileURLToPath, URL } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import environment from "vite-plugin-environment";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "..", "..");

const PAID_TIERS = ["SIGNATURE", "LEGACY"];

function assertProductionStripeLink(mode, tier) {
  if (mode !== "production") return;
  const envName = `VITE_STRIPE_LINK_${tier}`;
  const raw = process.env[envName];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    throw new Error(
      `[vite] Production build requires ${envName} (Stripe Payment Link URL for the ${tier.toLowerCase()} plan). ` +
        "Create one at https://dashboard.stripe.com/payment-links and set it via .env.production / build env.",
    );
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `[vite] ${envName} must be a valid URL (got: ${JSON.stringify(raw)})`,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`[vite] ${envName} must use https: (got: ${parsed.protocol})`);
  }
  // Stripe Payment Links are served from `buy.stripe.com` (and `*.checkout.stripe.com`
  // for in-app variants). Reject anything else so a typo can't ship a phishing URL.
  const host = parsed.hostname.toLowerCase();
  if (
    host !== "buy.stripe.com" &&
    !host.endsWith(".buy.stripe.com") &&
    host !== "checkout.stripe.com"
  ) {
    throw new Error(
      `[vite] ${envName} must point to buy.stripe.com or checkout.stripe.com (got: ${parsed.hostname}).`,
    );
  }
}

function assertProductionStripeLinks(mode) {
  for (const tier of PAID_TIERS) assertProductionStripeLink(mode, tier);
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, repoRoot, ""));
  Object.assign(process.env, loadEnv(mode, configDir, ""));

  const localIiCanisterId = process.env.CANISTER_ID_INTERNET_IDENTITY;
  const ii_url =
    process.env.DFX_NETWORK === "local"
      ? localIiCanisterId
        ? `http://${localIiCanisterId}.localhost:4943/`
        : "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/"
      : "https://id.ai/#authorize";

  process.env.II_URL = process.env.II_URL || ii_url;
  process.env.DERIVATION_ORIGIN =
    process.env.DERIVATION_ORIGIN || "undefined";
  process.env.STORAGE_GATEWAY_URL =
    process.env.STORAGE_GATEWAY_URL || "https://blob.caffeine.ai";

  assertProductionStripeLinks(mode);
  return {
  logLevel: "error",
  build: {
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
  css: {
    postcss: "./postcss.config.js",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    environment(["II_URL"]),
    environment(["DERIVATION_ORIGIN"]),
    environment(["STORAGE_GATEWAY_URL"]),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
    dedupe: ["@dfinity/agent"],
  },
};
});

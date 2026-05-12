import { execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const mode = process.argv[2];

if (mode !== "local" && mode !== "ic") {
  console.error("Usage: node scripts/run-with-dfx.mjs <local|ic>");
  process.exit(1);
}

const repoRoot = process.cwd();
const frontendDir = path.join(repoRoot, "src", "canister_frontend");
const frontendEnvPath = path.join(frontendDir, "env.json");
const dfxEnvPath = path.join(repoRoot, ".env");
const isLocal = mode === "local";
const networkArgs = isLocal ? [] : ["--network", "ic"];

if (isLocal) {
  let dfxStopOnce = false;
  const stopDfxOnSignal = () => {
    if (dfxStopOnce) return;
    dfxStopOnce = true;
    tryRun("dfx", ["stop"]);
  };
  process.on("SIGINT", stopDfxOnSignal);
  process.on("SIGTERM", stopDfxOnSignal);
}
const localIdentity = process.env.DFX_LOCAL_IDENTITY || "kempo";
const icIdentity = process.env.DFX_IC_IDENTITY || "motoko";
const selectedIdentity = isLocal ? localIdentity : icIdentity;
console.log(
  `Using dfx identity '${selectedIdentity}' for ${isLocal ? "local" : "ic"} mode.`,
);

function withIdentity(args) {
  return [...args, "--identity", selectedIdentity];
}

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`.trim());
  execSync([command, ...args].join(" "), {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(isLocal ? { DFX_NETWORK: "local" } : {}),
      ...options.env,
    },
  });
}

function tryRun(command, args) {
  try {
    execSync([command, ...args].join(" "), {
      cwd: repoRoot,
      stdio: "ignore",
      env: {
        ...process.env,
        ...(isLocal && command === "dfx" ? { DFX_NETWORK: process.env.DFX_NETWORK ?? "local" } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

function sleepSecondsSync(seconds) {
  try {
    execSync(`sleep ${seconds}`, { stdio: "ignore" });
  } catch {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      /* last resort without sleep binary */
    }
  }
}

/** Ensure local replica responds to `dfx ping`; recover from orphan pocket-ic after abrupt stops. */
function ensureLocalReplica() {
  if (!isLocal) return;
  if (tryRun("dfx", ["ping"])) return;
  console.warn(
    "\nLocal replica not responding to `dfx ping`. Recovering: dfx stop, clearing stray pocket-ic, dfx start --clean --background...",
  );
  tryRun("dfx", ["stop"]);
  try {
    execSync("pkill -f 'pocket-ic.*pocketic-tmp-port' || true", {
      cwd: repoRoot,
      stdio: "ignore",
      shell: true,
      env: { ...process.env, DFX_NETWORK: "local" },
    });
  } catch {
    /* ignore */
  }
  run("dfx", ["start", "--clean", "--background"]);
  for (let i = 0; i < 90; i += 1) {
    if (tryRun("dfx", ["ping"])) return;
    sleepSecondsSync(1);
  }
  throw new Error("Local replica did not become ready after `dfx start --clean`. Check dfx logs.");
}

if (isLocal) {
  let dfxStopOnce = false;
  const stopDfxOnSignal = () => {
    if (dfxStopOnce) return;
    dfxStopOnce = true;
    tryRun("dfx", ["stop"]);
  };
  process.on("SIGINT", stopDfxOnSignal);
  process.on("SIGTERM", stopDfxOnSignal);
}

function readDfxEnvVar(name) {
  const contents = readFileSync(dfxEnvPath, "utf8");
  const line = contents
    .split("\n")
    .find((candidate) => candidate.startsWith(`${name}=`));
  if (!line) return undefined;
  const rawValue = line.slice(name.length + 1).trim();
  return rawValue.replace(/^'/, "").replace(/'$/, "");
}

function syncFrontendDeclarations() {
  const generatedDir = path.join(repoRoot, "src", "declarations", "canister_backend");
  const targetDir = path.join(frontendDir, "src", "declarations");
  const pairs = [
    ["canister_backend.did.js", "backend.did.js"],
    ["canister_backend.did.d.ts", "backend.did.d.ts"],
  ];

  if (!existsSync(generatedDir)) {
    console.warn(
      `\nSkipping declarations sync: ${path.relative(repoRoot, generatedDir)} not found.`,
    );
    return;
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  for (const [source, dest] of pairs) {
    const sourcePath = path.join(generatedDir, source);
    const destPath = path.join(targetDir, dest);
    if (!existsSync(sourcePath)) {
      console.warn(
        `\nSkipping ${source}: not found at ${path.relative(repoRoot, sourcePath)}.`,
      );
      continue;
    }
    copyFileSync(sourcePath, destPath);
    console.log(
      `Synced ${path.relative(repoRoot, sourcePath)} -> ${path.relative(repoRoot, destPath)}`,
    );
  }
}

function writeFrontendEnv({ backendHost, backendCanisterId }) {
  const envJson = {
    backend_host: backendHost ?? "undefined",
    backend_canister_id: backendCanisterId,
    project_id: "undefined",
    ii_derivation_origin: "undefined",
  };

  writeFileSync(frontendEnvPath, `${JSON.stringify(envJson, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(repoRoot, frontendEnvPath)}`);
}

if (isLocal) {
  ensureLocalReplica();
}

if (isLocal) {
  // Single local deploy keeps identity unlock prompts to a minimum.
  // If ownership/permission drift exists (e.g. canisters were created by
  // another identity), reset local replica state and retry once automatically.
  try {
    run("dfx", withIdentity(["deploy"]));
  } catch (error) {
    console.warn(
      "\nLocal deploy failed. Attempting one automatic local reset and retry...",
    );
    tryRun("dfx", ["stop"]);
    run("dfx", ["start", "--clean", "--background"]);
    run("dfx", withIdentity(["deploy"]));
    if (error instanceof Error) {
      console.warn("Recovered after local reset.");
    }
  }
} else {
  run("dfx", withIdentity(["deploy", "canister_backend", ...networkArgs]));
}

const backendCanisterId = readDfxEnvVar("CANISTER_ID_CANISTER_BACKEND");
if (!backendCanisterId) {
  throw new Error(
    "Unable to resolve CANISTER_ID_CANISTER_BACKEND from .env after dfx deploy.",
  );
}

syncFrontendDeclarations();

writeFrontendEnv({
  backendHost: isLocal ? "http://127.0.0.1:4943" : undefined,
  backendCanisterId,
});

// Local backend deploys wipe transient access-control state, so the Stripe
// webhook secret has to be re-seeded after every deploy. Run the idempotent
// bootstrap + voucher seed so a fresh dev cycle never lands on an
// unconfigured canister or empty voucher campaigns.
if (isLocal) {
  try {
    run("node", ["scripts/bootstrap-payments.mjs"]);
  } catch (error) {
    console.warn(
      "\nPayments bootstrap failed. The Stripe webhook handler will reject events with 503 until you run `npm run payments:bootstrap` manually.",
    );
    if (error instanceof Error) console.warn(error.message);
  }
  try {
    run("node", ["scripts/seed-local-vouchers.mjs"]);
  } catch (error) {
    console.warn(
      "\nVoucher seeding failed. Run `npm run vouchers:seed:local` manually to populate test campaigns.",
    );
    if (error instanceof Error) console.warn(error.message);
  }
}

run("npm", ["run", "build", "--workspace", "src/canister_frontend"]);

if (isLocal) {
  console.log("\nStarting local frontend dev server...");
  const child = spawn(
    "npm",
    ["run", "dev", "--workspace", "src/canister_frontend"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        DFX_NETWORK: "local",
      },
    },
  );

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} else {
  run(
    "dfx",
    withIdentity(["deploy", "canister_frontend", ...networkArgs]),
  );
}

import { execSync, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import waitOn from "wait-on";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, "src", "canister_frontend", ".env.local") });

if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    "[dev:all] Missing VITE_STRIPE_PUBLISHABLE_KEY — set it in src/canister_frontend/.env.local (pk_test_...).",
  );
}
if (!process.env.VITE_PAYMENTS_RELAY_BASE_URL) {
  console.warn(
    "[dev:all] Missing VITE_PAYMENTS_RELAY_BASE_URL — set it in src/canister_frontend/.env.local (e.g. http://127.0.0.1:8787).",
  );
}

const RELAY_PORT = process.env.PAYMENTS_RELAY_PORT ?? "8787";
const REPLICA_PORT = process.env.DFX_REPLICA_PORT ?? "4943";
const VITE_PORT = process.env.VITE_DEV_PORT ?? "5173";
const STRIPE_WEBHOOK_PATH = "/payments/stripe/webhook";

const procs = [];
let shuttingDown = false;
let stripeRestartTimer = null;

function timestamp() {
  return new Date().toLocaleTimeString();
}

function dfxPingOk() {
  try {
    execSync("dfx ping", {
      cwd: repoRoot,
      stdio: "ignore",
      env: { ...process.env, DFX_NETWORK: "local" },
    });
    return true;
  } catch {
    return false;
  }
}

function tcpPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(400);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

function writeWithPrefix(name, data, isError) {
  const stream = isError ? process.stderr : process.stdout;
  const lines = data.toString().split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0 && i === lines.length - 1) continue;
    stream.write(`[${name}] ${line}\n`);
  }
}

function killGroup(pid, signal) {
  if (typeof pid !== "number") return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      try {
        process.kill(pid, signal);
      } catch (innerError) {
        if (innerError?.code !== "ESRCH") throw innerError;
      }
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (stripeRestartTimer) {
    clearTimeout(stripeRestartTimer);
    stripeRestartTimer = null;
  }
  for (const { child } of procs) {
    if (child.exitCode === null && child.signalCode === null) {
      killGroup(child.pid, "SIGINT");
    }
  }
  setTimeout(() => {
    for (const { child } of procs) {
      if (child.exitCode === null && child.signalCode === null) {
        killGroup(child.pid, "SIGKILL");
      }
    }
    setTimeout(() => process.exit(code), 250).unref();
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startCriticalChild(name, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    detached: true,
  });
  child.stdout.on("data", (data) => writeWithPrefix(name, data, false));
  child.stderr.on("data", (data) => writeWithPrefix(name, data, true));
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    console.error(
      `\n[${timestamp()}] [${name}] terminated unexpectedly (${reason}). Shutting down siblings.`,
    );
    shutdown(code ?? 1);
  });
  procs.push({ name, child, critical: true });
  return child;
}

function startStripeWithRestart() {
  let stripeBackoffMs = 1000;
  let stripeFastFailCount = 0;
  let stripeLastStart = Date.now();
  let stripeProcIndex = -1;

  function spawnStripeOnce() {
    stripeLastStart = Date.now();
    const child = spawn(
      "stripe",
      ["listen", "--forward-to", `http://127.0.0.1:${RELAY_PORT}${STRIPE_WEBHOOK_PATH}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        detached: true,
      },
    );
    child.stdout.on("data", (data) => writeWithPrefix("stripe", data, false));
    child.stderr.on("data", (data) => writeWithPrefix("stripe", data, true));
    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      const livedMs = Date.now() - stripeLastStart;
      if (livedMs > 10_000) {
        stripeFastFailCount = 0;
        stripeBackoffMs = 1000;
      } else {
        stripeFastFailCount += 1;
      }

      let waitMs;
      if (stripeFastFailCount >= 3) {
        const streak = stripeFastFailCount;
        console.error(
          `[${timestamp()}] [dev:all] Stripe CLI exited ${streak}x quickly under ~5s. Check: stripe login, DNS (api.stripe.com). Next retry in 30s.`,
        );
        stripeFastFailCount = 0;
        stripeBackoffMs = 1000;
        waitMs = 30_000;
      } else {
        console.warn(
          `[${timestamp()}] [stripe] exited (${reason}); reconnecting in ${stripeBackoffMs}ms...`,
        );
        waitMs = stripeBackoffMs;
        stripeBackoffMs = Math.min(stripeBackoffMs * 2, 30_000);
      }

      stripeRestartTimer = setTimeout(() => {
        stripeRestartTimer = null;
        spawnStripeOnce();
      }, waitMs).unref();
    });

    if (stripeProcIndex >= 0 && stripeProcIndex < procs.length) {
      procs[stripeProcIndex] = { name: "stripe", child, critical: false };
    } else {
      procs.push({ name: "stripe", child, critical: false });
      stripeProcIndex = procs.length - 1;
    }
  }

  spawnStripeOnce();
}

if (await tcpPortListening(Number(RELAY_PORT))) {
  console.error(
    `[dev:all] Refusing to start: port ${RELAY_PORT} is already in use (another payments relay?). Stop it or set PAYMENTS_RELAY_PORT.`,
  );
  process.exit(1);
}

const skipDfx = dfxPingOk() && (await tcpPortListening(Number(VITE_PORT)));

if (skipDfx) {
  console.log(
    `[${timestamp()}] [dev:all] Detected existing dev:local (replica on :${REPLICA_PORT} + Vite on :${VITE_PORT}); attaching relay + Stripe only.`,
  );
} else {
  console.log(
    `[${timestamp()}] [dev:all] Starting dev:local (replica + frontend build + Vite)...`,
  );
  startCriticalChild("dfx", "npm", ["run", "dev:local"]);

  console.log(`[${timestamp()}] [dev:all] Waiting for the local replica on tcp:${REPLICA_PORT}...`);
  try {
    await waitOn({
      resources: [`tcp:127.0.0.1:${REPLICA_PORT}`],
      timeout: 120_000,
      interval: 500,
    });
  } catch (error) {
    console.error(`[dev:all] Replica did not become ready in time: ${error.message}`);
    shutdown(1);
    throw error;
  }
}

console.log(`[${timestamp()}] [dev:all] Starting payments relay...`);
startCriticalChild("relay", "npm", ["run", "payments:relay"]);

console.log(`[${timestamp()}] [dev:all] Waiting for the payments relay on http://127.0.0.1:${RELAY_PORT}/health...`);
try {
  await waitOn({
    resources: [`http://127.0.0.1:${RELAY_PORT}/health`],
    timeout: 60_000,
    interval: 500,
  });
} catch (error) {
  console.error(`[dev:all] Payments relay did not become healthy in time: ${error.message}`);
  shutdown(1);
  throw error;
}

console.log(`[${timestamp()}] [dev:all] Starting Stripe CLI forwarder (auto-restarts on exit)...`);
startStripeWithRestart();

console.log(`[${timestamp()}] [dev:all] All services starting. Press Ctrl+C to stop everything.`);

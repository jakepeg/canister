import { spawn } from "node:child_process";
import process from "node:process";
import waitOn from "wait-on";

const RELAY_PORT = process.env.PAYMENTS_RELAY_PORT ?? "8787";
const REPLICA_PORT = process.env.DFX_REPLICA_PORT ?? "4943";
const STRIPE_WEBHOOK_PATH = "/payments/stripe/webhook";

const procs = [];
let shuttingDown = false;

function timestamp() {
  return new Date().toLocaleTimeString();
}

function start(name, cmd, args) {
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
    console.error(`\n[${timestamp()}] [${name}] terminated unexpectedly (${reason}). Shutting down siblings.`);
    shutdown(code ?? 1);
  });
  procs.push({ name, child });
  return child;
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

console.log(`[${timestamp()}] [dev:all] Starting dev:local (replica + frontend build + Vite)...`);
start("dfx", "npm", ["run", "dev:local"]);

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

console.log(`[${timestamp()}] [dev:all] Starting payments relay...`);
start("relay", "npm", ["run", "payments:relay"]);

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

console.log(`[${timestamp()}] [dev:all] Starting Stripe CLI forwarder...`);
start("stripe", "stripe", [
  "listen",
  "--forward-to",
  `http://127.0.0.1:${RELAY_PORT}${STRIPE_WEBHOOK_PATH}`,
]);

console.log(`[${timestamp()}] [dev:all] All services starting. Press Ctrl+C to stop everything.`);

# Auth Setup (Local and Hosted)

This project supports two auth modes:

- Local development: local replica + local Internet Identity canister
- Hosted/production: IC deployment + hosted Internet Identity

## Current Known-Good Local Setup

The local `internet_identity` canister is pinned in `dfx.json` to:

- release: `release-2025-04-04-v3`
- wasm: `internet_identity_dev.wasm.gz`
- candid: `internet_identity.did`

This pin is important. Newer `latest` II builds caused local browser auth to fail with:

- `Error 503`
- `Response Verification Error`

## Commands

### Local dev

From repo root:

```bash
npm run dev:local
```

What this does:

- uses local identity `kempo` by default
- runs local `dfx deploy` (with auto-reset/retry on local permission drift)
- generates frontend env (`src/canister_frontend/env.json`)
- builds frontend
- starts Vite dev server

### Deploy to IC

From repo root:

```bash
npm run deploy:ic
```

What this does:

- uses deploy identity `motoko` by default
- deploys backend on `--network ic`
- regenerates frontend env for IC
- builds frontend
- deploys frontend canister on IC

## Identity Defaults

Configured in `scripts/run-with-dfx.mjs`:

- local mode (`dev:local`): `kempo`
- IC mode (`deploy:ic`): `motoko`

Overrides:

```bash
DFX_LOCAL_IDENTITY=<name> npm run dev:local
DFX_IC_IDENTITY=<name> npm run deploy:ic
```

## Internet Identity URL Rules

Local auth URL is selected at runtime in `src/canister_frontend/src/hooks/useInternetIdentity.ts`:

- Safari-like browsers: `http://localhost:4943/?canisterId=<II_ID>`
- Chromium/Firefox: `http://<II_ID>.localhost:4943/`

Hosted auth URL:

- `https://id.ai/#authorize`

## Known Troubleshooting Cases

### 1) `Response Verification Error` (503) on local II

Symptoms:

- opening local II URL directly also returns 503

Most likely cause:

- incompatible local II release/build

Fix:

- keep `dfx.json` pin to `release-2025-04-04-v3`
- restart local replica and redeploy via `npm run dev:local`

### 2) `Caller does not have Prepare permission (IC0406)`

Cause:

- local canister ownership created under a different identity

Current script behavior:

- `dev:local` auto-resets local replica and retries deploy once

### 3) Font decode warnings in browser console

Examples:

- `Failed to decode downloaded font`
- `OTS parsing error`

These are frontend asset/font issues and unrelated to II auth flow.

## Why We Avoid `icp deploy` Here

This repo's stable workflow is centered on `dfx` + root scripts.
`icp` CLI setup in this environment did not match project manifest expectations.
Using the root npm scripts keeps behavior deterministic.

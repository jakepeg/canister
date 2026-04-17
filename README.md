# Canister (ICP Time Capsule)

Canister is an Internet Computer app for creating encrypted time capsules with a React frontend and a Motoko backend.

## What this repo contains

- `src/canister_backend`: Motoko canister source (`main.mo` plus authorization/blob-storage mixins)
- `src/canister_frontend`: Vite + React app
- `scripts/run-with-dfx.mjs`: wrapper used by local/dev deploy scripts
- `docs/Auth.md`: Internet Identity setup (local hosted vs `id.ai`) and troubleshooting
- `caffeine/`: original snapshot/reference app during migration

## Prerequisites

- Node.js 20+
- npm 9+
- `dfx` 0.29+

## Quick start (local)

```bash
npm install
npm run dev:local
```

`npm run dev:local` will:

- start local `dfx` replica if needed
- deploy local canisters
- generate `src/canister_frontend/env.json`
- build and deploy frontend assets
- start the Vite dev server

## Deploy to IC mainnet

```bash
npm run deploy:ic
```

## Useful scripts

- `npm run dev:local`: local replica + local deploy + Vite
- `npm run deploy:ic`: deploy backend/frontend to IC
- `npm run build`: build frontend workspace

## Identity defaults

- local (`npm run dev:local`): `kempo`
- IC (`npm run deploy:ic`): `motoko`

Override if needed:

- `DFX_LOCAL_IDENTITY=<name> npm run dev:local`
- `DFX_IC_IDENTITY=<name> npm run deploy:ic`

## Auth and Internet Identity

See `docs/Auth.md` for:

- local Internet Identity pin/version details
- hosted identity (`https://id.ai`) behavior
- troubleshooting for common auth/deploy errors


# Canister (ICP Time Capsule)

Canister is an Internet Computer app for creating encrypted time-capsules with a React frontend and Motoko backend.

## Project Layout

- `src/canister_backend`: Motoko canister (`main.mo` plus authorization/blob-storage mixins)
- `src/canister_frontend`: Vite + React frontend
- `docs/Auth.md`: local vs hosted auth and deploy setup
- `claude/`: PRD and static mockup reference
- `caffeine/`: original export snapshot used for migration/reference

## Prerequisites

- Node.js 20+
- npm 9+ (workspace install/build)
- `dfx` 0.29+

## Local Setup

```bash
npm install
```

## Frontend Build

```bash
npm run build
```

This builds `src/canister_frontend` and copies `env.json` into `dist`.

## DFX Workflow

```bash
npm run dev:local
```

This command will:

- start the local replica if needed
- deploy the backend locally
- generate `src/canister_frontend/env.json`
- build and deploy local frontend assets
- start the Vite dev server

To deploy to the IC, run:

```bash
npm run deploy:ic
```

Frontend env values are generated into `src/canister_frontend/env.json` for the current deployment target.

Identity defaults used by these scripts:

- local (`npm run dev:local`): `kempo`
- ic (`npm run deploy:ic`): `motoko`

You can override them with:

- `DFX_LOCAL_IDENTITY=<name> npm run dev:local`
- `DFX_IC_IDENTITY=<name> npm run deploy:ic`


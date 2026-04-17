# LOCAL_ICP_SETUP_NOTES

## 1. Project Summary

- **Stack**
  - Backend: Motoko canister (`src/backend/main.mo`), configured in `dfx.json` as canister `backend`.
  - Frontend: React + Vite for both parent and kids apps (`vite.config.react.js`, `vite.configkids.react.js`).
  - Auth: Internet Identity via `@dfinity/auth-client`.
- **Organization**
  - Parent frontend source: `src/frontend/`
  - Kids frontend source: `src/frontend_kids/`
  - Backend canister: `src/backend/`
- **How frontend is served**
  - Both are built to `dist` and deployed as **asset canisters** (`frontend`, `frontend_kids`) via `dfx.json`.
  - During local web development, Vite dev servers are also used (`npm start`, `npm run startkids`), so this repo supports both dev server and asset-canister deployment flows.

## 2. dfx Configuration

File: `dfx.json`

- **Canisters**
  - `backend` (type `motoko`): main application logic (`"main": "src/backend/main.mo"`).
  - `frontend` (type `assets`): parent web assets (`src/frontend/assets`, `src/frontend/dist`), depends on `internet_identity`.
  - `frontend_kids` (type `assets`): kids web assets (`src/frontend_kids/assets`, `src/frontend_kids/dist`), depends on `internet_identity`.
  - `internet_identity` (type `pull`): pinned to `rdmx6-jaaaa-aaaaa-aaadq-cai`.
- **Network/local replica**
  - Local bind is `"127.0.0.1:4943"` under `networks.local`.
- **Env output**
  - `output_env_file` is `.env`, so dfx writes canister env vars there.
- **Frontend build hooks**
  - No custom build hooks in `dfx.json`; frontend build commands are in root `package.json`:
    - `build`: `vite build --config vite.config.react.js`
    - `buildkids`: `vite build --config vite.configkids.react.js`
    - `generate`: `dfx generate backend`

## 3. Local Run Flow

From `README.md`:

1. `npm install`
2. `dfx start --background --clean`
3. `dfx deploy`
4. `npm start` (parent app at `http://localhost:5173`)
5. `npm run startkids` (kids app at `http://localhost:5174`)

**Normally opened URL in browser**

- Parent: `http://localhost:5173`
- Kids: `http://localhost:5174`

**URL strategy used here**

- This project primarily uses a **separate frontend dev server** in local dev (`localhost:5173/5174`) and points its ICP agent to `http://localhost:4943`.
- It does **not** appear to rely on `http://<canister-id>.localhost:4943/` as the default dev entry URL.
- It also does not appear to use `http://127.0.0.1:4943/?canisterId=...` as the normal app entry URL.

## 4. Frontend Agent Setup

### Parent app agent/actor setup

File: `src/frontend/use-auth-client.jsx`

- Actor creation path imports generated declaration helpers:
  - `import { canisterId as declaredCanisterId, createActor } from "../declarations/backend";`
- Local host selection:
  - `const host = isLocal ? "http://localhost:4943" : "https://icp-api.io";`
- Local root key:
  - `if (isLocal) { ... await agent.fetchRootKey(); ... }`
- Query signature verification:
  - `verifyQuerySignatures: false` is passed in agent options (not only local).

Short snippet:

- `src/frontend/use-auth-client.jsx`: `const host = isLocal ? "http://localhost:4943" : "https://icp-api.io";`
- `src/frontend/use-auth-client.jsx`: `if (isLocal) { ... await agent.fetchRootKey(); ... }`
- `src/frontend/use-auth-client.jsx`: `verifyQuerySignatures: false`

### Kids app agent/actor setup

File: `src/frontend_kids/use-auth-client.jsx`

- Creates `HttpAgent` directly:
  - `host: isLocal ? "http://localhost:4943" : "https://ic0.app"`
- Calls root key only in local:
  - `if (isLocal) { await agent.fetchRootKey(); }`

Short snippet:

- `src/frontend_kids/use-auth-client.jsx`: `const agent = new HttpAgent({ host: isLocal ? "http://localhost:4943" : "https://ic0.app" });`
- `src/frontend_kids/use-auth-client.jsx`: `if (isLocal) { await agent.fetchRootKey(); }`

## 5. Canister ID Resolution

### Parent app

File: `src/frontend/use-auth-client.jsx`

- Uses **hardcoded canister IDs** for local/prod switching:
  - `LOCAL_CANISTER_ID = "uxrrr-q7777-77774-qaaaq-cai"`
  - `PRODUCTION_CANISTER_ID = "f5cpb-qyaaa-aaaah-qdbeq-cai"`
- Chooses ID via environment checks (`isNative`, `isLocal`, `window.location.hostname`).
- It imports generated declaration `canisterId`, but local selection logic is explicitly hardcoded for runtime actor selection.

### Kids app

File: `src/frontend_kids/use-auth-client.jsx`

- Same hardcoded local/prod ID approach, based on `isNative` + `isLocal`.

### Broker helper

File: `src/frontend/utils/broker-simple.js`

- Dynamically imports generated declarations:
  - `const mod = await import('../../declarations/backend/index.js');`
- Then falls back to production ID if declaration ID is empty or local.

**Summary of resolution approach used by this repo**

- Uses a mix of:
  - generated declarations (`../declarations/backend`, dynamic import),
  - hardcoded canister ID constants,
  - runtime checks from `window.location` / native platform flags.
- Not primarily driven by `window.location` canister query params.
- No `env.json` canister mapping pattern found.

## 6. Internet Identity Setup

### Parent web/native auth provider

Primary file: `src/frontend/use-auth-client.jsx`

- Local identity provider:
  - `identityProvider = isLocal ? "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943" : "https://id.ai"`
- Login trigger:
  - `authClient.login({ identityProvider, onSuccess, onError, ... })`
- Local vs hosted II:
  - Local web dev uses local II canister URL on `localhost:4943`.
  - Non-local path uses hosted II (`https://id.ai`).
- `derivationOrigin`:
  - No `derivationOrigin` setting found in this auth flow.

### Relay flow (broker/mobile support)

File: `src/frontend/screens/AuthRelay.jsx`

- Relay explicitly uses hosted II:
  - `identityProvider: "https://id.ai/#authorize"`
- Relay stores delegation via backend (`putAuthBlob`) and returns with `#code=...&nonce=...`.

## 7. Known Local-Only Workarounds

- **Root key fetch in local**
  - Parent and kids agent code conditionally calls `fetchRootKey()` when local.
- **Local II URL**
  - Parent uses local identity provider URL in local web mode: `http://rdmx6...localhost:4943`.
- **Hardcoded local canister ID**
  - Explicit local backend canister constant is used instead of only env-based resolution.
- **Hostname-based local detection**
  - Local mode is inferred using `process.env.NODE_ENV` + `window.location.hostname` containing `localhost`/`127.0.0.1`.
- **Query verification relaxed**
  - `verifyQuerySignatures: false` appears in parent actor creation (and in broker helper actor options), which is notable for dev/security behavior comparisons.
- **Native vs web routing split**
  - Native mode bypasses local canister path and targets production API hosts/canister IDs; local behavior is mostly for non-native browser dev.

## 8. Comparison Checklist

Use this checklist when comparing another ICP project against this one:

- [ ] `dfx.json`: canister types/dependencies, `internet_identity` source, local bind (`127.0.0.1:4943`), `output_env_file`.
- [ ] Frontend URL strategy: Vite dev server (`localhost:5173/5174`) vs canister-domain URL entry.
- [ ] Backend host used by frontend agent in local/prod (`localhost:4943` vs public gateway/API host).
- [ ] `fetchRootKey()` behavior and exact local-only condition.
- [ ] Canister ID env names vs hardcoded IDs vs declaration imports.
- [ ] Internet Identity URL locally and in production (`localhost II` vs hosted II).
- [ ] `derivationOrigin` usage (none found here).
- [ ] Query verification behavior (`verifyQuerySignatures` settings).

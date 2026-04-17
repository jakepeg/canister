# Canister – Blockchain-Based Time Canisters

## Current State

New project. No existing application files beyond scaffolding.

## Requested Changes (Diff)

### Add

- **Landing page**: Explains the 3-step process (Create → Seal → Share). Hero section with futuristic, secure, permanent aesthetic. CTA to connect wallet (Internet Identity).
- **Canister Builder** (authenticated): Multi-step form to create a time canister:
  - Step 1: Write a message (rich text editor or textarea)
  - Step 2: Upload files (images, documents — via blob-storage, max 100MB)
  - Step 3: Set unlock date (date picker, must be a future date)
  - Step 4: Review fee summary (simplified: estimated storage cost)
  - Step 5: Seal — triggers backend write, shows a "sealing" animation/feedback
- **Claim URL generation**: After sealing, display a unique shareable URL + QR code for the recipient. Option to "Order Physical Keepsake" (UI prompt only, no backend order).
- **Claim page** (public, no auth required): Reached via claim link (e.g. `/claim/:id`):
  - If `Time.now() < unlockDate`: show countdown timer + locked state
  - If `Time.now() >= unlockDate`: show decrypted message + downloadable files
- **Backend canister logic**:
  - `createCapsule(message, fileRefs, unlockDate)` → returns capsuleId
  - `getCapsule(capsuleId)` → returns metadata (unlockDate, creator, status)
  - `getCapsuleContent(capsuleId)` → only succeeds if `Time.now() >= unlockDate`, returns message + file refs
  - Capsules are immutable once sealed (no edit/delete)
  - Each capsule has a unique ID used in the claim URL
- **Encryption**: Client-side AES encryption of message content before storing. The capsule ID + a derived key serves as the access key encoded in the claim URL (vetKeys-style pattern: key embedded in link, canister enforces date gate).
- **Authorization**: Internet Identity login for creators. Claim page is public (no login required for recipients).

### Modify

- N/A (new project)

### Remove

- N/A (new project)

## Implementation Plan

1. Select `blob-storage` and `authorization` Caffeine components.
2. Generate Motoko backend with capsule creation, retrieval, and date-gated content access.
3. Build frontend:
   - Landing page with hero, 3-step explainer, wallet connect CTA
   - Authenticated canister builder (multi-step form)
   - Sealing animation/confirmation screen with claim URL + QR code
   - Public claim page with countdown timer (locked) or content viewer (unlocked)
   - Dashboard for creators to see their capsules and status
4. Wire blob-storage for file uploads in the builder.
5. Wire authorization (Internet Identity) for creator login.
6. Implement client-side encryption (AES via Web Crypto API) with key embedded in claim URL fragment.

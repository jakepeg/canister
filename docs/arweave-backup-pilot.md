# Arweave Backup Pilot (Legacy Only)

## Goal

Add optional cold backup for Legacy capsules to reduce continuity risk without compromising margin.

## Scope

- Tier: `Legacy` only
- Storage mode: encrypted payload backup
- Primary system remains ICP; Arweave is secondary recovery path

## Guardrails

- Monthly backup spend cap with hard stop when exceeded
- Backup job throttling and queue visibility
- Recovery drill required before production rollout
- Backup status exposed per capsule (`pending`, `backed_up`, `failed`)

## Data Handling Requirements

- Encrypt before backup using the same trust boundary as primary content
- Store Arweave transaction IDs in canister metadata only after successful write
- Never store plaintext content or decryption keys in backup metadata

## Rollout Stages

1. Design and threat model
2. Internal pilot on test capsules
3. Recovery drill with random sample
4. Limited production rollout for new Legacy capsules
5. Margin and reliability review after 1-2 billing cycles

## Exit Criteria

- Recovery success rate `>= 99%` in drills
- Backup spend stays within monthly cap
- No degradation to capsule creation/unlock UX
- Unit economics remain above stress-case margin floor

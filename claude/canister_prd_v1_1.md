# Canister — Product Requirements Document

**Version:** 1.1  
**Date:** April 2026  
**Author:** Canister  
**Stack:** Motoko · Internet Computer Protocol (ICP) · React/TypeScript (Web App)

---

## 1. Product Overview

### 1.1 Vision

Canister is a **web application** for creating permanent, encrypted, on-chain time capsules — called **Canisters** — that unlock on a future date.

Users can fill a Canister with photos, videos, voice notes, and written messages, seal it on the blockchain, and optionally pair it with a physical engraved pendant (keychain or necklace) bearing a QR code that serves as the physical key.

---

### 1.2 Tagline

> "Future-proof your memories and digital assets."

---

### 1.3 Core Promise

- Content is sealed on the Internet Computer blockchain using vetKeys encryption  
- Nobody — including the app developers — can open a sealed Canister before its unlock date  
- One-time payment model (no subscriptions)  
- The physical pendant acts as a lasting, real-world access point  

---

### 1.4 Related Products

- **DooCoins** — sibling app; potential cross-promotion to family audience  

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Internet Computer Protocol (ICP) |
| Smart contracts | Motoko canisters |
| Encryption | vetKeys |
| Frontend | React + TypeScript (Web App) |
| Storage model | ICP cycles |

---

### 2.1 ICP Storage Notes

- ICP charges ~$5/GB/year via cycles  
- Developer is responsible for topping up cycles  
- A reserve fund must be maintained  
- At 10MB–100MB per user, lifetime cost is low  
- vetKeys enforces time-locked decryption at protocol level  

---

## 3. Canister Types

### 3.1 Time Canister
- Locked until a future date  
- Cannot be opened early by anyone  
- Unlock triggers a ceremonial reveal  

### 3.2 Permanent Canister
- Always accessible by owner  
- Acts as a private vault  

### 3.3 Gift Canister
- Created for another person  
- Shared via link or pendant  
- Creator cannot reopen once sealed  

---

## 4. Core User Flows

### 4.1 Create a Canister

1. User clicks **"Create Canister"**
2. Selects type: Time / Permanent / Gift  
3. Adds content (message, media, documents)  
4. Sets unlock date (if applicable)  
5. Adds recipient (if Gift)  
6. Reviews summary  
7. Clicks **"Seal Canister"**  
8. Completes one-time payment  
9. Content is encrypted and stored on ICP  
10. Confirmation screen with Canister ID  
11. Option to order a pendant  

---

### 4.2 Unlock a Canister

1. User returns on or after unlock date  
2. Opens Canister  
3. Ceremonial reveal experience  
4. Content becomes accessible  

---

### 4.3 Access via Link / QR

1. User opens shared link or scans QR  
2. Authenticates via Internet Identity  
3. If locked → countdown screen  
4. If unlocked → content revealed  

---

### 4.4 Order a Pendant

1. User selects **"Order Pendant"**  
2. Chooses style and finish  
3. Adds engraving  
4. Enters shipping details  
5. Completes payment  
6. Pendant linked to Canister and shipped  

---

## 5. Data Model (Conceptual)

```
CanisterRecord {
  id
  owner
  type
  created_at
  unlock_at
  sealed
  recipient
  content_refs
  pendant_token
  tier
  storage_used
}
```

---

## 6. Security & Encryption

### vetKeys

- Time-locked encryption enforced at protocol level  
- Keys not derivable before unlock date  
- Developer cannot access content  

### Authentication

- Internet Identity (passkey / biometrics)  
- No passwords or seed phrases  

### Pendant Token

- Unique token per Canister  
- Requires authentication + token  
- Can be re-issued if lost  

---

## 7. Pricing Model

All purchases are **one-time**.

| Product | Price |
|---|---|
| Starter (10MB) | $20 |
| Premium (100MB) | $100 |
| Pendant | $25 |
| Pendant (3-pack) | $60 |

- No subscriptions  
- Payment via Stripe  
- Storage funded via revenue  

---

## 8. Physical Pendant

### Specs

- Stainless steel  
- Engraved QR code  
- Unlock date on front  
- Message on reverse  
- Optional NFC  

### Fulfilment

- Third-party supplier  
- 5–10 day delivery target  

---

## 9. Web App Structure

```
/ Auth
/ Home
/ Create Canister
/ Canister Detail
/ Pendant Order
/ QR Access
/ Settings
```

---

## 10. Landing Page

Key sections:

1. Hero  
2. How it works  
3. Use cases carousel  
4. Pendant  
5. Trust (decentralized, secure, permanent)  
6. Pricing  

---

## 11. Out of Scope (v1)

- Mobile apps  
- Subscriptions  
- Social features  
- Free tier  
- Crypto payments  
- Enterprise features  

---

## 12. Success Metrics

| Metric | Target |
|---|---|
| Canisters created | 500+ |
| Pendant orders | 100+ |
| Support load | Low |
| Storage sustainability | 10+ years covered |

---

## 13. Development Priorities

### Phase 1
- Core Canister creation  
- Encryption  
- Auth  
- Deploy to ICP  

### Phase 2
- Media upload  
- Payments  
- Unlock experience  
- Gift flow  

### Phase 3
- Pendant system  
- QR linking  
- Fulfilment  

### Phase 4
- Landing page  
- Analytics  
- Growth  

---

## 14. Open Questions

- Pendant supplier  
- Final pricing validation  
- Stripe integration  
- GDPR considerations  
- Cycle reserve strategy  

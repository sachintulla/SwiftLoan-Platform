# SwiftLoan — Verified Fact Base (source of truth for all compliance documents)

> This brief is the single verified source for the PRD, Technical Architecture,
> Security & Compliance, and Test Cases documents. All facts below were verified
> against the codebase (file:line references included). Do not contradict this brief.

## 1. Product summary
- **SwiftLoan** — a digital **loan marketplace / recommendation** app for the India market.
- Regulatory posture: it functions as a **Lending Service Provider (LSP)** operating a
  **Digital Lending App (DLA)** *on behalf of RBI-regulated lenders* (banks/NBFCs). It does
  **not** lend directly and does not decide approvals.
- Platforms: **React Native** mobile app (iOS + Android, RN 0.86, React 19, TypeScript);
  **Node/Express/Prisma/PostgreSQL** backend; **Next.js 14** admin dashboard; a marketing
  **website** (static `website/` + `website-next/`); and an **external Ello/Getello voice AI**
  assistant named **"Ruby"** (third-party processor).

## 2. Primary user flow (screens)
language → mobile (phone + OTP) → aboutyou (name/DOB/gender) → home → fare (EMI calculator) →
basic (name, DOB, income, employment, pincode) → basicpan (PAN) → finding → offers → handoff →
kyc → aadhaar / panv / bankv / selfie (**currently non-functional demo stubs**) → status →
disbursed → repay / creditscore / profile / help. Admin dashboard shows users, leads, loans,
onboarding funnels, downloads, analytics, notifications.

## 3. PII / data inventory (scope of protection)
| Data | Where collected | Stored where | State today |
|---|---|---|---|
| Phone number | mobile.tsx | User.phone (unique) | plaintext |
| Name (first/last/full) | aboutyou, basic, profile | User.firstName/lastName/fullName | plaintext |
| DOB / age | aboutyou, basic (Calendar) | User.dob | plaintext (full DOB) |
| Monthly income | basic.tsx | User.monthlyIncome, LoanApplication.monthlyIncome | plaintext |
| **PAN card** | basicpan.tsx | User.panNumber (schema:62) **and** LoanApplication.panNumber (schema:171) | **FULL PAN, PLAINTEXT, duplicated ⚠** |
| Aadhaar | aadhaar.tsx (stub) | User.aadhaarLast4 (schema:63) | **last-4 only ✓ (good)** |
| Bank account | bankv.tsx (stub) | Loan.accountLast4 (schema:265) | **last-4 only ✓ (good)** |
| Selfie / face | selfie.tsx (stub) | not captured | stub, nothing stored |
| Voice / voiceprint | voice widget → Ello | third-party (Ello) | biometric-class, egressed |
| Email, address/pincode | basic/profile | User.email/pincode | plaintext |
| Credit score | derived | User.creditScore (default 750) | plaintext |
| Passwords | (admin/optional) | User.passwordHash, AdminUser.passwordHash | **bcrypt ✓ (good)** |
| OTP | auth | OtpToken.codeHash | **SHA-256 hashed ✓** |
| Tracking metadata | app events | ActivityEvent.metadata (free-form JSON) | unvalidated PII sink ⚠ |
| Leads (name/phone/city) | website/deep-link | AnonymousLead, ContextSession | plaintext, never purged ⚠ |

## 4. Controls ALREADY present (keep — do not "fix")
- Passwords bcrypt (`server/src/lib/crypto.ts:4`).
- OTP and refresh tokens hashed before storage (`schema.prisma:94`, `:107`).
- Aadhaar and bank account reduced to last-4 only (`schema:63`, `:265`).
- iOS App Transport Security enforced — `NSAllowsArbitraryLoads=false` (`ios/SwiftLoan/Info.plist:29-35`).
- Android release build disallows cleartext (RN gradle default).
- Hard user delete with cascade — `DELETE /me` (`server/src/modules/users.routes.ts:91`).
- `Consent` model (terms/soft_pull/data_sharing/communications) and `AuditLog` model exist in schema (AuditLog is **not yet written to**).
- Voice system prompt forbids reading OTP/PAN/Aadhaar aloud.
- Admin backend auth is real: bcrypt + JWT + rotating refresh (`adminAuth.routes.ts`).

## 5. VERIFIED concerns (risk register seed) — with file:line
- **C1 · PAN plaintext & duplicated** — `schema.prisma:62`, `:171`; no encryption/tokenization.
- **C2 · Sensitive values leak to third-party voice AI** — `page_context`/`read_screen` send live field values incl. PAN to getello.ai; `sensitive` flag blocks writes only, not reads (`src/voice/actionRegistry.ts:204`, `screenGraph.ts:207`, `voice/tools.ts:259`).
- **C3 · Fixed OTP 123456 accepted in production** — `lib/crypto.ts:9-11`; `render.yaml` `DEMO_LOGIN`; client `src/api/client.ts:77-84`.
- **C4 · Default super-admin `admin@swiftloan.com / admin123`** seeded & shown on login (`seed.ws4.ts:74,82-83`).
- **C5 · Real Ello API key committed** — `render.yaml:53`, `website/js/voice-widget.js:17`.
- **C6 · Fail-open JWT/admin secrets** — `dev-access`/`dev-refresh` fallbacks (`config/env.ts:12-13`); admin secret derived from them.
- **C7 · CORS fully open** `cors()` + no per-route rate limiting except auth (`app.ts:27`).
- **C8 · Unvalidated tracking metadata** free-form JSON PII sink (`tracking.routes.ts:30,67`).
- **C9 · Orphan PII never purged / no retention TTL** — AnonymousLead, ContextSession, Notification.body; not covered by user-delete cascade.
- **C10 · No DSAR beyond user self-delete** — no correct/export/erase for leads/context; AuditLog never written.
- **C11 · Admin tokens in localStorage** (XSS-exfiltratable) — `admin/src/lib/api.ts:12-22`.
- **C12 · No DB encryption-at-rest / residency defined in repo**; no DPA with Ello or lenders.
- **C13 · Voice transport `ws://`/`http://` cleartext by default** (`voice/config.ts`).
- **C14 · No client-side secure input / masking** for PAN/Aadhaar fields.

## 6. Target controls / recommendations (P0→P3)
- **P0 (now):** rotate & purge committed Ello key; disable DEMO_LOGIN/OTP bypass in prod; remove default admin creds + add MFA; redact sensitive values from voice page_context; fail-closed secrets.
- **P1:** tokenize/encrypt PAN + de-duplicate; DB encryption-at-rest + encrypted backups in India region; strict CORS allow-list + rate-limit/WAF all routes; wire consent end-to-end + check before partner/CIBIL share; admin tokens → httpOnly cookies + RBAC; secure input + PAN masking; voice consent-gate + wss/https only + DPA.
- **P2:** retention TTL + purge jobs; DSAR APIs (access/correct/export/erase incl. orphan PII); write AuditLog on PII access; scrub PII from tracking; structured masked logging; governance (RoPA, DPIA, DPO/grievance officer, CERT-In 6-hr breach runbook); DPAs (Ello, lenders, host).
- **P3:** independent VAPT; ISO 27001 + SOC 2 audits; legal sign-off + marketing claims matrix.

## 7. Applicable compliance regime (India-first)
- **ISO/IEC 27001:2022** (ISMS; Annex A — 93 controls across A.5 Organizational, A.6 People, A.7 Physical, A.8 Technological) — **primary audit target**.
- **ISO/IEC 27701:2019** (Privacy Information Management extension) and **ISO/IEC 27017/27018** (cloud/PII in cloud) — supporting.
- **DPDP Act 2023** (consent, purpose limitation, data-principal rights, security safeguards, breach notice, data-fiduciary duties).
- **RBI Digital Lending Guidelines 2022** (LSP/DLA obligations, data minimization, localization, KFS, direct disbursal, grievance redressal, no biometric storage).
- **RBI Master Direction – KYC + CKYC**, **Aadhaar Act** (masking, no core-biometric storage), **CICRA 2005** (bureau-pull consent).
- **CERT-In Directions 2022** (6-hour breach reporting, 180-day log retention, NTP sync).
- **IT Act 2000 §43A + SPDI Rules 2011** (sensitive personal data: financial, passwords, biometrics).
- **SOC 2 Type II** and **PCI-DSS** (latter only if card data is handled) — assurance.

## 8. ISO/IEC 27001:2022 Annex A control themes (use these tags in the docs)
- **A.5 Organizational** (policies, roles, supplier/third-party, incident mgmt, compliance, threat intel, data classification, privacy).
- **A.6 People** (screening, awareness, responsibilities, remote work).
- **A.7 Physical** (secure areas, equipment, media — largely cloud-provider inherited).
- **A.8 Technological** (access control, crypto A.8.24, secure dev A.8.25-28, logging A.8.15, data masking A.8.11, DLP A.8.12, backup A.8.13, network security A.8.20-23, config A.8.9, vulnerability mgmt A.8.8).

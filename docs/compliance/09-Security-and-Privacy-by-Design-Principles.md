# SwiftLoan — Secure-by-Design, Privacy-by-Design & Compliance-by-Design Principles

> **Document ownership & accountable roles** — Product Owner: **Sridhar Muppidi** · Product Head: **Sachin Tulla** · Technical & Security Head: **Sachin Tulla**.

**Engineering principles for a secure system architecture (ISO/IEC 27001:2022 A.8.25 / A.8.27 / A.8.28), Privacy-by-Design (DPDP Act 2023), and Compliance-by-Design (RBI DLG / CERT-In / SOC 2)**

---

## 1. Document control

| Field | Value |
|---|---|
| Document title | SwiftLoan Secure-by-Design, Privacy-by-Design & Compliance-by-Design Principles |
| Document ID | SWL-SBD-09 |
| Version | 1.0 |
| Date | 2026-08-04 |
| Owner | **Security Architect** |
| Co-owner | Data Protection Officer (DPO) / Grievance Officer |
| Approver | Chief Information Security Officer (CISO) |
| Classification | **Confidential** (contains threat model, control gaps, and residual-risk findings) |
| Status | Draft for internal audit / Stage 1 readiness review |
| Distribution | ISMS Steering Committee, Engineering leads, external certification body (under NDA) |
| Source of truth | `docs/compliance/_AUDIT_BRIEF.md` (verified fact base; concerns C1–C14; remediation P0–P3) |
| Related documents | Doc 03 (Security & Compliance / ISMS), Doc 07 (SDLC & Change Management), Doc 08 (ISMS Manual & Policies), Doc 10 (Certification Readiness) |
| Next review | 2027-02-04 (6-monthly) or on material architecture change |

### 1.1 Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-08-02 | Security Architect | Skeleton; principle catalogue drafted |
| 0.9 | 2026-08-03 | Security Architect + DPO | Cavoukian mapping, STRIDE table, DPIA first pass |
| 1.0 | 2026-08-04 | Security Architect | Full by-design principle set, threat model, DPIA, by-design violation register — issued for review |

---

## 2. Purpose & how to use this document

### 2.1 Purpose

This document states the **engineering principles** SwiftLoan uses to build security, privacy, and
compliance **into** the product rather than bolting them on afterward. It satisfies ISO/IEC 27001:2022
**A.8.25** (secure development life cycle), **A.8.27** (secure system architecture and engineering
principles), and **A.8.28** (secure coding), and provides the "by-design" evidence identified as
missing in the audit brief (§9.1 gap **G4**).

Three disciplines are treated as **design inputs**, not review-time afterthoughts:

- **Security-by-Design** — the system is architected to be secure by default and to fail safely.
- **Privacy-by-Design** — Cavoukian's seven foundational principles are embedded into every data flow.
- **Compliance-by-Design** — legal/regulatory obligations (DPDP, RBI DLG, CERT-In, ISO, SOC 2) are
  encoded as controls and CI gates, so that a non-compliant design cannot silently reach production.

### 2.2 How to use it — these principles are mandatory

- **Mandatory design inputs.** Every new feature, service, or data flow MUST be designed to satisfy
  the principles in §3–§5 and the checklist in §8. "We'll secure it later" is not an acceptable design.
- **Enforced at SDLC gates.** Doc 07 defines an eight-stage SDLC with exit gates. These principles are
  the acceptance criteria at the **Reviewed** (stage 2), **Tested** (stage 6) and **Approved** (stage 7)
  gates. A change that violates a by-design principle without a recorded, risk-accepted exception cannot
  pass the Approved gate.
- **Enforced in the PR checklist.** The repository PR template
  (`.github/pull_request_template.md`) carries the security/privacy checklist derived from §8; the
  reviewer (who, per segregation of duties, is not the author) confirms it before merge.
- **Enforced in CI.** Secret scanning (gitleaks), SAST (CodeQL), and dependency audit
  (`.github/workflows/security-scan.yml`) plus the compliance-drift gate
  (`.github/workflows/compliance-sync.yml`) are the automated mechanisms that keep the principles true.
- **Honest baseline.** §9 lists, without euphemism, where the **current build** violates these
  principles (findings C1–C14). This document describes the target architecture and the present gap; it
  does **not** claim the current build is fully by-design.

### 2.3 Legend for status columns

| Status | Meaning |
|---|---|
| ✅ Present | Implemented and verified in the codebase (see §4 of the audit brief) |
| ◑ Partial | Implemented for some assets/flows; gaps remain |
| ⚠ Gap | Principle currently violated; mapped to a C-finding and a P-remediation |
| ➕ Mechanism added this pass | Embedded via a repo artifact added in the current audit pass |

---

## 3. Security-by-Design principles

Each principle below has a definition, its **concrete SwiftLoan application**, its **current status**,
and the control tags. Findings reference the audit brief's C1–C14; remediations reference P0–P3.

### 3.1 Secure defaults

**Principle.** The default configuration is the safe one. Security must not depend on an operator
remembering to turn something on; insecure behaviour must require a deliberate, logged override.

**SwiftLoan application.** iOS App Transport Security ships with `NSAllowsArbitraryLoads=false`
(`ios/SwiftLoan/Info.plist:29-35`); Android release builds disallow cleartext by default. New feature
flags must default to the privacy/security-preserving value; environment defaults must not weaken
production.

**Current status.** ◑ Partial. Transport defaults on mobile are correct, **but** several defaults are
insecure: the fixed OTP `123456` is accepted when `DEMO_LOGIN` is set (**C3**), a default super-admin
`admin@swiftloan.com / admin123` is seeded and shown on the login screen (**C4**), JWT/admin secrets
fall back to `dev-access`/`dev-refresh` (**C6**), CORS defaults fully open (**C7**), and voice transport
defaults to cleartext `ws://`/`http://` (**C13**).
**Target:** P0 (disable demo/OTP bypass, remove default admin creds), P1 (strict CORS, `wss`/`https`).
**Tags:** ISO A.8.9, A.8.27; SOC 2 CC6.1, CC6.6.

### 3.2 Least privilege

**Principle.** Every identity, service, token, and code path gets the minimum access needed, for the
minimum time.

**SwiftLoan application.** Admin backend uses real bcrypt + JWT with rotating refresh tokens
(`adminAuth.routes.ts`); RBAC must scope admin actions to role. Data-model access is gated by
CODEOWNERS so PII schema changes require security review. Third-party voice tools mark `sensitive`
fields to restrict them.

**Current status.** ◑ Partial. Backend admin auth is real (good), but there is **no RBAC** separating
admin roles, the seeded super-admin has full privilege by default (**C4**), and the `sensitive` flag on
voice tools blocks writes only — not reads (**C2**), so least privilege over PII reads is not enforced
at the tool boundary.
**Target:** P0 (remove default admin), P1 (RBAC, admin tokens → httpOnly cookies).
**Tags:** ISO A.5.15, A.5.18, A.8.2, A.8.3; SOC 2 CC6.1, CC6.3.

### 3.3 Defense in depth

**Principle.** No single control is trusted to be sufficient; layered, independent controls mean one
failure does not become a breach.

**SwiftLoan application.** Layers include transport security (ATS/TLS), hashed secrets at rest (bcrypt
passwords, SHA-256 OTP/refresh tokens — `schema.prisma:94,:107`), authentication + authorization at the
API, input validation, CI SAST/secret/dependency scanning, and CODEOWNERS review.

**Current status.** ◑ Partial. Several layers exist, but depth is thin in key places: PAN has **no**
encryption/tokenization layer beneath the DB (**C1**), there is no DB encryption-at-rest defined in the
repo (**C12**), no WAF/rate-limiting except on auth (**C7**), and tracking metadata is an unvalidated
sink (**C8**).
**Target:** P1 (tokenize PAN, encryption-at-rest, WAF/rate-limit), P2 (validate/scrub tracking).
**Tags:** ISO A.8.24, A.8.20–A.8.23, A.8.26; SOC 2 CC6.6, CC6.7.

### 3.4 Fail-closed / fail-safe

**Principle.** When a control cannot make a positive security decision, it denies. Missing config,
absent secrets, or errors must not "open the door."

**SwiftLoan application.** Absence of a signing secret must abort startup, not silently generate or fall
back to a weak default. Consent checks must deny partner/bureau data sharing if consent state is
unknown. OTP verification must reject when the verification backend is unavailable rather than accept a
static code.

**Current status.** ⚠ Gap. The system currently **fails open** in the highest-risk places: JWT/admin
secrets fall back to `dev-access`/`dev-refresh` when unset (**C6**), and a fixed OTP is accepted under
demo mode (**C3**). These are direct fail-open violations.
**Target:** P0 (fail-closed secrets: refuse to boot without real secrets; remove OTP bypass).
**Tags:** ISO A.8.27, A.8.9; SOC 2 CC6.1, CC7.1.

### 3.5 Minimize attack surface

**Principle.** Expose only what is needed. Fewer endpoints, fewer origins, fewer egress paths, fewer
secrets in scope means less to attack.

**SwiftLoan application.** CORS should be a strict allow-list; only necessary routes are public;
sensitive field values should never leave the device/backend to third parties unless strictly required
and consented. Demo/test conveniences must be compiled out of production.

**Current status.** ⚠ Gap. Attack surface is currently **too wide**: CORS is fully open (`cors()` with
no allow-list, `app.ts:27`) (**C7**); live field values including PAN egress to the third-party voice AI
(`getello.ai`) via `page_context`/`read_screen` (**C2**); demo login paths ship in production (**C3**,
**C4**).
**Target:** P0 (redact voice context, disable demo paths), P1 (strict CORS + rate-limit).
**Tags:** ISO A.8.20, A.8.21, A.8.9, A.8.16; SOC 2 CC6.6, CC6.7.

### 3.6 Complete mediation / no bypass

**Principle.** Every access to a protected resource is checked, every time, with no cached "already
allowed" shortcut and no back door around the check.

**SwiftLoan application.** All PII reads/writes flow through the API where authorization and (future)
audit logging apply. The voice tool boundary must mediate reads of sensitive fields, not just writes.
Consent must be checked at the point of every partner/CIBIL share, not once at signup.

**Current status.** ⚠ Gap. Mediation is incomplete: the voice `sensitive` flag mediates **writes but
not reads** (**C2**), letting PAN and other values bypass the intended guard on read; the `Consent`
model exists but is **not checked before** partner/bureau sharing, and `AuditLog` is **never written**
(**C10**), so access is not fully mediated or recorded.
**Target:** P1 (voice read-redaction + consent gate before share), P2 (write AuditLog on PII access).
**Tags:** ISO A.5.15, A.8.15, A.8.16; SOC 2 CC6.1, CC7.2.

### 3.7 Separation of duties (SoD)

**Principle.** No single person can unilaterally author, approve, and ship a sensitive change; critical
duties are split across people/roles.

**SwiftLoan application.** The SDLC (Doc 07) requires the PR approver/merger to be a **different person**
than the author. CODEOWNERS routes PII, auth, config, voice-egress, and compliance changes to the
security/compliance teams for mandatory review. The PR template carries an explicit SoD reminder.

**Current status.** ✅ Present (process) / ◑ Partial (enforcement). SoD is defined in Doc 07, embedded in
the PR template, and routed via CODEOWNERS ➕. Full enforcement additionally requires branch protection
("Require review from Code Owners" + required status checks) to be enabled — a repo-settings action
(gap **G12**).
**Target:** P3 (enable/verify branch protection) — configuration, documented in gap G12.
**Tags:** ISO A.5.3, A.8.4, A.8.32; SOC 2 CC5.x, CC8.1.

### 3.8 Economy of mechanism (keep it simple)

**Principle.** Prefer the simplest design that meets the requirement; complexity is where
vulnerabilities hide and audits fail.

**SwiftLoan application.** Reuse one hardened auth path rather than parallel login flows; store PII once
in a canonical location rather than duplicating it; use standard, well-reviewed crypto (bcrypt,
SHA-256) rather than bespoke schemes.

**Current status.** ⚠ Gap. A clear economy-of-mechanism violation exists: **PAN is duplicated** across
`User.panNumber` (`schema.prisma:62`) and `LoanApplication.panNumber` (`schema.prisma:171`) (**C1**),
doubling the sensitive-data footprint and the number of places to protect.
**Target:** P1 (de-duplicate PAN to a single tokenized reference).
**Tags:** ISO A.8.25, A.8.27; SOC 2 CC8.1.

### 3.9 Auditability / non-repudiation

**Principle.** Security-relevant actions are logged in a tamper-evident, time-synchronized, retained
record so that "who did what, when" can be established and cannot be denied.

**SwiftLoan application.** An `AuditLog` model exists in the schema. CERT-In requires 180-day log
retention and NTP-synchronized clocks. PII access, consent changes, admin actions, and data-sharing
events must be recorded with actor, timestamp, and purpose.

**Current status.** ⚠ Gap. The `AuditLog` model exists but is **never written to** (**C10**), so there
is currently no non-repudiation for PII access or admin actions, and no evidence trail for DSAR/breach
response.
**Target:** P2 (write AuditLog on PII access, consent change, admin action; structured masked logging;
180-day retention; NTP).
**Tags:** ISO A.8.15, A.8.16, A.8.17; SOC 2 CC7.2, CC7.3.

### 3.10 Zero-trust between tiers

**Principle.** No tier implicitly trusts another because of network position. The mobile client,
backend, admin, and third-party processors authenticate and authorize on every hop; traffic is
encrypted end to end.

**SwiftLoan application.** Client↔backend over TLS; admin↔backend authenticated with JWT; backend↔Ello
voice over authenticated `wss`/`https`; the backend never trusts client-supplied identity or consent
state without server-side verification.

**Current status.** ⚠ Gap. Zero-trust is broken on the voice tier: transport defaults to cleartext
`ws://`/`http://` (**C13**), and sensitive values are trusted to a third party without a DPA (**C2**,
**C12**). Admin tokens live in `localStorage` (XSS-exfiltratable, **C11**), weakening tier isolation.
**Target:** P1 (voice `wss`/`https` + DPA; admin tokens → httpOnly cookies), P2 (DPAs with Ello/lenders/host).
**Tags:** ISO A.8.20, A.8.21, A.5.19–A.5.23 (supplier); SOC 2 CC6.6, CC6.7, CC9.2.

### 3.11 Secrets never in code

**Principle.** Credentials, API keys, and tokens live only in a secrets manager / environment, never in
source, config, logs, or client bundles; leaked secrets are rotated immediately.

**SwiftLoan application.** Secrets injected via environment; secret scanning (gitleaks) runs in CI on
every push and PR; GitHub push protection should block committed secrets; leaked keys are rotated per
the incident runbook.

**Current status.** ⚠ Gap → mechanism added. A **real Ello API key is committed** (`render.yaml:53`,
`website/js/voice-widget.js:17`) (**C5**), and secrets fall back to weak in-code defaults (**C6**).
Secret scanning was previously absent (gap **G5**); it is now **added** ➕ via gitleaks in
`security-scan.yml`, which would have caught C5.
**Target:** P0 (rotate & purge the committed key, fail-closed secrets), G12 (enable GitHub secret
scanning + push protection).
**Tags:** ISO A.8.24, A.8.4, A.8.8; SOC 2 CC6.1, CC7.1.

---

## 4. Privacy-by-Design (Cavoukian's 7 foundational principles)

SwiftLoan adopts Ann Cavoukian's seven Privacy-by-Design principles as mandatory design inputs, mapped
to the DPDP Act 2023 and RBI Digital Lending Guidelines 2022. Underpinning all seven are
**data minimization, purpose limitation, consent-first processing, and disciplined PII/SPDI handling**
(§4.8).

### 4.1 Proactive not reactive; preventative not remedial

Privacy risks are designed out before code ships, not patched after an incident. The DPIA (§7) is
performed **before** high-risk processing (full PAN, voice/biometric egress, credit pull), and the
threat model (§6) is a design-time artifact. **Status:** ◑ Partial — DPIA and threat model now exist as
design inputs; the high-risk flows they cover (C1, C2) still require remediation. **DPDP:** reasonable
security safeguards; **RBI DLG:** privacy-by-design expectation for DLAs.

### 4.2 Privacy as the default setting

No action is required by the data principal to be private; the most protective setting is the default.
Aadhaar is stored **last-4 only** (`schema.prisma:63`), bank account **last-4 only** (`schema.prisma:265`),
and the selfie stub stores nothing. **Status:** ◑ Partial — these defaults are exemplary (keep, do not
"fix"), **but** PAN defaults to full plaintext (**C1**) and voice context defaults to sending live
values (**C2**), which are not private-by-default. **Target:** P1 (PAN tokenization), P0 (voice redaction).
**DPDP §5–§6** (purpose/consent defaults).

### 4.3 Privacy embedded into design

Privacy is a core feature of the architecture, not an add-on. Consent (`Consent` model:
terms/soft_pull/data_sharing/communications), data-subject deletion (`DELETE /me` hard delete with
cascade, `users.routes.ts:91`), and last-4 minimization are schema-level design choices. **Status:** ◑
Partial — embedded for deletion and minimization; consent is modelled but **not yet enforced end-to-end**
before partner/bureau sharing (**C10**). **Target:** P1 (wire consent into every share). **ISO A.8.25;
DPDP §6 (consent).**

### 4.4 Full functionality — positive-sum, not zero-sum

Privacy is achieved **without** disabling the product. Tokenizing PAN, redacting sensitive voice
context, and consent-gating the credit pull do **not** remove the loan-matching feature — the LSP flow
(basic → PAN → offers → handoff) still works with tokens and redaction. We reject the false trade-off
"either usable or private." **Status:** ◑ Partial — positive-sum target defined; some flows (voice)
currently trade privacy for convenience and must be re-designed to keep both. **RBI DLG** (functionality
with data minimization).

### 4.5 End-to-end security — full lifecycle protection

Data is protected from collection through storage, use, sharing, and secure disposal. Collection
minimizes (last-4); storage should encrypt (bcrypt/SHA-256 today for secrets; PAN pending); disposal is
via cascade delete and (pending) retention TTL + purge jobs. **Status:** ⚠ Gap in lifecycle — no
retention TTL and orphan PII (AnonymousLead, ContextSession, Notification.body) is **never purged**
(**C9**), and there is no encryption-at-rest defined (**C12**). **Target:** P1 (encryption-at-rest), P2
(retention TTL + purge). **ISO A.8.10 (deletion), A.8.13 (backup), A.8.24; DPDP §8(7) (erasure); CERT-In
(retention).**

### 4.6 Visibility and transparency

Data practices are open and verifiable by the data principal and auditors: a privacy notice, a
Key Fact Statement (KFS) in the lending flow, clear consent records, and DSAR responses. **Status:** ⚠
Gap — no DSAR beyond self-delete (no access/correct/export/erase for leads/context), and AuditLog is not
written, so practices are not fully verifiable (**C10**). **Target:** P2 (DSAR APIs, AuditLog, RoPA/DPIA
publication). **DPDP §5 (notice), §11–§13 (rights); RBI DLG (KFS, transparency).**

### 4.7 Respect for user privacy — keep it user-centric

The design serves the data principal's interests: consent-first, easy withdrawal, grievance redress,
and no surprising secondary use. **Status:** ◑ Partial — hard self-delete respects the user; but
consent is not consistently honoured before sharing (**C10**) and tracking metadata can silently absorb
PII (**C8**). **Target:** P1 (consent enforcement), P2 (grievance officer, scrub tracking). **DPDP §6,
§13 (grievance); RBI DLG (grievance redressal).**

### 4.8 Cross-cutting data-handling rules (apply to all seven)

| Rule | SwiftLoan design | Status |
|---|---|---|
| **Data minimization** | Collect only what the LSP flow needs; store Aadhaar/bank as **last-4**; selfie stub stores nothing | ✅ for Aadhaar/bank/selfie; ⚠ PAN full (C1) |
| **Purpose limitation** | Data used only for the stated loan-matching purpose; no secondary use without fresh consent | ◑ consent not enforced before share (C10) |
| **Consent-first** | `Consent` model gates soft-pull/data-sharing/communications; check **before** each use | ⚠ modelled, not enforced (C10) |
| **PAN handling** | Tokenize/encrypt PAN; store once; mask in UI (secure input); never send to third parties | ⚠ full plaintext, duplicated, no masking (C1, C14) |
| **Aadhaar handling** | **Last-4 only**; never store core biometric; mask per Aadhaar Act | ✅ last-4 (schema:63) |
| **Voice / biometric minimization** | Voiceprint is biometric-class; minimize capture, gate on consent, keep on secure transport, DPA with processor; system prompt forbids reading OTP/PAN/Aadhaar aloud | ⚠ egressed to Ello, cleartext default, no DPA (C2, C12, C13) |
| **PII in logs/tracking** | Structured masked logging; validate/scrub `ActivityEvent.metadata` | ⚠ unvalidated free-form JSON PII sink (C8) |

---

## 5. Compliance-by-Design

Regulatory and framework obligations are treated as **design inputs and encoded controls**, so that a
non-compliant design is caught at a gate rather than discovered in an audit or breach.

### 5.1 Legal/framework obligations as design inputs

| Regime | Obligation treated as a design input | Where it is designed in |
|---|---|---|
| **DPDP Act 2023** | Consent, purpose limitation, data-principal rights (access/correct/erase), security safeguards, breach notice, data-fiduciary duties | `Consent` model; `DELETE /me`; DSAR APIs (P2); notice + KFS in flow |
| **RBI Digital Lending Guidelines 2022** | LSP/DLA duties: data minimization, localization (India region), KFS, direct disbursal, grievance redressal, **no biometric storage** | Last-4 minimization; India-region hosting (P1); KFS in offers/handoff; selfie stores nothing; DPAs with lenders |
| **RBI KYC MD + CKYC / Aadhaar Act** | Aadhaar masking; **no core-biometric storage**; CKYC linkage | `User.aadhaarLast4` (last-4 only); KYC stubs store no biometric |
| **CICRA 2005** | Explicit consent before bureau/credit pull | Consent `soft_pull` checked **before** credit pull (P1) |
| **CERT-In Directions 2022** | 6-hour breach reporting, 180-day log retention, NTP sync | `SECURITY.md` (6-hr commitment); AuditLog + retention (P2); NTP on hosts |
| **IT Act §43A + SPDI Rules 2011** | Sensitive personal data (financial, passwords, biometrics) reasonable security | bcrypt/SHA-256; PAN tokenization (P1); voice minimization |
| **ISO/IEC 27001:2022** | ISMS + Annex A controls, secure development A.8.25–A.8.28 | This document; Doc 03; Doc 07 SDLC; CI scanners |
| **SOC 2 Type II** | Trust Services Criteria (CC1–CC9) over time | CI evidence, change management (Doc 07), monitoring |

### 5.2 Compliance gates in CI (compliance-by-design mechanisms)

- **Compliance-sync engine.** `.github/workflows/compliance-sync.yml` + `scripts/compliance/compliance_sync.py`.
  On **PR to main** it runs as a **gate** (`--check`) that fails if control status drifts from the code
  without documentation; on **push to main** it regenerates `COMPLIANCE-STATUS.md` / CSV and appends
  merged PRs. This makes "the docs match the code" a build requirement — compliance cannot silently rot.
- **Security-scan workflow.** `.github/workflows/security-scan.yml` runs **CodeQL** (SAST),
  **gitleaks** (secret scanning), and **npm audit** (SCA) on every push/PR and weekly. These encode
  A.8.8 / A.8.25 / A.8.28 and SOC 2 CC7.1 as passing checks.
- **Dependabot.** `.github/dependabot.yml` opens weekly dependency and GitHub-Actions update PRs across
  the monorepo (mobile `/`, `server`, `admin`, `website-next`), encoding A.8.8 vulnerability management.
- **CODEOWNERS + PR template.** Route PII/auth/config/voice/compliance changes to security/compliance
  reviewers and force the security/privacy checklist and SoD confirmation before merge.

### 5.3 Consent & KFS built into the flows

- **Consent-first.** The primary flow reaches PAN and the credit pull only after consent is captured;
  the `soft_pull` and `data_sharing` consents must be verified server-side **before** any bureau or
  partner/lender share (target P1 — currently modelled but not enforced, **C10**).
- **Key Fact Statement (KFS).** As an LSP operating a DLA, SwiftLoan presents the RBI-mandated KFS
  (loan terms, APR, fees, cooling-off/look-up period, grievance contact) in the offers → handoff stage,
  and records the disclosure as auditable evidence.

---

## 6. Threat model (STRIDE)

Scope: the highest-value assets and flows — **authentication/OTP, PII at rest, voice egress to Ello,
admin access, and the tracking pipeline**. STRIDE categories: **S**poofing, **T**ampering,
**R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege.
"Gap" maps to audit-brief findings C1–C14; "Mitigation" maps to remediation P0–P3 / target controls.

| # | Threat | Asset / flow | STRIDE | Current gap (Cx) | Mitigation (Px / target) |
|---|---|---|---|---|---|
| T1 | Static OTP `123456` lets an attacker log in as any user | Authentication / OTP | **S** Spoofing | **C3** demo OTP + `DEMO_LOGIN` in prod | **P0** disable DEMO_LOGIN & OTP bypass; fail-closed OTP verify |
| T2 | Default super-admin `admin@swiftloan.com/admin123` seeded & shown | Admin access | **S / E** | **C4** default creds seeded | **P0** remove default creds + **MFA**; **P1** RBAC |
| T3 | Forged/predictable JWT via weak fallback secret | Authentication / admin | **S / E** | **C6** `dev-access`/`dev-refresh` fallback (fail-open) | **P0** fail-closed secrets; refuse boot without real secret |
| T4 | Full PAN read from DB after any breach/insider access | PII at rest (PAN) | **I** Information disclosure | **C1** PAN plaintext + duplicated; **C12** no encryption-at-rest | **P1** tokenize/encrypt + de-dup PAN; DB encryption-at-rest (India) |
| T5 | PAN/PII exfiltrated to third-party voice AI on screen read | Voice egress to Ello | **I** | **C2** `sensitive` blocks writes not reads; **C13** cleartext | **P0** redact sensitive values from `page_context`; **P1** `wss`/`https` + DPA + consent-gate |
| T6 | Man-in-the-middle on cleartext voice transport | Voice egress to Ello | **T / I** | **C13** `ws://`/`http://` default | **P1** enforce `wss`/`https` only (zero-trust tier) |
| T7 | Admin session token stolen via XSS | Admin access | **I / E** | **C11** tokens in `localStorage` | **P1** httpOnly, Secure, SameSite cookies + CSP |
| T8 | PII injected into unvalidated tracking metadata, then over-shared | Tracking pipeline | **I / T** | **C8** free-form JSON PII sink | **P2** schema-validate + scrub PII from `ActivityEvent.metadata` |
| T9 | No record of who accessed/shared PII → cannot prove or disprove | All PII flows | **R** Repudiation | **C10** AuditLog never written | **P2** write AuditLog on PII access/consent/admin action; 180-day retention (CERT-In) |
| T10 | Orphan PII (leads/context) never purged → indefinite exposure | PII at rest (leads) | **I** | **C9** no retention TTL; not in delete cascade | **P2** retention TTL + purge jobs; extend erasure to orphan PII |
| T11 | Wildcard CORS + no rate-limit enables cross-origin abuse & brute force | API surface | **D / S / T** | **C7** open `cors()`, no per-route limits | **P1** strict CORS allow-list + rate-limit/WAF on all routes |
| T12 | Committed Ello API key abused by anyone reading the repo | Secrets / voice | **E / I** | **C5** real key in `render.yaml`, `voice-widget.js` | **P0** rotate & purge key; gitleaks (added) + push protection (G12) |
| T13 | Credit/soft-pull performed without valid consent | Credit pull / consent | **T / R** | **C10** consent modelled, not enforced before share | **P1** verify `soft_pull` consent server-side before bureau pull (CICRA) |
| T14 | Shoulder-surf / clipboard capture of PAN/Aadhaar entry | Client input | **I** | **C14** no secure input / masking | **P1** secure text entry + masking for PAN/Aadhaar fields |
| T15 | No DPA with Ello/lenders/host → uncontrolled sub-processor risk | Third-party tiers | **I / R** | **C12** no DPA; residency undefined | **P1/P2** DPAs (Ello, lenders, host); define India residency |

---

## 7. Data Protection Impact Assessment (DPIA) summary

DPIA is performed for high-risk processing per DPDP Act 2023 and RBI Digital Lending Guidelines. Three
processing activities are high risk: **(A) full PAN handling, (B) voice/biometric egress, (C) credit /
soft-pull**. Residual risk is rated on the current build (before P0–P3).

### 7.1 Processing A — Full PAN (financial identifier / SPDI)

- **Description & data.** PAN collected at `basicpan.tsx`; stored at `User.panNumber` and duplicated at
  `LoanApplication.panNumber` (**C1**), full value, plaintext, no masking on input (**C14**).
- **Necessity & proportionality.** A verified PAN is necessary for KYC and lender matching (legitimate
  LSP purpose). **Storing the full PAN in two plaintext locations is not proportionate** — a token +
  single canonical store meets the purpose with far less risk.
- **Risks to data principals.** Identity theft, financial fraud, and regulatory harm if the DB is
  breached or accessed by an insider; amplified by duplication (larger footprint) and absent
  encryption-at-rest (**C12**).
- **Mitigations (target).** P1: tokenize/encrypt PAN, de-duplicate to one reference, DB
  encryption-at-rest in India region, encrypted backups; secure input + UI masking (P1).
- **Residual risk.** **High** currently → **Low** after P1.
- **Recommendation.** **Proceed only after P1.** The current design is not proportionate; prioritize PAN
  tokenization/de-duplication as a P1 blocker for any expansion of PAN processing.

### 7.2 Processing B — Voice / biometric egress to Ello ("Ruby")

- **Description & data.** Voice interaction and on-screen field values are sent to third-party
  `getello.ai`; voiceprint is **biometric-class**. `page_context`/`read_screen` can transmit live PAN
  and other sensitive values because `sensitive` blocks writes but not reads (**C2**); transport
  defaults to cleartext (**C13**); no DPA exists (**C12**).
- **Necessity & proportionality.** A voice assistant is a product convenience, not a regulatory
  necessity. Sending **raw PAN/PII and biometric-class voice to a third party without redaction,
  encryption, consent-gating, or a DPA is not proportionate.**
- **Risks to data principals.** Disclosure of PAN/PII to a sub-processor and over the network;
  biometric data processed without a lawful basis or contractual safeguards; RBI DLG prohibits biometric
  storage and expects data minimization.
- **Mitigations (target).** P0: redact sensitive values from voice `page_context`. P1: enforce
  `wss`/`https`, gate voice on explicit consent, execute a DPA with Ello, minimize/curtail voice capture.
- **Residual risk.** **High** currently → **Medium** after P0, **Low** after P1 (redaction + transport +
  consent + DPA).
- **Recommendation.** **Do not process live PII through voice until P0 redaction ships;** treat voice as
  opt-in, consented, minimized, and contractually bound before broad rollout.

### 7.3 Processing C — Credit / soft-pull (bureau data sharing)

- **Description & data.** A soft credit pull / bureau share is triggered in the offers pathway; consent
  is modelled (`Consent.soft_pull`) but **not enforced before the share** and not audit-logged (**C10**).
- **Necessity & proportionality.** A soft pull is necessary to match lenders and is proportionate **if
  and only if** explicit, informed consent (CICRA 2005) is verified first and recorded.
- **Risks to data principals.** Bureau access or data sharing without valid consent; inability to prove
  consent (no AuditLog) exposes the data principal and the fiduciary to regulatory action.
- **Mitigations (target).** P1: verify `soft_pull` consent server-side before any bureau/partner call;
  present KFS. P2: write AuditLog for each consent decision and share; DPAs with lenders/bureaus.
- **Residual risk.** **Medium** currently → **Low** after P1 + P2.
- **Recommendation.** **Proceed with the consent gate as a P1 blocker;** never perform the pull when
  consent state is unknown (fail-closed, §3.4).

### 7.4 DPIA outcome

Overall high-risk processing is **conditionally acceptable**: proceed only as the P0/P1 mitigations land.
PAN plaintext/duplication (A) and unredacted voice egress (B) are the two findings that most require
remediation before scale. DPO to review this DPIA at each material change (DPDP accountability).

---

## 8. Secure-defaults & by-design checklist (every new feature must satisfy)

This checklist is the source for the repository PR template's security/compliance section. A feature is
**not designed** until every applicable item is a deliberate "yes" or a recorded, risk-accepted N/A.

**Security defaults**
- [ ] Ships **secure defaults**; any insecure mode is off by default and requires a logged override.
- [ ] **Fails closed** — missing secret/config/consent denies, never opens (no weak fallback secrets).
- [ ] **No secrets in code** — keys/tokens via env/secret manager; gitleaks green; nothing in client bundle.
- [ ] **Least privilege** — new identities/tokens/roles get the minimum scope; no default admin.
- [ ] **Complete mediation** — every access to protected data is authorized on the server, every time.
- [ ] **Attack surface minimized** — no new open CORS, no new public route, no new third-party egress
      without justification; demo/test paths compiled out of production.
- [ ] **Transport** — TLS/`https`/`wss` only; no cleartext.

**Privacy defaults**
- [ ] **Data minimization** — collect/store the least PII; identifiers reduced (e.g., last-4) where possible.
- [ ] **Purpose limitation** — data used only for the declared purpose; no silent secondary use.
- [ ] **Consent-first** — for any new data use/share, consent is captured and **checked before** use.
- [ ] **PII/SPDI handling** — PAN tokenized/encrypted & masked; Aadhaar last-4; no core biometric stored;
      voice/biometric minimized and consented.
- [ ] **No PII in logs/tracking** — structured masked logging; tracking metadata validated/scrubbed.
- [ ] **Lifecycle** — retention/TTL defined; erasure/DSAR path covers this data.

**Compliance & auditability**
- [ ] **Auditability** — security-relevant/PII-access actions write an AuditLog entry (actor/time/purpose).
- [ ] **Regulatory mapping** — DPDP / RBI DLG / CERT-In obligations for this data identified and met.
- [ ] **Threat considered** — new attack surface described and mitigated (STRIDE); mapped to a control.
- [ ] **Tests** — security/privacy tests added; CI (lint, typecheck, security-scan, compliance-sync) green.
- [ ] **SoD & review** — approver ≠ author; CODEOWNERS review obtained for PII/auth/config/voice/compliance.
- [ ] **Docs updated** — impact on Docs 01–08 assessed; control status updated if changed.

---

## 9. Where the current design violates by-design (honest register)

The current build is **not** fully by-design. The following findings breach a stated principle; each is
listed with the principle breached and the target that restores it. This section deliberately does not
soften the gap.

| Finding | What it is | Principle breached | Target that restores by-design |
|---|---|---|---|
| **C1** | PAN full, plaintext, duplicated (`schema.prisma:62,:171`) | Privacy-as-default; data minimization; economy of mechanism; defense in depth | **P1** tokenize/encrypt + de-duplicate; encryption-at-rest |
| **C2** | Sensitive values (incl. PAN) egress to third-party voice AI; `sensitive` blocks writes not reads | Complete mediation; minimize attack surface; voice/biometric minimization; zero-trust | **P0** redact voice `page_context`; **P1** consent-gate + DPA |
| **C3** | Fixed OTP `123456` accepted in prod (`DEMO_LOGIN`) | Secure defaults; fail-closed | **P0** disable demo/OTP bypass; fail-closed verify |
| **C4** | Default super-admin `admin@swiftloan.com/admin123` seeded & shown | Secure defaults; least privilege | **P0** remove default creds + MFA; **P1** RBAC |
| **C5** | Real Ello API key committed (`render.yaml:53`, `voice-widget.js:17`) | Secrets never in code | **P0** rotate & purge; gitleaks (added ➕) + push protection (G12) |
| **C6** | Fail-open JWT/admin secret fallbacks (`env.ts:12-13`) | Fail-closed; secure defaults | **P0** fail-closed secrets; refuse boot without real secret |
| **C7** | Wildcard CORS; no rate-limiting except auth (`app.ts:27`) | Minimize attack surface; defense in depth | **P1** strict CORS allow-list + rate-limit/WAF |
| **C8** | Unvalidated free-form tracking metadata PII sink (`tracking.routes.ts`) | Data minimization; no PII in logs; purpose limitation | **P2** validate + scrub `ActivityEvent.metadata` |
| **C9** | Orphan PII (leads/context/notifications) never purged; no TTL | Lifecycle protection (end-to-end security) | **P2** retention TTL + purge jobs |
| **C10** | No DSAR beyond self-delete; consent not enforced; AuditLog never written | Visibility/transparency; complete mediation; auditability/non-repudiation | **P1** consent gate; **P2** DSAR APIs + AuditLog |
| **C11** | Admin tokens in `localStorage` (XSS-exfiltratable) | Zero-trust between tiers; least privilege | **P1** httpOnly/Secure/SameSite cookies + CSP |
| **C12** | No DB encryption-at-rest/residency defined; no DPA with Ello/lenders | Defense in depth; lifecycle; zero-trust (supplier) | **P1** encryption-at-rest (India); **P1/P2** DPAs |
| **C13** | Voice transport cleartext `ws://`/`http://` by default | Zero-trust; secure defaults | **P1** enforce `wss`/`https` only |
| **C14** | No client-side secure input/masking for PAN/Aadhaar | Privacy-as-default; data minimization (exposure) | **P1** secure text entry + field masking |

**Summary.** Four findings breach **secure defaults / fail-closed** (C3, C4, C6, C13), three breach
**minimize attack surface / secrets** (C2, C5, C7), three breach **privacy-as-default / minimization**
(C1, C8, C14), and the remainder breach **lifecycle, mediation, auditability, and zero-trust** (C9–C12).
The P0 set (C3, C4, C5, C6, and voice redaction from C2) removes the most acute by-design violations.

---

## 10. Control mapping (ISO 27001:2022 / DPDP / SOC 2)

The principles and mechanisms in this document map to the following controls. A.8.25 / A.8.27 / A.8.28
are the primary secure-architecture/engineering anchors requested by the audit brief.

| Principle / mechanism (this doc) | ISO/IEC 27001:2022 Annex A | DPDP Act 2023 | SOC 2 (TSC) |
|---|---|---|---|
| Secure defaults (§3.1) | A.8.9, A.8.27 | §8 (safeguards) | CC6.1, CC6.6 |
| Least privilege (§3.2) | A.5.15, A.5.18, A.8.2, A.8.3 | §8 | CC6.1, CC6.3 |
| Defense in depth (§3.3) | A.8.24, A.8.20–A.8.23, A.8.26 | §8 | CC6.6, CC6.7 |
| Fail-closed / fail-safe (§3.4) | A.8.27, A.8.9 | §8 | CC6.1, CC7.1 |
| Minimize attack surface (§3.5) | A.8.20, A.8.21, A.8.9, A.8.16 | §8 | CC6.6, CC6.7 |
| Complete mediation / no bypass (§3.6) | A.5.15, A.8.15, A.8.16 | §6, §8 | CC6.1, CC7.2 |
| Separation of duties (§3.7) | A.5.3, A.8.4, A.8.32 | — | CC5.x, CC8.1 |
| Economy of mechanism (§3.8) | A.8.25, A.8.27 | §8 (minimization) | CC8.1 |
| Auditability / non-repudiation (§3.9) | A.8.15, A.8.16, A.8.17 | §8; breach evidence | CC7.2, CC7.3 |
| Zero-trust between tiers (§3.10) | A.8.20, A.8.21, A.5.19–A.5.23 | §8 | CC6.6, CC6.7, CC9.2 |
| Secrets never in code (§3.11) | A.8.24, A.8.4, A.8.8 | §8 | CC6.1, CC7.1 |
| **Secure architecture & engineering (whole doc)** | **A.8.25, A.8.27, A.8.28** | §8 (accountability) | CC1.x, CC8.1 |
| Privacy-by-Design — Cavoukian (§4) | A.5.34, A.8.11 (masking), A.8.10 (deletion) | §5, §6, §8, §11–§13 | P-series / CC (privacy) |
| Data minimization / purpose limitation (§4.8) | A.8.11, A.5.34 | §5, §6 | CC6.1 |
| Compliance-by-Design & CI gates (§5) | A.5.31, A.5.36, A.8.8, A.8.25 | §8, §10 (fiduciary duties) | CC1.x, CC7.1, CC8.1 |
| Threat model / STRIDE (§6) | A.8.8, A.8.25, A.8.27 | §8 | CC3.2, CC7.1 |
| DPIA (§7) | A.5.34, A.8.25 | §8; RBI DLG | CC3.1, CC3.2 |
| Secure-defaults checklist (§8) | A.8.25, A.8.28, A.8.32 | §8 | CC8.1 |

---

*End of document. This document describes the target by-design architecture and the current gap; it does
not assert that the present build is fully by-design. Findings C1–C14 and remediations P0–P3 are governed
by the audit brief (`docs/compliance/_AUDIT_BRIEF.md`) and tracked through the SDLC in Doc 07.*

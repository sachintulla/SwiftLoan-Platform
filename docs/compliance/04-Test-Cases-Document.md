# SwiftLoan — Test Cases & Test Plan Document

> **Document ownership & accountable roles** — Product Owner: **Sridhar Muppidi** · Product / Technical Head: **Sachin Tulla** · Head of Engineering: **Hari PS** · Security Head: **Anil M**.

**Classification: CONFIDENTIAL** — Audit evidence. Restricted to QA, Engineering, Security, DPO, and appointed auditors.

---

## 1. Document Control

| Field | Value |
|---|---|
| Document title | SwiftLoan Test Cases & Test Plan Document |
| Document ID | SL-QA-TCD-04 |
| Version | 1.0 |
| Date | 2026-08-04 |
| Owner | QA Lead |
| Contributors | Engineering Lead, Security Lead, Data Protection Officer (DPO) |
| Status | Approved for Audit |
| Classification | Confidential |
| Related regime | ISO/IEC 27001:2022, ISO/IEC 27701:2019, SOC 2 (Trust Services Criteria), DPDP Act 2023, RBI Digital Lending Guidelines 2022, CERT-In Directions 2022 |

### 1.1 Revision History

| Version | Date | Author | Change summary | Approver |
|---|---|---|---|---|
| 0.1 | 2026-07-20 | QA Lead | Initial skeleton, test strategy | — |
| 0.2 | 2026-07-28 | QA Lead + Security Lead | Added security/privacy/control-verification test cases mapped to C1–C14 | — |
| 0.9 | 2026-08-01 | QA Lead | Added ISO control matrix + RTM | Engineering Lead |
| 1.0 | 2026-08-04 | QA Lead | Baselined for ISO/DPDP/RBI audit evidence | QA Lead, DPO |

### 1.2 Distribution & Approval

| Role | Name/Placeholder | Responsibility |
|---|---|---|
| QA Lead (Owner) | [QA Lead] | Authoring, execution oversight, sign-off |
| Engineering Lead | [Eng Lead] | Technical accuracy, defect triage |
| Security Lead | [Sec Lead] | Security/VAPT alignment |
| DPO | [DPO] | Privacy/DPDP verification sign-off |
| External Auditor | [Auditor] | Evidence acceptance |

---

## 2. Introduction

### 2.1 Purpose
This document defines the complete, audit-grade test plan and detailed test cases for the **SwiftLoan** digital lending marketplace (Lending Service Provider / Digital Lending App operating on behalf of RBI-regulated lenders). It establishes how functional correctness, security, privacy/data-protection, and ISO/IEC 27001:2022 control effectiveness are verified, and it provides the traceable evidence base for ISO, DPDP Act 2023, and RBI Digital Lending audits.

### 2.2 Scope
**In scope:**
- React Native mobile app (iOS + Android) — onboarding, auth, loan funnel, KYC stubs, profile.
- Node/Express/Prisma/PostgreSQL backend (`server/`) — auth, applications, loans, tracking, admin APIs.
- Next.js admin dashboard (`admin/`) — RBAC, PII handling, session/token storage.
- External Ello/Getello "Ruby" voice assistant integration — data egress boundary.
- Cross-cutting controls: encryption, masking, consent, DSAR/retention, secrets, logging/audit.

**Out of scope (noted, not executed here):**
- KYC providers' internal systems (Aadhaar/PAN/bank/selfie are demo stubs in this build — verified as stubs, not as production KYC).
- Third-party lender core-banking systems (verified only at the SwiftLoan boundary).
- Physical/data-center controls inherited from the cloud provider (A.7) — validated by provider attestation, not by SwiftLoan test cases.

### 2.3 References
| Ref | Document |
|---|---|
| R1 | `_AUDIT_BRIEF.md` — Verified Fact Base (single source of truth; concerns C1–C14) |
| R2 | 01-PRD (Product Requirements Document) — FR/NFR IDs |
| R3 | 02-TAD (Technical Architecture Document) |
| R4 | 03-Security & Compliance Document (risk register, control design) |
| R5 | Existing Jest suite `__tests__/` (~110 tests: logic, router, screens, store, i18n, voice) |
| R6 | `docs/USE_CASES.md` — use-case matrix (UC IDs) |
| R7 | VAPT report (external, to be linked on completion) |
| R8 | SOC 2 Trust Services Criteria (AICPA TSP section 100) — Security (Common Criteria CC1–CC9), Availability, Confidentiality, Processing Integrity, Privacy |

### 2.4 Test Objectives
1. Verify all onboarding, auth, and loan-funnel functional requirements behave per PRD.
2. Prove that every verified concern C1–C14 is either **fixed and regression-locked** or **explicitly flagged as an open defect with a failing/expected-fail test**.
3. Demonstrate PII data-protection controls: PAN encryption/tokenization, masking, minimization (last-4), no sensitive egress to the voice assistant.
4. Verify access control/RBAC, secrets hygiene, consent, DSAR/retention, and audit logging.
5. Produce traceable evidence (TC-ID ↔ requirement ↔ ISO control) suitable for ISO 27001, DPDP, and RBI audits.

---

## 3. Test Strategy

### 3.1 Test Levels
| Level | Description | Primary tooling |
|---|---|---|
| Unit | Pure logic (validators, crypto, formatters, reducers) | Jest |
| Integration | Route + DB + middleware (auth, RBAC, tracking, DSAR) | Jest + Supertest against test Postgres |
| System / E2E | Full flows across app → API → DB (onboarding→offers→loan) | Detox / Maestro + `npm run smoke` |
| UAT | Business acceptance by QA Lead + product owner | Manual, scripted |
| Security | Abuse/negative testing, VAPT-aligned | Manual + OWASP ZAP + custom scripts |

### 3.2 Test Types
Functional, Security (authz/authn, injection, transport), Privacy/Data-Protection (PII storage, masking, egress, consent, DSAR/retention), Performance/Load, Availability/Resilience, Accessibility (a11y), Localization (en/hi + fallbacks), Compliance/Control-Verification (ISO/IEC 27001:2022 Annex A **and** SOC 2 Trust Services Criteria), and Regression.

Compliance/control-verification tests are dual-mapped: each is traceable to both an ISO 27001 Annex A control (§5) and a SOC 2 Trust Services Criterion (§5A), so a single execution produces evidence for both audit programs.

### 3.3 Environments
| Env | Purpose | Data | Notes |
|---|---|---|---|
| DEV | Developer local | Synthetic seed | `DEMO_LOGIN`/fixed-OTP allowed **only here** |
| TEST/CI | Automated Jest + integration | Ephemeral test DB | Fresh DB per run; secrets injected, no fallbacks |
| STAGING | System/UAT/security | Masked prod-like | Prod config flags; VAPT target |
| PROD | Live | Real PII | Read-only verification probes only; **no destructive tests** |

**Prod-config invariant:** `NODE_ENV=production` must disable fixed-OTP/DEMO_LOGIN (C3), default admin creds (C4), and secret fallbacks (C6). Several test cases assert this explicitly.

### 3.4 Entry / Exit Criteria
**Entry:** requirement baseline frozen; build deployed to target env; test data provisioned; secrets injected via vault; prior blocker defects closed.
**Exit:** 100% of P1 (Critical) and P2 (High) test cases executed; ≥95% overall pass; **zero open Critical/High security or privacy defects**; all C1–C14 have a linked TC with a recorded verdict; RTM and ISO matrix fully mapped; QA Lead + DPO + Security Lead sign-off.

### 3.5 Defect Severity & Priority
**Severity (impact):**
- **S1 Critical** — PII exposure, auth bypass, secret leak, data loss, non-compliance blocking go-live.
- **S2 High** — control ineffective but bounded; major function broken with no workaround.
- **S3 Medium** — function broken with workaround; minor control gap.
- **S4 Low** — cosmetic, docs, localization nit.

**Priority (fix order):** P0 immediate (blocks release), P1 next release, P2 backlog-soon, P3 backlog. All C1–C14 map to S1/S2 and P0/P1 per R1 §6.

### 3.6 Tools
Jest, React Native Testing Library, Supertest, Detox/Maestro, OWASP ZAP, `npm run smoke`, `gitleaks`/`trufflehog` (secret scan), `axe`/manual screen-reader (a11y), `sqlmap`-style injection probes (staging only), TLS scanners (`testssl.sh`).

---

## 4. Detailed Test Cases

> Legend — **Type:** F=Functional, S=Security, P=Privacy/Data-Protection, PF=Performance, A=Accessibility, L=Localization, C=Compliance/Control-Verification, R=Regression. **Priority:** P0–P3 (see §3.5).
> Where a test targets a currently-open concern, the **Expected result** describes the *required* (post-remediation) behavior; the current build is expected to FAIL until remediated. Such cases are marked **[GATE]**.

### 4.1 Module: Onboarding & Authentication

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-AUTH-001 | Phone number format validation | FR-AUTH-01 | mobile screen open | Enter phone; tap Continue | `98765` (short), `abcdefghij`, `9876543210` | Invalid rejected inline; valid 10-digit Indian mobile accepted | P1 | F |
| TC-AUTH-002 | OTP request issues hashed token | FR-AUTH-02 / A.8.24 | Valid phone entered | Request OTP; inspect `OtpToken` row | phone `9876543210` | OTP stored as SHA-256 `codeHash`, never plaintext (schema:94) | P0 | S |
| TC-AUTH-003 | OTP happy path | FR-AUTH-03 | OTP sent | Enter correct OTP; verify | valid OTP | Session issued (access+refresh); routed to aboutyou/home | P1 | F |
| TC-AUTH-004 | OTP expiry rejected | FR-AUTH-04 | OTP sent, TTL elapsed | Wait past TTL; submit OTP | expired OTP | 401/invalid; no session; must re-request | P1 | S |
| TC-AUTH-005 | OTP single-use (consumed) | FR-AUTH-05 | OTP verified once | Reuse same OTP | already-used OTP | Rejected; token marked consumed, not re-verifiable | P1 | S |
| TC-AUTH-006 | **Fixed OTP 123456 REJECTED in prod** | C3 / A.8.5 | `NODE_ENV=production`, `DEMO_LOGIN` unset | Submit `123456` against real phone | `123456` | **[GATE]** Rejected as invalid in prod; accepted ONLY in DEV. `crypto.ts:9-11` bypass and client `client.ts:77-84` disabled under prod | P0 | S/C |
| TC-AUTH-007 | DEMO_LOGIN disabled in prod config | C3 | Prod render config | Inspect env; attempt demo login | — | `DEMO_LOGIN` false/absent in prod; demo path returns 403 | P0 | C |
| TC-AUTH-008 | Auth rate-limiting | FR-AUTH-06 / A.8.20 | — | Send >N OTP requests / verify attempts rapidly | 20 rapid attempts | 429 after threshold; backoff enforced per phone+IP | P0 | S |
| TC-AUTH-009 | Refresh-token rotation | FR-AUTH-07 / A.8.24 | Valid session | Call refresh; reuse old refresh token | rotated tokens | New refresh issued; old refresh invalidated (reuse → 401) | P1 | S |
| TC-AUTH-010 | Refresh-token stored hashed | C-store / A.8.24 | Session exists | Inspect refresh token row | — | Stored hashed (schema:107), not plaintext | P1 | S |
| TC-AUTH-011 | Session on "Skip"/anonymous login | FR-AUTH-08 | Guest path | Tap Skip → ensureSession | — | Anonymous session created; no PII required; limited scope | P2 | F |
| TC-AUTH-012 | Password hashing (admin/optional) | C4-adj / A.8.24 | Admin user exists | Inspect `passwordHash` | — | bcrypt hash only (`crypto.ts:4`); no plaintext/reversible | P1 | S |
| TC-AUTH-013 | Logout invalidates refresh | FR-AUTH-09 | Logged in | Logout; attempt refresh | — | Refresh revoked; subsequent refresh 401 | P2 | F |
| TC-AUTH-014 | OTP not logged/echoed | C-log / A.8.15 | OTP flow | Trigger OTP; scan server logs & responses | — | OTP value never appears in logs or API responses | P0 | P |

### 4.2 Module: Loan Funnel

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-LOAN-001 | Create application | FR-LOAN-01 | Authed session | Submit basic → createApplication | name/DOB/income/pincode | `LoanApplication` created, linked to user | P1 | F |
| TC-LOAN-002 | Update application (partial) | FR-LOAN-02 | App exists | PATCH additional fields | employment, income | Fields updated; ownership preserved | P2 | F |
| TC-LOAN-003 | Amount carry-over fare→basic | FR-LOAN-03 | Fare EMI calc used | Set amount in fare; proceed | ₹2,00,000 | Amount carried into application; consistent in offers | P2 | F |
| TC-LOAN-004 | Offers generated | FR-LOAN-04 | App complete | Reach finding→offers | — | ≥1 offer rendered; amounts in paise correct via `inr()` | P2 | F |
| TC-LOAN-005 | Handoff to lender | FR-LOAN-05 | Offer selected | Tap handoff | — | Handoff recorded; consent precondition enforced (see TC-CONS-002) | P1 | F |
| TC-LOAN-006 | EMI calculator correctness | FR-LOAN-06 | fare screen | Vary amount/tenure/rate | multiple | EMI matches reference formula within rounding | P2 | F |
| TC-LOAN-007 | Amounts stored in paise | FR-LOAN-07 | Any monetary write | Inspect DB | — | All amounts integer paise; no float rupee | P3 | F |

### 4.3 Module: KYC (Demo Stubs)

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-KYC-001 | KYC screens are non-functional stubs (documented) | R1 §2 | KYC flow | Open aadhaar/panv/bankv/selfie | — | Screens render as demo stubs; **no real biometric/KYC captured or stored**; build MUST NOT ship stubs as production KYC | P1 | C |
| TC-KYC-002 | PAN input format validation | FR-KYC-01 | basicpan screen | Enter PAN | `ABCDE1234F` (valid), `abcd1`, `12345ABCDE` | Regex `[A-Z]{5}[0-9]{4}[A-Z]` enforced; invalid rejected | P1 | F |
| TC-KYC-003 | Selfie stub stores nothing | R1 §3 | selfie screen | Complete stub | — | No face/biometric persisted (RBI no-biometric-storage) | P1 | P |
| TC-KYC-004 | Aadhaar captured as last-4 only | C-min / A.8.11 | aadhaar stub | Enter Aadhaar | 12-digit | Only `aadhaarLast4` persisted (schema:63); full number never stored | P0 | P |

### 4.4 Module: Data Protection (PII)

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-DP-001 | **PAN stored encrypted/tokenized, not plaintext** | C1 / A.8.11, A.8.24 | User + application with PAN | Inspect `User.panNumber` & `LoanApplication.panNumber` in DB | `ABCDE1234F` | **[GATE]** PAN stored as ciphertext/token, not readable plaintext; app-layer decrypt only on authorized read | P0 | P/S |
| TC-DP-002 | **PAN de-duplicated across models** | C1 | PAN captured | Inspect both storage locations | — | **[GATE]** Single source of truth (tokenized); no duplicated plaintext in `User` and `LoanApplication` (schema:62,171) | P0 | P |
| TC-DP-003 | PAN masked in admin UI | C1/C14 / A.8.11 | Admin views user with PAN | Open user profile in dashboard | — | Displays `ABCDE****F` style mask; full PAN not rendered client-side | P0 | P |
| TC-DP-004 | PAN masked in logs | C1 / A.8.15 | PAN write/read path | Trigger flow; scan server + app logs | — | No full PAN in any log line; masked or omitted | P0 | P |
| TC-DP-005 | Aadhaar only last-4 everywhere | A.8.11 | Aadhaar stub used | Inspect DB, API, logs, UI | — | Only last-4 present anywhere; full Aadhaar never persisted/egressed | P0 | P |
| TC-DP-006 | Bank account only last-4 | A.8.11 | Loan with bank | Inspect `Loan.accountLast4` | — | Only last-4 (schema:265); no full account number | P1 | P |
| TC-DP-007 | **Voice page_context excludes PAN/sensitive** | C2 / A.8.12, A.8.11 | Voice widget "Ruby" active on basicpan | Trigger `page_context`/`read_screen`; capture egress to getello.ai | live PAN in field | **[GATE]** Sensitive field VALUES redacted from egress; `sensitive` flag must block **reads** not only writes (`actionRegistry.ts:204`, `screenGraph.ts:207`, `tools.ts:259`) | P0 | P/S |
| TC-DP-008 | Voice never reads PAN/OTP/Aadhaar aloud | C2 | Voice active | Ask assistant to read sensitive fields | — | Assistant refuses per system prompt; no sensitive value spoken | P1 | P |
| TC-DP-009 | TLS in transit (API) | C13 / A.8.24 | Staging/prod | Attempt `http://` and inspect cert | — | HTTP redirects/refused; TLS1.2+; HSTS present | P0 | S |
| TC-DP-010 | DB encryption at rest | C12 / A.8.24 | DB provisioned | Verify storage encryption + region | — | **[GATE]** Encryption-at-rest enabled; data residency = India; encrypted backups | P1 | C |
| TC-DP-011 | Full DOB minimization review | DPDP min. | User with DOB | Inspect stored DOB vs need | — | DOB stored is justified (age needed); documented in RoPA; consider year-only where possible | P3 | P |
| TC-DP-012 | PII not in tracking metadata | C8 / A.8.12 | Tracking events | Emit events; inspect `ActivityEvent.metadata` | name/PAN in metadata attempt | **[GATE]** Metadata schema-validated; PII rejected/scrubbed (`tracking.routes.ts:30,67`) | P0 | P |

### 4.5 Module: Access Control / RBAC

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-AC-001 | Admin endpoint rejects no-token | FR-ADM-01 / A.8.5 | Admin API | Call `/api/admin/*` without token | — | 401 Unauthorized | P0 | S |
| TC-AC-002 | Admin endpoint rejects expired token | A.8.5 | Expired admin JWT | Call admin API | expired JWT | 401; no data returned | P0 | S |
| TC-AC-003 | Admin endpoint rejects tampered token | A.8.24 | — | Alter JWT signature | tampered JWT | 401; signature verification fails | P0 | S |
| TC-AC-004 | **No default admin123 login** | C4 / A.8.5 | Prod seed | Attempt `admin@swiftloan.com / admin123` | default creds | **[GATE]** Login fails in prod; default creds not seeded/shown (`seed.ws4.ts:74,82-83`) | P0 | S/C |
| TC-AC-005 | Admin MFA enforced | R1 §6 P0 | Admin login | Login without 2nd factor | — | **[GATE]** MFA required for admin | P1 | S |
| TC-AC-006 | Role restrictions on PII access | FR-ADM-02 / A.8.3 | Low-priv admin role | Access PII-heavy endpoint | analyst role | 403 unless role permits; least-privilege enforced | P0 | S |
| TC-AC-007 | **CORS allow-list enforced** | C7 / A.8.20 | Backend | Send cross-origin request from disallowed origin | evil.example | **[GATE]** Rejected; only allow-listed origins (replace open `cors()` at `app.ts:27`) | P0 | S/C |
| TC-AC-008 | Per-route rate-limiting | C7 / A.8.20 | Non-auth routes | Flood admin/tracking routes | burst | **[GATE]** Rate-limited/WAF on all routes, not just auth | P1 | S |
| TC-AC-009 | **Admin tokens NOT in localStorage** | C11 / A.8.5 | Admin logged in | Inspect browser storage | — | **[GATE]** Tokens in httpOnly cookies, not localStorage (`admin/src/lib/api.ts:12-22`); not XSS-exfiltratable | P0 | S/C |
| TC-AC-010 | Admin refresh rotation | A.8.24 | Admin session | Rotate; reuse old | — | Rotating refresh enforced (adminAuth.routes.ts) | P1 | S |
| TC-AC-011 | Vertical privilege escalation blocked | A.8.5 | Regular user token | Call admin API with user token | user JWT | 403; role claim checked | P0 | S |

### 4.6 Module: Secrets Management

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-SEC-001 | **No committed secrets in repo** | C5 / A.8.24, A.8.9 | Repo checkout | Run `gitleaks`/`trufflehog` on full history | — | **[GATE]** No live API keys; Ello key removed & rotated (`render.yaml:53`, `website/js/voice-widget.js:17`) | P0 | S/C |
| TC-SEC-002 | **Server fails to boot without real secrets** | C6 / A.8.9 | No JWT/admin secret set | Start server without secrets | unset env | **[GATE]** Fail-closed: refuses to boot; no `dev-access`/`dev-refresh` fallback (`config/env.ts:12-13`) | P0 | S/C |
| TC-SEC-003 | Admin secret independent of app secret | C6 | — | Inspect derivation | — | **[GATE]** Admin secret not derived from app fallback; independently provisioned | P1 | S |
| TC-SEC-004 | Secrets sourced from vault/env only | A.8.24 | Deploy | Inspect config load path | — | Secrets from secret manager; none in source/images | P1 | C |
| TC-SEC-005 | Rotated Ello key not in client bundle | C5 | Web/app build | Grep built assets | — | **[GATE]** No embedded provider key in shipped client | P0 | S |

### 4.7 Module: Consent & Privacy

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-CONS-001 | Consent recorded (terms/soft_pull/data_sharing/comms) | FR-PRIV-01 / A.5.34 | Onboarding consent step | Grant consents | — | `Consent` rows written with type, timestamp, version | P1 | P |
| TC-CONS-002 | **Consent checked before partner/CIBIL share** | FR-PRIV-02 / CICRA | Handoff / bureau pull | Attempt share without data_sharing/soft_pull consent | consent absent | **[GATE]** Share blocked until consent present; enforced server-side | P0 | P/C |
| TC-CONS-003 | Consent withdrawal honored | DPDP rights | Consent granted | Withdraw consent | — | **[GATE]** Withdrawal recorded; downstream sharing stops | P1 | P |
| TC-CONS-004 | **Tracking metadata contains no PII** | C8 / A.8.12 | Consent/analytics | Inspect tracking payloads | — | **[GATE]** No PII in tracking; consent-gated analytics | P0 | P |
| TC-CONS-005 | Consent versioning & re-consent | DPDP | Terms updated | Change terms version | — | User re-prompted; old consent version retained as evidence | P2 | P |
| TC-CONS-006 | KFS / lender disclosure shown (RBI) | RBI DLG | Offer/handoff | Reach handoff | — | Key Fact Statement + lender identity disclosed pre-commitment | P1 | C |

### 4.8 Module: DSAR & Retention

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-DSAR-001 | Data access/export (self) | C10 / DPDP | Authed user | Request export | — | **[GATE]** Machine-readable export of all personal data returned | P1 | P |
| TC-DSAR-002 | User self-delete cascade | R1 §4 | Authed user | `DELETE /me` | — | Hard delete with cascade (`users.routes.ts:91`); user data removed | P1 | P |
| TC-DSAR-003 | **Erasure covers orphan leads/context** | C9/C10 | AnonymousLead + ContextSession for subject | Erasure request | — | **[GATE]** Orphan PII (AnonymousLead, ContextSession, Notification.body) also erased | P0 | P/C |
| TC-DSAR-004 | Correction/rectification | DPDP | Authed user | Request field correction | wrong name | **[GATE]** Correction applied; audit recorded | P2 | P |
| TC-DSAR-005 | **Retention TTL purge job** | C9 / A.8.10 | Aged leads/context beyond TTL | Run purge job | records past TTL | **[GATE]** Expired orphan PII purged automatically; TTL configured | P1 | C |
| TC-DSAR-006 | **AuditLog written on PII access** | C10 / A.8.15 | Admin reads user PII | Perform PII read | — | **[GATE]** `AuditLog` entry created (actor, subject, field, time); currently model exists but not written | P0 | C |
| TC-DSAR-007 | DSAR SLA & identity verification | DPDP | DSAR raised | Process request | — | Requester identity verified; response within statutory SLA | P2 | C |
| TC-DSAR-008 | Log retention 180 days (CERT-In) | CERT-In / A.8.15 | Logging active | Verify retention config | — | Logs retained ≥180 days; NTP-synced timestamps | P1 | C |

### 4.9 Module: Security — Negative / Abuse

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-ABU-001 | IDOR on application ownership | A.8.5 | Two users A,B | User A requests B's `applicationId` | B's app id | 403/404; ownership enforced server-side | P0 | S |
| TC-ABU-002 | IDOR on loan/offer objects | A.8.5 | Users A,B | Access cross-user loanId | B's loan id | Denied; no cross-tenant read | P0 | S |
| TC-ABU-003 | Mass-assignment guard | A.8.25 | Update endpoints | POST extra fields (`role`, `creditScore`, `isAdmin`) | crafted body | Non-permitted fields ignored; no privilege/score tamper | P0 | S |
| TC-ABU-004 | SQL/NoSQL injection | A.8.25 | Any input field | Inject payloads | `' OR 1=1--`, `${}` | Parameterized (Prisma) blocks injection; no error leak | P0 | S |
| TC-ABU-005 | XSS in admin-rendered fields | A.8.25 | Lead/user free-text | Inject `<script>` in name/city | XSS payload | Output-encoded; no script execution in dashboard | P1 | S |
| TC-ABU-006 | Cleartext transport blocked (voice) | C13 / A.8.24 | Voice config | Force `ws://`/`http://` to getello | — | **[GATE]** Only `wss://`/`https://` permitted (`voice/config.ts`) | P0 | S/C |
| TC-ABU-007 | Cleartext transport blocked (mobile ATS) | C13 / A.8.24 | iOS/Android build | Attempt arbitrary HTTP load | — | Blocked: iOS `NSAllowsArbitraryLoads=false` (Info.plist:29-35); Android cleartext disallowed | P0 | S |
| TC-ABU-008 | Authorization bypass via header tamper | A.8.5 | — | Spoof `X-User-Id`/role headers | forged headers | Server ignores client-asserted identity; JWT authoritative | P0 | S |
| TC-ABU-009 | Broken object-level authz on admin PII | A.8.3 | Analyst role | Fetch out-of-scope subject | — | 403; row-level scoping enforced | P1 | S |
| TC-ABU-010 | Replay of OTP/refresh | A.8.24 | Captured token | Replay after use | — | Rejected (single-use/rotation) | P1 | S |
| TC-ABU-011 | Voice tool `sensitive` flag blocks reads | C2 / A.8.12 | Voice registry | Invoke read on sensitive-flagged field | — | **[GATE]** Read blocked, not just write (`tools.ts:259`) | P0 | S |
| TC-ABU-012 | Error responses leak no stack/PII | A.8.15 | Force errors | Trigger 500s | malformed input | Generic error; no stack traces, secrets, or PII in body | P1 | S |

### 4.10 Module: Non-Functional

| TC-ID | Title | Req/Control | Preconditions | Steps | Test Data | Expected Result | Prio | Type |
|---|---|---|---|---|---|---|---|---|
| TC-NFR-001 | API load / throughput | NFR-PERF-01 | Staging | Ramp concurrent users to target | 500 RPS | p95 latency within SLA; no errors under target load | P1 | PF |
| TC-NFR-002 | Availability / resilience | NFR-AVL-01 | Staging | Kill a dependency (Redis/DB replica) | — | Graceful degradation; in-process fallback where designed | P2 | PF |
| TC-NFR-003 | Accessibility — screen reader labels | NFR-A11Y-01 | App screens | Navigate with VoiceOver/TalkBack | — | All controls labeled; focus order logical; tappable targets ≥44pt | P1 | A |
| TC-NFR-004 | Accessibility — contrast & scaling | NFR-A11Y-02 | App screens | Enable large text/high contrast | — | Text scales; contrast meets WCAG AA | P2 | A |
| TC-NFR-005 | Localization en/hi + fallback | NFR-L10N-01 | Language switch | Switch to hi, te, hinglish | — | hi renders; te/hinglish/tenglish fall back to en without missing keys | P2 | L |
| TC-NFR-006 | Offline/guest graceful demo data | NFR-RES-01 | Offline | Use funnel offline/guest | — | Degrades to demo data; no crash; no false persistence | P2 | F |
| TC-NFR-007 | Currency formatting (INR) | NFR-L10N-02 | Any amount | Render amounts | ₹12,34,567 | Indian grouping via `inr()`/`rupee()`; paise→rupee correct | P3 | F |

---

## 5. ISO/IEC 27001:2022 Annex A — Control Verification Test Matrix

| Annex A control | Control intent | Verifying TC-IDs | Concern link |
|---|---|---|---|
| A.5.19–5.23 Supplier / third-party (incl. cloud) | DPA & security of Ello, lenders, host | TC-DP-007, TC-DP-010, TC-ABU-006, TC-SEC-004 | C2, C12 |
| A.5.24–5.28 Incident management | Breach detection/reporting (CERT-In 6-hr) | TC-DSAR-008, TC-ABU-012 (evidence), incident runbook review | C10 |
| A.5.34 Privacy & PII protection | Consent, DPDP duties | TC-CONS-001..005, TC-DSAR-001..007 | C8, C9, C10 |
| A.8.2 Privileged access rights | Admin/role least-privilege | TC-AC-005, TC-AC-006, TC-AC-011, TC-ABU-009 | C4 |
| A.8.3 Information access restriction | PII access scoping | TC-AC-006, TC-ABU-001, TC-ABU-002, TC-ABU-009 | — |
| A.8.5 Secure authentication | Auth/RBAC, no defaults | TC-AUTH-003..010, TC-AC-001..004, TC-AC-011, TC-ABU-008 | C3, C4 |
| A.8.8 Vulnerability management | Injection/abuse hardening, VAPT | TC-ABU-003..005, TC-ABU-010, VAPT (R7) | C7 |
| A.8.9 Configuration management | Prod config invariants, fail-closed | TC-AUTH-007, TC-SEC-002..004 | C3, C6 |
| A.8.10 Information deletion | Retention TTL / purge | TC-DSAR-002, TC-DSAR-003, TC-DSAR-005 | C9 |
| A.8.11 Data masking | PAN/Aadhaar/bank masking & minimization | TC-DP-003, TC-DP-004, TC-DP-005, TC-DP-006, TC-KYC-004 | C1, C14 |
| A.8.12 Data leakage prevention | No PII egress (voice/tracking) | TC-DP-007, TC-DP-012, TC-CONS-004, TC-ABU-011 | C2, C8 |
| A.8.13 Information backup | Encrypted backups, India region | TC-DP-010 | C12 |
| A.8.15 Logging | Audit logs, no PII/secrets in logs | TC-AUTH-014, TC-DP-004, TC-DSAR-006, TC-DSAR-008, TC-ABU-012 | C10 |
| A.8.20 Network security controls | CORS allow-list, rate-limit/WAF | TC-AUTH-008, TC-AC-007, TC-AC-008 | C7 |
| A.8.24 Cryptography | TLS, hashing, encryption at rest, secrets | TC-AUTH-002, TC-AUTH-009, TC-AUTH-010, TC-AUTH-012, TC-DP-001, TC-DP-009, TC-DP-010, TC-SEC-001..005, TC-ABU-006, TC-ABU-007 | C1, C5, C6, C12, C13 |
| A.8.25–8.28 Secure development lifecycle | Mass-assignment, injection, secure coding | TC-ABU-003, TC-ABU-004, TC-ABU-005, TC-KYC-002 | — |

---

## 5A. SOC 2 Trust Services Criteria (TSC) — Verification Test Matrix

Companion to the ISO 27001 matrix (§5). Maps representative Trust Services Criteria to the TC-IDs that verify control operating effectiveness over a SOC 2 Type II review period.

| TSC | Criterion intent | Verifying TC-IDs | Concern link |
|---|---|---|---|
| **CC6.1–CC6.3** Logical access — authentication & authorization | Auth, RBAC, least-privilege, no default admin | TC-AUTH-003..010, TC-AC-001..006, TC-AC-011, TC-AUTH-006, TC-AUTH-007 | C3, C4 |
| **CC6.6** Boundary protection | CORS allow-list, rate-limit/WAF | TC-AC-007, TC-AC-008, TC-AUTH-008 | C7 |
| **CC6.7** Restriction of information in transit/storage | Token storage (not localStorage), transport encryption | TC-AC-009, TC-DP-009, TC-ABU-006, TC-ABU-007 | C11, C13 |
| **CC6.8** Prevention of unauthorized/malicious software & tamper | Mass-assignment, injection, header/identity tamper | TC-ABU-003, TC-ABU-004, TC-ABU-005, TC-ABU-008 | — |
| **CC7.1–CC7.2** System operations — monitoring & detection | Logging, AuditLog on PII access, log retention/NTP, no PII/secrets in logs | TC-AUTH-014, TC-DP-004, TC-DSAR-006, TC-DSAR-008, TC-ABU-012 | C10 |
| **CC7.3–CC7.4** Incident response & evaluation | Error handling, breach-report readiness (CERT-In 6-hr) | TC-ABU-012, TC-DSAR-008, incident runbook review | C10 |
| **CC8.1** Change management — secure development | Secure-dev lifecycle, prod-config invariants, secrets hygiene, fail-closed | TC-SEC-001..005, TC-AUTH-007, TC-KYC-002, TC-ABU-003, TC-ABU-004 | C5, C6 |
| **CC9.1–CC9.2** Risk mitigation — vendors & third parties | Third-party/Ello egress, DPA, no sensitive egress to voice AI | TC-DP-007, TC-DP-008, TC-DP-010, TC-ABU-006, TC-ABU-011, TC-SEC-004 | C2, C12 |
| **C1.1–C1.2** Confidentiality | PAN encryption/tokenization, masking, TLS, encryption-at-rest, last-4 minimization | TC-DP-001..006, TC-DP-009, TC-DP-010, TC-KYC-004 | C1, C12, C14 |
| **P (Privacy) P1–P8** | Consent, notice, choice, DSAR (access/correct/export/erase), retention/disposal | TC-CONS-001..006, TC-DSAR-001..007, TC-DSAR-005, TC-DP-012, TC-CONS-004 | C8, C9, C10 |
| **A1.1–A1.3** Availability | Capacity/performance, resilience, degradation | TC-NFR-001, TC-NFR-002, TC-NFR-006 | — |
| **PI1.1–PI1.5** Processing Integrity | Input validation, correct processing, monetary/format integrity | TC-AUTH-001, TC-KYC-002, TC-DP-012, TC-LOAN-006, TC-LOAN-007, TC-NFR-007, TC-ABU-004 | C8 |

> **Common Criteria coverage note:** CC1 (control environment), CC2 (communication), CC3 (risk assessment), CC4 (monitoring), and CC5 (control activities) are primarily governance/entity-level criteria evidenced by policy, risk-register (R4), and management-review artifacts rather than by executable test cases; they are cross-referenced from the risk-register and RoPA/DPIA governance documents, not scoped as TC-IDs here.

---

## 6. Requirements Traceability Matrix (PRD → TC-IDs)

| Req ID | Requirement (summary) | Type | TC-IDs |
|---|---|---|---|
| FR-AUTH-01..09 | Phone/OTP/session/refresh auth | Functional | TC-AUTH-001..014 |
| FR-LOAN-01..07 | Application, amount carry-over, offers, handoff, EMI, paise | Functional | TC-LOAN-001..007 |
| FR-KYC-01 | PAN format validation; KYC stubs | Functional | TC-KYC-001, TC-KYC-002 |
| FR-ADM-01..02 | Admin auth + RBAC | Functional | TC-AC-001..011 |
| FR-PRIV-01..02 | Consent capture & enforcement | Privacy | TC-CONS-001..006, TC-DSAR-001..007 |
| NFR-PERF-01 | Performance/throughput | Non-func | TC-NFR-001 |
| NFR-AVL-01 | Availability/resilience | Non-func | TC-NFR-002, TC-NFR-006 |
| NFR-A11Y-01..02 | Accessibility | Non-func | TC-NFR-003, TC-NFR-004 |
| NFR-L10N-01..02 | Localization/currency | Non-func | TC-NFR-005, TC-NFR-007 |
| SEC-C1 | PAN encryption/tokenization, de-dup, masking | Security/Privacy | TC-DP-001..004 |
| SEC-C2 | No sensitive egress to voice AI | Security/Privacy | TC-DP-007, TC-DP-008, TC-ABU-011 |
| SEC-C3 | Fixed-OTP/DEMO_LOGIN off in prod | Security | TC-AUTH-006, TC-AUTH-007 |
| SEC-C4 | No default admin creds; MFA | Security | TC-AC-004, TC-AC-005 |
| SEC-C5 | No committed/embedded secrets | Security | TC-SEC-001, TC-SEC-005 |
| SEC-C6 | Fail-closed secrets | Security | TC-SEC-002, TC-SEC-003 |
| SEC-C7 | CORS allow-list + rate-limit | Security | TC-AC-007, TC-AC-008, TC-AUTH-008 |
| SEC-C8 | No PII in tracking metadata | Privacy | TC-DP-012, TC-CONS-004 |
| SEC-C9 | Retention TTL / orphan purge | Privacy | TC-DSAR-003, TC-DSAR-005 |
| SEC-C10 | DSAR + AuditLog on PII access | Privacy/Compliance | TC-DSAR-001..007, TC-DSAR-006 |
| SEC-C11 | Admin tokens not in localStorage | Security | TC-AC-009 |
| SEC-C12 | Encryption at rest + residency | Security | TC-DP-010 |
| SEC-C13 | No cleartext transport | Security | TC-DP-009, TC-ABU-006, TC-ABU-007 |
| SEC-C14 | Secure input / PAN masking | Security/Privacy | TC-DP-003, TC-KYC-004 |

---

## 7. Test Execution & Reporting

- **Cadence:** Unit + integration on every PR (CI gate); full regression nightly on TEST; system/UAT + security suite per release candidate on STAGING; VAPT per major release/annually.
- **Coverage goals:** ≥90% line/branch on security-sensitive backend modules (auth, RBAC, DSAR, crypto, tracking validation); 100% of C1–C14 gated TCs executed each RC.
- **Reporting:** Per-run report with pass/fail, defect list (severity/priority), and C1–C14 verdict table; trend dashboard for regression.
- **Sign-off:** Release blocked unless QA Lead, Security Lead, and DPO sign the exit-criteria attestation (§3.4). Open S1/S2 security or privacy defects are hard blockers.
- **VAPT linkage:** Security TCs (§4.9, TC-DP-007/009, TC-ABU-*) cross-reference the external VAPT report (R7); VAPT findings feed new regression TCs.

---

## 8. Compliance Evidence

Executed test results serve as primary audit evidence:

- **ISO/IEC 27001:2022** — the §5 control matrix maps each representative Annex A control to executed TC-IDs with recorded verdicts, evidencing control **operating effectiveness** (not just design). Test run artifacts (CI logs, screenshots, DB inspections) are retained as evidence records.
- **SOC 2 (Trust Services Criteria)** — the §5A TSC matrix maps CC6 (logical/physical access), CC7 (system operations), CC8 (change management), CC9 (risk mitigation/vendors), plus Confidentiality (C1), Privacy (P), Availability (A1), and Processing Integrity (PI1) criteria to executed TC-IDs. Because tests run on the defined cadence (§7) across the review window, the accumulated pass/fail records serve as **control-operating-effectiveness evidence for a SOC 2 Type II** examination (not merely Type I design). Each execution is timestamped and retained so the service auditor can sample results across the review period; the same run also satisfies the ISO 27001 mapping, avoiding duplicate testing.
- **DPDP Act 2023** — consent (TC-CONS-*), data-principal rights/DSAR (TC-DSAR-*), minimization/masking (TC-DP-*), and security safeguards (§4.9) evidence data-fiduciary duties. AuditLog verification (TC-DSAR-006) evidences accountability.
- **RBI Digital Lending Guidelines 2022** — KFS/lender disclosure (TC-CONS-006), no-biometric-storage (TC-KYC-003), data minimization/localization (TC-DP-005/006/010), and consent-gated bureau pull (TC-CONS-002) evidence LSP/DLA obligations.
- **CERT-In Directions 2022** — log retention ≥180 days and NTP sync (TC-DSAR-008); incident runbook and breach-reporting readiness referenced under A.5.24–5.28.
- **Evidence handling:** All results are classified **Confidential**, retention-tagged, and stored with the audit evidence pack. Every C1–C14 concern carries a linked TC and a dated verdict; **[GATE]** cases remain open defects until their expected (post-remediation) result is met.

*End of document.*

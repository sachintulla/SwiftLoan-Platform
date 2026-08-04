# SwiftLoan — Security & Compliance Document (ISMS)

> **Document ownership & accountable roles** — Product Owner: **Sridhar Muppidi** · Product / Technical Head: **Sachin Tulla** · Head of Engineering: **Hari PS** · Security Head: **Anil M**.

**Information Security Management System — ISO/IEC 27001:2022 Certification Support Document**

---

## 1. Document Control

| Field | Value |
|---|---|
| Document title | SwiftLoan Security & Compliance Document (ISMS) |
| Document ID | SWL-ISMS-03 |
| Version | 1.0 |
| Date | 2026-08-04 |
| Owner | Chief Information Security Officer (CISO) |
| Co-owner | Data Protection Officer (DPO) / Grievance Officer |
| Approver | Chief Executive Officer (top management, ISO 27001 Clause 5.1) |
| Status | Draft for internal audit / Stage 1 readiness review |
| Classification | **Restricted** (contains security posture, vulnerabilities, and control gaps) |
| Distribution | ISMS Steering Committee, external certification body (under NDA), statutory auditors |
| Source of truth | `docs/compliance/_AUDIT_BRIEF.md` (verified fact base; concerns C1–C14) |
| Next review | 2027-02-04 (6-monthly) or on material change |

### 1.1 Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-28 | CISO | Initial skeleton, scope drafting |
| 0.9 | 2026-08-01 | CISO + DPO | Risk register C1–C14, SoA first pass |
| 1.0 | 2026-08-04 | CISO | Full SoA, regulatory mapping, DSAR, retention, audit-readiness checklist — issued for review |

### 1.2 Classification scheme used in this document

| Level | Meaning | Examples |
|---|---|---|
| Public | No harm on disclosure | Marketing website copy, app store listing |
| Internal | Business-only, low harm | Funnel analytics, aggregate dashboards |
| Confidential | Harmful if disclosed | Source code, secrets, admin credentials, DPAs |
| Restricted | Highest — regulated PII/SPDI | PAN, Aadhaar, bank account, income, voiceprint, this document |

---

## 2. Introduction & ISMS Scope

### 2.1 Purpose

This document defines the Information Security Management System (ISMS) for the SwiftLoan platform and is structured to directly support an **ISO/IEC 27001:2022** certification audit **and an AICPA SOC 2 (Trust Services Criteria) examination**. It records the scope, governance, risk assessment and treatment, the **Statement of Applicability (SoA)**, a companion **SOC 2 Trust Services Criteria (TSC) mapping**, control narratives, regulatory mapping (India-first), incident response, data-principal rights, retention, and audit-readiness evidence. ISO 27001 and SOC 2 are treated as a single, harmonized control set: the same controls are mapped to both frameworks throughout.

### 2.2 What SwiftLoan is (regulatory posture)

SwiftLoan is a digital **loan marketplace / recommendation** application for the India market. It operates as a **Lending Service Provider (LSP)** running a **Digital Lending App (DLA)** on behalf of RBI-regulated lenders (banks / NBFCs). SwiftLoan does **not** lend directly and does **not** make credit-approval decisions. This posture drives the applicability of the RBI Digital Lending Guidelines 2022, the DPDP Act 2023 (SwiftLoan acts as a Data Fiduciary / and Data Processor to lenders for certain flows), and the IT Act SPDI Rules.

### 2.3 In scope

| Component | Description | Repo location |
|---|---|---|
| Mobile app | React Native 0.86 / React 19 / TypeScript (iOS + Android), 25 screens | app root, `src/` |
| Backend API | Node / Express / Prisma / PostgreSQL, JWT auth | `server/` |
| Admin dashboard | Next.js 14, analytics + operations | `admin/` |
| Marketing website | Static `website/` + `website-next/`, voice widget | `website/`, `website-next/` |
| Ello / Getello voice AI ("Ruby") | External third-party voice assistant / processor | `getello.ai` (external) |
| Database | PostgreSQL (hosted), Prisma schema | `server/prisma/schema.prisma` |
| CI/CD & hosting config | Render deployment | `render.yaml` |

### 2.4 ISMS boundaries

- **Included:** all application code, backend services, admin surfaces, the customer PII/SPDI data stores, third-party data egress to the Ello voice assistant, and the hosting/deploy configuration.
- **Interfaces / dependencies (governed via supplier controls, not directly operated):** cloud hosting provider (Render / underlying IaaS), the Ello/Getello voice AI processor, downstream RBI-regulated lenders and credit bureaus (CIBIL/CKYC), and app-store distribution channels.
- **Excluded:** end-user devices (customer-owned handsets) and lender-internal systems, except where SwiftLoan's data flows into them (governed by DPAs and supplier controls A.5.19–A.5.23).

**SOC 2 system scope:** the "system" for the SOC 2 examination is the SwiftLoan loan-marketplace service described above (mobile app, backend API, admin dashboard, website/voice widget, PostgreSQL data store, and the Ello voice-AI sub-processor interface). The **trust categories in scope are Security (Common Criteria — mandatory), Confidentiality, Privacy, and Availability**; Processing Integrity is included on a limited basis for the recommendation/lead-routing flow. The ISO 27001 ISMS boundary and the SOC 2 system boundary are intentionally aligned so a single control set serves both.

### 2.4a System architecture — as-built and target (ISMS scope illustration)

The as-built architecture below shows the attack surface and PII/SPDI data flows in scope (red = data-protection concern); the target architecture shows the control set the ISMS drives toward, tagged to the ISO 27001:2022 / SOC 2 TSC / DPDP / RBI obligation each control satisfies, inside an India data-residency boundary.

**Figure A — Current as-built architecture (data-protection view).**

![Figure A — SwiftLoan current as-built architecture](diagrams/arch-current.png)

**Figure B — Recommended target architecture (control set mapped to ISO 27001 / SOC 2 / DPDP / RBI).**

![Figure B — SwiftLoan recommended target architecture](diagrams/arch-recommended.png)

### 2.5 Context of the organization (ISO 27001 Clause 4)

**Internal issues:** early-stage product with several security controls already in place (bcrypt password hashing, hashed OTP/refresh tokens, Aadhaar/bank reduced to last-4, ATS enforced) but with material gaps in PII protection (PAN plaintext), secrets management, and privacy operations (no DSAR beyond self-delete, AuditLog never written).

**External issues:** stringent and evolving India regulatory landscape (DPDP Act 2023 rules, RBI DLG 2022, CERT-In 2022 directions), reliance on third-party AI voice processing, and high sensitivity of financial PII/SPDI that raises breach impact.

### 2.6 Interested parties and their requirements (Clause 4.2)

| Interested party | Key requirement |
|---|---|
| Data principals (loan applicants) | Confidentiality of PAN/Aadhaar/income; consent; rights (access/erase); grievance redress |
| RBI (via regulated lenders) | DLG 2022: data minimization, localization, no biometric storage, KFS, grievance officer |
| DPDP / Data Protection Board of India | Lawful consent, purpose limitation, breach notice, security safeguards |
| CERT-In | 6-hour incident reporting, 180-day log retention, NTP sync |
| Partner lenders / NBFCs | Contractual security, DPAs, accurate lead data, consented bureau pulls |
| Credit bureaus (CICRA) | Explicit consent before bureau pull |
| Certification body | Conformance to ISO/IEC 27001:2022 Clauses 4–10 and Annex A |
| SOC 2 service auditor (CPA firm) | Fair presentation and operating effectiveness of controls against the AICPA Trust Services Criteria (Security, Confidentiality, Privacy, Availability) |
| Customers' auditors / enterprise partners | SOC 2 report as third-party assurance over SwiftLoan's handling of their data |
| Investors / board | Risk posture, certification, brand protection |
| Employees / contractors | Clear security responsibilities, training, safe development practices |

---

## 3. Information Security Policy Summary & Governance (Clause 5)

### 3.1 Leadership and commitment (Clause 5.1)

Top management commits to establishing, maintaining, and continually improving the ISMS; ensuring resources; integrating ISMS requirements into business processes; and communicating the importance of information security. The ISMS objectives (see §12) are approved and reviewed at management review.

### 3.2 Information security policy (Clause 5.2) — summary

SwiftLoan protects the confidentiality, integrity, and availability of all information assets — with heightened protection for regulated financial PII/SPDI (PAN, Aadhaar, bank, income, voiceprint). The organization commits to: consent-based lawful processing, data minimization, encryption of sensitive data in transit and at rest, least-privilege access, secure development, continuous monitoring, timely breach notification (CERT-In 6-hour), and honouring data-principal rights. The policy is approved by top management, communicated to all staff, and reviewed at least annually.

### 3.3 Roles, responsibilities & authorities (Clause 5.3)

| Role | Holder | Responsibility |
|---|---|---|
| **CISO** (ISMS owner) | Chief Information Security Officer | Owns the ISMS, risk register, SoA, security architecture, incident response, and Annex A control operation |
| **DPO / Grievance Officer** | Data Protection Officer | DPDP data-fiduciary duties, RoPA, DPIA, DSAR fulfilment, breach notice to Data Protection Board, RBI-mandated grievance redress |
| **Product Owner** | Head of Product | Feature scope, consent UX, ensures privacy-by-design in the roadmap, prioritizes P0–P3 remediation |
| ISMS Steering Committee | CEO, CISO, DPO, Product, Eng Lead | Management review, risk acceptance, resource allocation |
| Engineering Lead | Head of Engineering | Secure SDLC, code review, vulnerability remediation, secrets hygiene |
| Asset owners | Named per asset in §4 | Day-to-day control operation for their asset |

> **Gap (from brief §6 P2):** a DPO / grievance officer must be formally appointed and published in-app (RBI DLG + DPDP requirement). This is tracked as an ISMS objective and in the risk treatment plan.

---

## 4. Asset & Data Classification

### 4.1 Asset inventory (primary information assets)

| Asset ID | Asset | Type | Owner | Classification |
|---|---|---|---|---|
| A-01 | PostgreSQL production DB (customer PII/SPDI) | Data store | CISO / Eng Lead | Restricted |
| A-02 | Backend API service (`server/`) | Application | Eng Lead | Confidential |
| A-03 | Mobile app (iOS/Android) | Application | Product Owner | Internal |
| A-04 | Admin dashboard (`admin/`) | Application | Eng Lead | Confidential |
| A-05 | Marketing website + voice widget | Application | Product Owner | Public / Confidential (secrets) |
| A-06 | Source code repositories | Intellectual property | Eng Lead | Confidential |
| A-07 | Secrets / API keys / JWT secrets (`render.yaml`, env) | Credential | CISO | Restricted |
| A-08 | Admin credentials & sessions | Credential | CISO | Restricted |
| A-09 | Ello/Getello voice AI integration (data egress) | Third-party interface | DPO | Restricted |
| A-10 | Backups | Data store | Eng Lead | Restricted |
| A-11 | Audit / activity logs | Log data | CISO | Confidential |

### 4.2 Data inventory & PII/SPDI classification (from brief §3)

| Data element | Collected at | Stored as | State today | Classification | SPDI (IT Act §43A)? |
|---|---|---|---|---|---|
| Phone number | `mobile.tsx` | `User.phone` (unique) | plaintext | Confidential | No (contact) |
| Name (first/last/full) | aboutyou, basic, profile | `User.firstName/lastName/fullName` | plaintext | Confidential | No |
| DOB / age | aboutyou, basic | `User.dob` | plaintext (full DOB) | Confidential | No |
| Monthly income | `basic.tsx` | `User.monthlyIncome`, `LoanApplication.monthlyIncome` | plaintext | **Restricted** | **Yes (financial)** |
| **PAN card** | `basicpan.tsx` | `User.panNumber` (`schema:62`) **and** `LoanApplication.panNumber` (`schema:171`) | **FULL PAN, PLAINTEXT, duplicated** | **Restricted** | **Yes (financial ID)** |
| Aadhaar | `aadhaar.tsx` (stub) | `User.aadhaarLast4` (`schema:63`) | last-4 only (good) | Restricted | Yes |
| Bank account | `bankv.tsx` (stub) | `Loan.accountLast4` (`schema:265`) | last-4 only (good) | Restricted | Yes (financial) |
| Selfie / face | `selfie.tsx` (stub) | not captured | stub, nothing stored | Restricted | Yes (biometric) |
| Voice / voiceprint | voice widget → Ello | third-party (Ello) | biometric-class, egressed | **Restricted** | **Yes (biometric)** |
| Email, address/pincode | basic / profile | `User.email` / `User.pincode` | plaintext | Confidential | No |
| Credit score | derived | `User.creditScore` (default 750) | plaintext | Restricted | Yes (financial) |
| Passwords | admin / optional | `User.passwordHash`, `AdminUser.passwordHash` | **bcrypt (good)** | Restricted | Yes (password) |
| OTP | auth | `OtpToken.codeHash` | **SHA-256 hashed (good)** | Confidential | Yes |
| Tracking metadata | app events | `ActivityEvent.metadata` (free-form JSON) | unvalidated PII sink | Internal (risk: Restricted leakage) | Possibly |
| Leads (name/phone/city) | website / deep-link | `AnonymousLead`, `ContextSession` | plaintext, never purged | Confidential | No |

---

## 5. Risk Assessment & Treatment (Clauses 6 & 8)

### 5.1 Risk methodology note

Risks are identified from the verified concerns C1–C14 in the audit brief plus asset/threat analysis. Each risk is rated on **Likelihood** (Low/Medium/High) and **Impact** (Low/Medium/High) to yield an **inherent risk rating** on a qualitative 5-point scale (Low / Medium / High / Critical). Impact weighting reflects regulated SPDI, statutory penalties (DPDP up to ₹250 crore; RBI supervisory action), and reputational harm. Risk acceptance criteria: any residual risk of **High or above must be approved by the ISMS Steering Committee**; the target residual for all Restricted-data risks is Medium or lower. Treatment options follow ISO 27005 (modify / retain / avoid / share). Actions map to the brief's **P0–P3** remediation tiers. Residual risk assumes the mapped treatment is implemented.

**Rating matrix (inherent):**

| Likelihood \ Impact | Low | Medium | High |
|---|---|---|---|
| High | Medium | High | Critical |
| Medium | Low | Medium | High |
| Low | Low | Low | Medium |

### 5.2 Risk register (C1–C14)

| Risk ID | Description (evidence) | Asset | Threat | Likelihood | Impact | Inherent | Existing control | Treatment / action (tier) | Residual | Owner | Annex A control(s) | SOC 2 TSC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **R-C1** | PAN stored full & plaintext, duplicated across two tables (`schema.prisma:62`, `:171`); no encryption/tokenization | A-01 | DB compromise / insider → SPDI exposure | Medium | High | **High** | DB access limited to backend; last-4 pattern used for Aadhaar/bank (not PAN) | Tokenize/encrypt PAN, de-duplicate to a single owner column; mask at rest (P1) | Medium | CISO | A.8.11, A.8.24, A.5.34 | CC6.1, CC6.7, C1.1, C1.2 |
| **R-C2** | Live field values incl. PAN sent to third-party voice AI; `sensitive` flag blocks writes only, not reads (`actionRegistry.ts:204`, `screenGraph.ts:207`, `voice/tools.ts:259`) | A-09 | Uncontrolled SPDI egress to processor | Medium | High | **High** | System prompt forbids reading OTP/PAN/Aadhaar aloud (weak) | Redact sensitive values from `page_context`/`read_screen`; consent-gate voice; DPA with Ello (P0/P1) | Medium | DPO | A.5.14, A.8.12, A.5.19, A.5.34 | CC6.7, CC9.2, C1.1, P6.1 |
| **R-C3** | Fixed OTP `123456` accepted in production (`lib/crypto.ts:9-11`; `render.yaml DEMO_LOGIN`; `client.ts:77-84`) | A-02 | Trivial auth bypass / account takeover | High | High | **Critical** | Real OTP path hashed (SHA-256) when bypass disabled | Disable `DEMO_LOGIN` / OTP bypass in prod immediately (P0) | Low | CISO | A.8.5, A.8.2, A.5.15 | CC6.1, CC6.2, CC6.3 |
| **R-C4** | Default super-admin `admin@swiftloan.com / admin123` seeded and shown on login (`seed.ws4.ts:74,82-83`) | A-08 | Full admin takeover of all PII | High | High | **Critical** | bcrypt+JWT admin auth exists (creds are the weakness) | Remove default creds; force rotation; add admin MFA (P0) | Low | CISO | A.5.17, A.5.16, A.8.5 | CC6.1, CC6.2, CC6.3 |
| **R-C5** | Real Ello API key committed in repo (`render.yaml:53`, `website/js/voice-widget.js:17`) | A-07 | Secret disclosure → abuse / cost / pivot | High | High | **Critical** | None (secret in VCS) | Rotate & purge key from history; move to secret manager (P0) | Low | CISO | A.8.24, A.5.14, A.8.4 | CC6.1, CC6.3, CC8.1 |
| **R-C6** | Fail-open JWT/admin secrets — `dev-access`/`dev-refresh` fallbacks; admin secret derived (`config/env.ts:12-13`) | A-07 | Token forgery if env unset in prod | Medium | High | **High** | Real secrets when env set | Fail-closed: refuse to boot without strong secrets (P0) | Low | CISO | A.8.24, A.8.9, A.5.15 | CC6.1, CC7.1, CC8.1 |
| **R-C7** | CORS fully open `cors()`; no per-route rate limiting except auth (`app.ts:27`) | A-02 | CSRF/abuse, credential stuffing, scraping | Medium | Medium | **Medium** | Auth route rate-limited | Strict CORS allow-list; rate-limit/WAF all routes (P1) | Low | Eng Lead | A.8.20, A.8.21, A.8.23, A.8.6 | CC6.6, CC7.1, A1.1 |
| **R-C8** | Unvalidated free-form JSON tracking metadata — PII sink (`tracking.routes.ts:30,67`) | A-11 | Uncontrolled PII accumulation in logs | Medium | Medium | **Medium** | None (schema-free JSON) | Schema-validate; scrub/deny PII in tracking (P2) | Low | Eng Lead | A.8.12, A.8.11, A.5.34 | CC6.7, PI1.1, P4.1, C1.1 |
| **R-C9** | Orphan PII never purged / no retention TTL — `AnonymousLead`, `ContextSession`, `Notification.body`; outside user-delete cascade (`users.routes.ts:91`) | A-01 | Over-retention → DPDP storage-limitation breach | Medium | Medium | **Medium** | Hard user delete with cascade (users only) | Retention TTL + purge jobs incl. orphan PII (P2) | Low | DPO | A.8.10, A.5.34, A.5.37 | C1.2, P4.2, P4.3 |
| **R-C10** | No DSAR beyond user self-delete; no correct/export/erase for leads/context; `AuditLog` never written | A-01 | Data-principal rights non-fulfilment; no accountability | Medium | High | **High** | `Consent`+`AuditLog` models exist (unused); `DELETE /me` works | DSAR APIs (access/correct/export/erase incl. orphans); write AuditLog on PII access (P2) | Medium | DPO | A.5.34, A.8.15, A.5.31 | CC4.1, P5.1, P5.2, P6.5 |
| **R-C11** | Admin tokens in `localStorage` (XSS-exfiltratable) (`admin/src/lib/api.ts:12-22`) | A-08 | XSS → admin session theft | Medium | High | **High** | JWT rotation exists | Move to httpOnly cookies + RBAC (P1) | Medium | Eng Lead | A.8.5, A.8.16, A.8.28 | CC6.1, CC6.6, CC8.1 |
| **R-C12** | No DB encryption-at-rest / residency defined in repo; no DPA with Ello or lenders | A-01, A-09, A-10 | At-rest exposure; localization breach; uncontrolled sharing | Medium | High | **High** | Provider-level controls assumed but undocumented | Encryption-at-rest + encrypted backups in India region; execute DPAs (P1/P2) | Medium | CISO / DPO | A.8.24, A.8.13, A.5.19, A.5.20, A.5.23 | CC6.1, CC9.2, A1.2, C1.1 |
| **R-C13** | Voice transport `ws://`/`http://` cleartext by default (`voice/config.ts`) | A-09 | MITM interception of voice/PII in transit | Medium | High | **High** | iOS ATS + Android cleartext-disabled for app HTTP (not voice ws) | Force `wss://`/`https://` only for voice (P1) | Low | Eng Lead | A.8.24, A.8.20, A.5.14 | CC6.1, CC6.7, C1.1 |
| **R-C14** | No client-side secure input / masking for PAN/Aadhaar fields | A-03 | Shoulder-surf, clipboard/screenshot leakage | Medium | Medium | **Medium** | None | Secure text entry + PAN/Aadhaar masking (P1) | Low | Product Owner | A.8.11, A.8.12, A.7.7 | CC6.7, C1.1, P6.7 |

**Risk summary:** 14 risks — 3 Critical (R-C3, R-C4, R-C5), 7 High, 4 Medium (inherent). After treatment, target residual is Low/Medium across the board, with no residual above Medium.

### 5.3 Risk treatment plan (mapping to remediation tiers)

- **P0 (immediate — Critical/High auth & secrets):** R-C3, R-C4, R-C5, R-C6, and voice redaction of R-C2.
- **P1 (near-term — data protection & transport):** R-C1, R-C2 (DPA), R-C7, R-C11, R-C12 (at-rest/backups), R-C13, R-C14.
- **P2 (privacy operations):** R-C8, R-C9, R-C10, R-C12 (DPAs), governance (RoPA/DPIA/DPO/CERT-In runbook).
- **P3 (assurance):** independent VAPT, ISO 27001 + SOC 2 certification, legal/marketing sign-off.

---

## 6. ISO/IEC 27001:2022 Statement of Applicability (SoA)

Legend — **Status:** Implemented / Partial / Planned. **Applicability:** Yes/No. All 93 Annex A controls are considered; below are the controls material to SwiftLoan (grouped by theme). Controls not listed individually (e.g., most A.7 physical) are inherited from the cloud provider and marked applicable via supplier controls.

### 6.1 A.5 Organizational controls

| Control | Title | Applicable | Justification | Status | SwiftLoan reference / gap |
|---|---|---|---|---|---|
| A.5.1 | Policies for information security | Yes | ISMS requires an approved, communicated policy set | Partial | §3.2 summary; full policy suite to be ratified |
| A.5.2 | Information security roles & responsibilities | Yes | CISO/DPO/Product roles defined | Partial | §3.3; DPO/grievance officer to be formally appointed |
| A.5.7 | Threat intelligence | Yes | Fintech is a high-value target | Planned | Establish CERT-In advisory + dependency-CVE feed monitoring |
| A.5.8 | Information security in project management | Yes | Privacy/security-by-design needed | Partial | Privacy-by-design to be formalized in SDLC |
| A.5.9 | Inventory of information & other assets | Yes | Asset accountability | Partial | §4.1 inventory established |
| A.5.10 | Acceptable use of information & assets | Yes | Staff handle Restricted data | Planned | AUP to be issued |
| A.5.12 | Classification of information | Yes | PII/SPDI must be classified | Implemented | §1.2, §4.2 classification scheme |
| A.5.13 | Labelling of information | Yes | Handling depends on labels | Planned | Data labelling standard to be issued |
| A.5.14 | Information transfer | Yes | PII egresses to Ello/lenders | Partial | R-C2, R-C5, R-C13 open; transfer rules needed |
| A.5.15 | Access control | Yes | Auth to app/admin/DB | Partial | JWT/bcrypt present; R-C3/R-C6 open |
| A.5.16 | Identity management | Yes | User & admin identities | Partial | R-C4 default admin identity to remove |
| A.5.17 | Authentication information | Yes | OTP, passwords, tokens | Partial | bcrypt/SHA-256 good; R-C3/R-C4 open |
| A.5.18 | Access rights | Yes | Provisioning/deprovisioning | Planned | Joiner-mover-leaver process to formalize |
| A.5.19 | Information security in supplier relationships | Yes | Ello, lenders, host | Planned | R-C12 — supplier security policy needed |
| A.5.20 | Addressing security in supplier agreements | Yes | DPAs required | Planned | No DPA with Ello/lenders (R-C12) |
| A.5.21 | Managing ICT supply chain security | Yes | Dependencies, voice AI, host | Planned | Supply-chain controls to define |
| A.5.22 | Monitoring & review of supplier services | Yes | Ongoing supplier assurance | Planned | Supplier review cadence to define |
| A.5.23 | Information security for cloud services | Yes | Hosted on cloud (Render/IaaS) | Partial | R-C12 — residency/encryption to document |
| A.5.24 | Incident management planning & preparation | Yes | Breach obligations (CERT-In/DPDP) | Planned | §9 IR plan drafted; runbook to ratify |
| A.5.25 | Assessment & decision on security events | Yes | Triage/severity | Partial | §9 severity model defined |
| A.5.26 | Response to incidents | Yes | Containment/recovery | Planned | §9 process; to be exercised |
| A.5.27 | Learning from incidents | Yes | Continual improvement | Planned | Post-incident review to formalize |
| A.5.28 | Collection of evidence | Yes | Forensics/regulatory | Planned | Evidence-handling procedure needed |
| A.5.29 | Information security during disruption | Yes | Continuity of DLA service | Planned | BCP/DR to document |
| A.5.30 | ICT readiness for business continuity | Yes | RTO/RPO for API/DB | Planned | DR plan + backup restore tests |
| A.5.31 | Legal, statutory, regulatory & contractual requirements | Yes | DPDP/RBI/CERT-In/IT Act | Partial | §8 mapping established |
| A.5.32 | Intellectual property rights | Yes | Third-party libs/licenses | Partial | License review to formalize |
| A.5.33 | Protection of records | Yes | Audit logs, consent records | Partial | AuditLog model unused (R-C10) |
| A.5.34 | Privacy & protection of PII | Yes | Core to a lending app | Partial | R-C1/C2/C8/C9/C10 open; §10 DSAR |
| A.5.35 | Independent review of information security | Yes | Assurance | Planned | Internal audit + VAPT (P3) |
| A.5.36 | Compliance with policies, rules & standards | Yes | Conformance | Planned | Compliance monitoring to establish |
| A.5.37 | Documented operating procedures | Yes | Ops repeatability | Partial | Runbooks (purge, backup, IR) to write |

### 6.2 A.6 People controls

| Control | Title | Applicable | Justification | Status | Reference / gap |
|---|---|---|---|---|---|
| A.6.1 | Screening | Yes | Staff access Restricted PII | Planned | Background checks to formalize |
| A.6.2 | Terms & conditions of employment | Yes | Security obligations in contracts | Partial | Confidentiality clauses to confirm |
| A.6.3 | Information security awareness, education & training | Yes | Human risk (phishing, secrets) | Planned | Security awareness program to launch |
| A.6.4 | Disciplinary process | Yes | Enforce policy | Planned | To document |
| A.6.5 | Responsibilities after termination | Yes | Revoke access on exit | Planned | Leaver process |
| A.6.6 | Confidentiality / NDA | Yes | Suppliers & staff | Partial | NDAs with Ello to execute |
| A.6.7 | Remote working | Yes | Distributed team | Planned | Remote-work security standard |
| A.6.8 | Information security event reporting | Yes | Early detection | Planned | Reporting channel to publish |

### 6.3 A.7 Physical controls

| Control | Title | Applicable | Justification | Status | Reference / gap |
|---|---|---|---|---|---|
| A.7.1–A.7.14 (secure areas, equipment, media, disposal) | Physical & environmental | Yes (inherited) | Compute/storage in cloud DC | Partial | Inherited from cloud provider; obtain provider ISO 27001/SOC 2 attestations (A.5.23) |
| A.7.7 | Clear desk & clear screen | Yes | PAN/Aadhaar masking on device | Planned | Ties to R-C14 masking |

### 6.4 A.8 Technological controls

| Control | Title | Applicable | Justification | Status | SwiftLoan reference / gap |
|---|---|---|---|---|---|
| A.8.1 | User endpoint devices | Yes | Mobile app on user devices | Partial | ATS enforced; secure input pending (R-C14) |
| A.8.2 | Privileged access rights | Yes | Admin dashboard | Partial | R-C4 default admin; RBAC to add |
| A.8.3 | Information access restriction | Yes | PII access scoping | Partial | Backend-only DB access; row-level scoping to review |
| A.8.4 | Access to source code | Yes | Repo holds secrets/IP | Partial | R-C5 secret in VCS; secret scanning to add |
| A.8.5 | Secure authentication | Yes | OTP/password/token/admin | Partial | bcrypt/SHA-256 good; R-C3/C4/C11; MFA to add |
| A.8.6 | Capacity management | Yes | Availability of API/DB | Planned | Monitoring to define |
| A.8.7 | Protection against malware | Yes | Build/runtime hygiene | Planned | Dependency & image scanning |
| A.8.8 | Management of technical vulnerabilities | Yes | OSS dependencies, CVEs | Planned | SCA/patch cadence + VAPT (P3) |
| A.8.9 | Configuration management | Yes | Env/secrets/deploy config | Partial | R-C6 fail-open config; harden `render.yaml` |
| A.8.10 | Information deletion | Yes | Erasure & retention | Partial | `DELETE /me` cascade good; R-C9 orphans |
| A.8.11 | Data masking | Yes | PAN/Aadhaar/bank | Partial | Aadhaar/bank last-4 good; PAN full (R-C1/C14) |
| A.8.12 | Data leakage prevention | Yes | Voice egress, tracking sink | Partial | R-C2, R-C8 open |
| A.8.13 | Information backup | Yes | DB recoverability | Planned | R-C12 encrypted backups in India region |
| A.8.14 | Redundancy | Yes | Availability | Planned | HA to define |
| A.8.15 | Logging | Yes | Audit & CERT-In 180-day | Partial | AuditLog model unused (R-C10); 180-day retention to enforce |
| A.8.16 | Monitoring activities | Yes | Detect anomalies/XSS | Planned | SIEM/alerting; ties to R-C11 |
| A.8.17 | Clock synchronization | Yes | CERT-In NTP mandate | Planned | Enforce NTP sync on all hosts |
| A.8.18 | Use of privileged utility programs | Yes | Ops tooling | Planned | Restrict/monitor |
| A.8.19 | Installation of software on operational systems | Yes | Deploy control | Partial | CI/CD gate to formalize |
| A.8.20 | Networks security | Yes | API/DB/voice transport | Partial | R-C7 CORS, R-C13 cleartext |
| A.8.21 | Security of network services | Yes | Rate-limit/WAF | Planned | R-C7 — WAF + per-route limits |
| A.8.22 | Segregation of networks | Yes | DB isolation | Planned | Private networking for DB |
| A.8.23 | Web filtering | Yes | Admin/website egress | Planned | To define |
| A.8.24 | Use of cryptography | Yes | Passwords/OTP/PAN/transit | Partial | bcrypt/SHA-256/ATS good; PAN-at-rest, at-rest DB, key mgmt (R-C1/C5/C6/C12/C13) |
| A.8.25 | Secure development life cycle | Yes | In-house app/backend | Partial | SDLC to formalize |
| A.8.26 | Application security requirements | Yes | Auth/session/input | Partial | R-C11 session, R-C8/C14 input |
| A.8.27 | Secure system architecture & engineering principles | Yes | Fail-closed, least priv | Partial | R-C6 fail-open to fix |
| A.8.28 | Secure coding | Yes | Injection/XSS/secrets | Partial | Secret scanning, XSS hardening (R-C5/C11) |
| A.8.29 | Security testing in development & acceptance | Yes | Pre-release gates | Planned | SAST/DAST + VAPT |
| A.8.30 | Outsourced development | No | Development is in-house | N/A | Reassess if outsourced |
| A.8.31 | Separation of dev, test & production | Yes | Demo creds leaked to prod | Partial | R-C3/C4 — enforce env separation |
| A.8.32 | Change management | Yes | Controlled releases | Planned | Change process to document |
| A.8.33 | Test information | Yes | No real PII in test/seed | Partial | Seed exposes creds (R-C4) |
| A.8.34 | Protection of information systems during audit testing | Yes | VAPT safeguards | Planned | Rules of engagement for audits/VAPT |

**SoA coverage:** 55 Annex A controls addressed above across all four themes (A.5, A.6, A.7, A.8), with 1 control (A.8.30) assessed as Not Applicable and justified; the remaining Annex A controls are inherited/physical and covered via A.5.23/A.7.

### 6.5 SOC 2 Trust Services Criteria (TSC) Mapping (companion to the SoA)

This table is the SOC 2 companion to the ISO 27001 SoA above. It covers the **Common Criteria (CC1–CC9)** — which constitute the **Security** category (mandatory in every SOC 2) — plus the additional categories in scope: **Availability (A1)**, **Confidentiality (C1)**, **Processing Integrity (PI1)**, and **Privacy (P1–P8)**. The same SwiftLoan controls satisfy both frameworks; ISO Annex A cross-references are shown to demonstrate the harmonized control set. Status legend: Implemented / Partial / Planned.

**Trust categories in scope:** Security (CC, mandatory) + Confidentiality + Privacy + Availability; Processing Integrity limited to the recommendation/lead-routing flow.

#### Common Criteria (Security)

| TSC | Criterion | Applicable | Current status | SwiftLoan control reference | ISO Annex A cross-ref |
|---|---|---|---|---|---|
| **CC1.1–CC1.5** | Control environment — integrity, board oversight, structure, competence, accountability | Yes | Partial | §3 governance; CISO/DPO/Product roles; ISMS Steering Committee; screening/awareness to formalize | A.5.1–A.5.4, A.6.1–A.6.4 |
| **CC2.1–CC2.3** | Communication & information — internal/external comms of security responsibilities | Yes | Partial | §3.2 policy summary; §2.6 interested parties; staff reporting channel & AUP to publish | A.5.1, A.6.3, A.6.8 |
| **CC3.1–CC3.4** | Risk assessment — objectives, risk identification, fraud, change | Yes | Implemented | §5 risk methodology + register (C1–C14); change-driven reassessment | A.5.31, A.8.8, Clause 6.1 |
| **CC4.1–CC4.2** | Monitoring of controls — ongoing evaluation & deficiency communication | Yes | Planned | §7.4 monitoring; internal audit (§12); AuditLog write-path (R-C10) | A.5.35, A.8.16, Clause 9 |
| **CC5.1–CC5.3** | Control activities — selection, technology controls, policy deployment | Yes | Partial | §6 SoA + §7 control narratives; policy suite to ratify | A.5.1, A.8.* |
| **CC6.1** | Logical & physical access — restrict access to protected assets | Yes | Partial | §7.1 IAM; bcrypt/JWT; R-C3/C4/C6/C11 open | A.5.15, A.8.2–A.8.5 |
| **CC6.2–CC6.3** | Registration, authorization & de-provisioning of access | Yes | Partial | Joiner-mover-leaver to formalize; remove default admin (R-C4) | A.5.16–A.5.18 |
| **CC6.6** | Boundary protection (external threats) | Yes | Partial | R-C7 CORS/rate-limit; WAF to add | A.8.20, A.8.21, A.8.23 |
| **CC6.7** | Transmission & movement of data protected | Yes | Partial | ATS enforced; R-C2/C13 (voice egress/cleartext) open | A.8.24, A.5.14 |
| **CC6.8** | Prevention/detection of unauthorized/malicious software | Yes | Planned | Dependency/image scanning (A.8.7) | A.8.7 |
| **CC7.1–CC7.2** | System operations — vulnerability detection & monitoring | Yes | Planned | §7.7 vuln mgmt; SIEM/alerting; NTP sync (CERT-In) | A.8.8, A.8.15–A.8.17 |
| **CC7.3–CC7.5** | Incident detection, response & recovery | Yes | Planned | §9 IR plan; CERT-In 6-hr; runbook to exercise | A.5.24–A.5.28 |
| **CC8.1** | Change management — authorized, tested, approved changes | Yes | Partial | §7.3 SDLC; dev/test/prod separation (R-C3/C4); change process to document | A.8.31, A.8.32, A.8.25–A.8.29 |
| **CC9.1–CC9.2** | Risk mitigation — business disruption & vendor/partner risk | Yes | Planned | §7.6 supplier security; DPAs with Ello/lenders (R-C12); BCP/DR | A.5.19–A.5.23, A.5.29, A.5.30 |

#### Additional categories in scope

| TSC | Criterion | Applicable | Current status | SwiftLoan control reference | ISO Annex A cross-ref |
|---|---|---|---|---|---|
| **A1.1–A1.3** | Availability — capacity, backup/recovery, environmental resilience | Yes | Planned | §7.8 backup/BC; encrypted backups India region (R-C12); RTO/RPO to define | A.8.6, A.8.13, A.8.14, A.5.30 |
| **C1.1** | Confidentiality — identify & protect confidential information | Yes | Partial | §4 classification; §7.5 masking; PAN plaintext (R-C1), voice egress (R-C2) open | A.5.12, A.8.11, A.8.24 |
| **C1.2** | Confidentiality — retention & disposal of confidential information | Yes | Partial | §11 retention schedule; `DELETE /me` cascade; orphan purge (R-C9) | A.8.10, A.5.37 |
| **PI1.1–PI1.5** | Processing Integrity — complete, valid, accurate, timely processing (lead/recommendation flow) | Yes (limited) | Partial | Input validation to add (R-C8); recommendation logic deterministic; no approval decisions made | A.8.26, A.8.28 |
| **P1.1** | Privacy — notice & communication of privacy practices | Yes | Planned | Privacy policy / in-app notice; publish DPO | A.5.34 |
| **P2.1** | Privacy — choice & consent | Yes | Partial | `Consent` model exists; enforce end-to-end (R-C10); CICRA bureau-pull consent | A.5.34 |
| **P3.1–P3.2** | Privacy — collection (lawful, minimal) | Yes | Partial | Data minimization (Aadhaar/bank last-4 good); PAN over-collection (R-C1) | A.5.34, A.8.11 |
| **P4.1–P4.3** | Privacy — use, retention & disposal | Yes | Partial | Purpose limitation; retention TTL/purge to build (R-C9); scrub tracking (R-C8) | A.8.10, A.5.34 |
| **P5.1–P5.2** | Privacy — access (data-principal access & correction) | Yes | Planned | §10 DSAR access/correction APIs (R-C10) | A.5.34, A.8.15 |
| **P6.1–P6.7** | Privacy — disclosure to third parties & unauthorized disclosure | Yes | Partial | §7.6 supplier/DPAs; voice egress redaction (R-C2); consented lender/bureau share | A.5.14, A.5.19–A.5.23 |
| **P7.1** | Privacy — data quality | Yes | Planned | Correction workflow (§10); accurate lead data to lenders | A.5.34 |
| **P8.1** | Privacy — monitoring & enforcement (complaints/disputes) | Yes | Planned | Grievance Officer process (RBI + DPDP); DSAR SLA tracking | A.5.34, A.8.16 |

**TSC coverage:** all nine Common Criteria series (CC1–CC9) plus Availability (A1), Confidentiality (C1), Processing Integrity (PI1, limited), and all eight Privacy series (P1–P8) are in scope and mapped to SwiftLoan controls and ISO Annex A. No in-scope criterion is excluded; Processing Integrity is scoped to the recommendation/lead flow only (SwiftLoan makes no credit decisions).

---

## 7. Control Domains (Narrative)

### 7.1 Access control & IAM
Customer auth uses phone + OTP (SHA-256 hashed at rest, `schema.prisma:94`) and optional bcrypt passwords (`server/src/lib/crypto.ts:4`). Admin auth is bcrypt + JWT with rotating refresh (`adminAuth.routes.ts`). **Gaps:** fixed OTP `123456` and `DEMO_LOGIN` in prod (R-C3), default super-admin creds (R-C4), fail-open JWT secrets (R-C6), admin tokens in localStorage (R-C11). Target: fail-closed secrets, remove demo bypass, admin MFA + RBAC, httpOnly cookie sessions, joiner-mover-leaver access reviews (A.5.15–A.5.18, A.8.2–A.8.5).

### 7.2 Cryptography & key management
In place: bcrypt (passwords), SHA-256 (OTP/refresh tokens), iOS ATS (`Info.plist:29-35`) and Android cleartext-disabled by default. **Gaps:** PAN plaintext at rest (R-C1), no DB encryption-at-rest documented (R-C12), voice transport cleartext (R-C13), secret committed to VCS (R-C5), fail-open secrets (R-C6). Target: a documented cryptographic policy, envelope encryption / tokenization for PAN, TLS 1.2+ everywhere including `wss://`, at-rest encryption with managed keys (KMS), and secrets in a manager, not the repo (A.8.24).

### 7.3 Secure SDLC
Target state (A.8.25–A.8.29, A.8.31): threat modelling and privacy-by-design at design, secret scanning + SAST + dependency SCA in CI, mandatory code review, strict dev/test/prod separation (the demo-credential leakage R-C3/R-C4 is a separation failure), DAST/pre-release security testing, and independent VAPT before certification (P3).

### 7.4 Logging, monitoring & audit
`AuditLog` and `Consent` models exist in the schema but AuditLog is **not written to** (R-C10). CERT-In requires **180-day log retention** and NTP sync (A.8.17). Target: write AuditLog on every PII access/change, structured masked logging (no PII in logs — fixes R-C8), centralized log retention ≥180 days, time sync, and monitoring/alerting for anomalous admin activity (A.8.15, A.8.16).

### 7.5 Data protection & privacy (encryption, masking, minimization)
Good: Aadhaar (`schema:63`) and bank account (`schema:265`) reduced to last-4; selfie not stored. **Gaps:** PAN full/duplicated (R-C1), no client masking/secure input (R-C14), tracking free-form PII sink (R-C8), orphan PII never purged (R-C9). Target: minimize collection, mask PAN/Aadhaar on screen and at rest, validate & scrub tracking metadata, and enforce purpose limitation and storage limitation (A.8.11, A.8.12, A.5.34).

### 7.6 Third-party / supplier security (Ello, lenders — DPAs)
The Ello/Getello voice AI receives live field values including PAN (R-C2) and its API key was committed (R-C5); no DPA exists with Ello or the partner lenders (R-C12). Target (A.5.19–A.5.23): execute DPAs with Ello (sub-processor, purpose-limited, India residency, deletion, breach-notice terms), data-sharing agreements with lenders/bureaus gated on consent, supplier security assessments, and ongoing supplier review. Redact SPDI from voice context and consent-gate the assistant.

### 7.7 Vulnerability & patch management
Target state (A.8.8): software composition analysis on the RN/Node/Next dependency trees, a defined patch SLA by severity, container/image scanning, and periodic independent VAPT (P3) with tracked remediation.

### 7.8 Backup & business continuity
**Gap:** no documented encrypted backups, residency, or DR (R-C12) and no BCP/DR (A.5.29, A.5.30). Target: automated encrypted backups stored in an India region, periodic restore tests, defined RTO/RPO for the API/DB, and an availability plan for the DLA service.

---

## 8. Regulatory Compliance Mapping

| Regulation | Key obligation | SwiftLoan control / status | Gap / risk ref | SOC 2 TSC |
|---|---|---|---|---|
| **DPDP Act 2023** | Consent, purpose limitation, data-principal rights, security safeguards, breach notice, storage limitation | `Consent` model exists; `DELETE /me` erasure; classification (§4) | Consent not enforced end-to-end; no full DSAR (R-C10); orphan over-retention (R-C9); PAN unencrypted (R-C1) | P1–P8, C1.1–C1.2, CC6.1 |
| **RBI Digital Lending Guidelines 2022** | Data minimization, localization, no biometric storage, KFS, direct disbursal, grievance redressal, LSP/DLA transparency | Aadhaar/bank last-4; selfie not stored; LSP posture documented | Voice biometric egress (R-C2); residency undocumented (R-C12); DPO/grievance officer to appoint; KFS to confirm | P3.1–P3.2, P6.1, C1.1, CC9.2 |
| **RBI Master Direction – KYC / CKYC** | Aadhaar masking, consented KYC, no core-biometric storage | Aadhaar last-4 only; KYC screens are demo stubs | Production KYC/CKYC integration pending; consent gating (CICRA) | P2.1, P3.1, CC6.7 |
| **CICRA 2005** | Explicit consent before credit-bureau pull | `Consent.soft_pull` model exists | Consent not checked before partner/CIBIL share (R-C10) | P2.1, P6.1 |
| **CERT-In Directions 2022** | 6-hour incident reporting, 180-day log retention, NTP sync | §9 IR plan drafted | AuditLog unused (R-C10); 180-day retention & NTP to enforce (A.8.15/A.8.17) | CC7.2–CC7.4, CC4.1 |
| **IT Act 2000 §43A + SPDI Rules 2011** | Reasonable security for financial data, passwords, biometrics | bcrypt passwords; SHA-256 OTP; SPDI classified (§4.2) | PAN/income plaintext (R-C1); voiceprint egress (R-C2) | CC6.1, CC6.7, C1.1 |
| **Aadhaar Act** | Masking; no core-biometric storage | Aadhaar last-4 only (good) | Maintain — do not expand storage | P3.1, C1.1 |
| **ISO/IEC 27701:2019** (privacy extension) | PIMS on top of ISMS; PII controller/processor controls | §4 classification, §10 DSAR, §11 retention align | Formal PIMS mapping to follow ISO 27001 certification | P1–P8 |
| **ISO/IEC 27017 / 27018** (cloud / PII in cloud) | Cloud & cloud-PII controls | A.5.23 supplier/cloud controls | Obtain provider attestations; document residency | CC9.2, A1.2, P6.1 |
| **AICPA SOC 2 (Trust Services Criteria)** | Security (CC1–CC9) + Confidentiality + Privacy + Availability; operating effectiveness over the review period (Type II) | §6.5 TSC mapping; harmonized with ISO controls | Type II needs 3–12 months of evidence; open risks (C1–C14) to remediate before observation window | All in-scope CC/A1/C1/PI1/P1–P8 |

> **SOC 2 Type II** and **PCI-DSS** are assurance targets (P3). PCI-DSS applies only if card data is handled — SwiftLoan does not currently store card PANs (bank account reduced to last-4).

---

## 9. Incident Response & Breach Notification

### 9.1 Severity levels

| Severity | Definition | Example | Target response |
|---|---|---|---|
| **SEV-1 Critical** | Confirmed breach of Restricted PII/SPDI or full admin compromise | PAN/Aadhaar exfiltration; R-C3/R-C4 exploited | Immediate; CERT-In clock starts |
| **SEV-2 High** | Likely compromise / significant exposure | Committed key abused (R-C5) | < 1 hour triage |
| **SEV-3 Medium** | Contained security event, no confirmed data loss | Anomalous admin login blocked | Same business day |
| **SEV-4 Low** | Policy deviation / near-miss | Misconfig caught in review | Routine |

### 9.2 Process (A.5.24–A.5.28)

1. **Detect & report** — via monitoring/alerting or the staff reporting channel (A.6.8).
2. **Triage & classify** — assign severity; DPO + CISO engaged for any PII-involving event.
3. **Contain** — revoke tokens/keys, isolate affected services, rotate secrets.
4. **Eradicate & recover** — patch root cause, restore from clean encrypted backup.
5. **Notify (regulatory):**
   - **CERT-In: report within 6 hours** of becoming aware (Directions 2022).
   - **DPDP: notify the Data Protection Board of India and affected data principals** without undue delay per the Act/rules.
   - **RBI (via lenders):** inform partner lenders per DPA/agreement for breaches touching their data.
6. **Evidence & forensics** — preserve logs/artifacts (A.5.28); AuditLog and 180-day logs are key evidence.
7. **Post-incident review** — root-cause, lessons learned, corrective action (A.5.27) fed into the risk register.

> **Dependency:** meaningful detection and evidence require the logging gaps (R-C10, A.8.15) to be closed. This is a P2 priority and a management-review item.

---

## 10. Data-Subject / Data-Principal Rights (DSAR) Procedures

Under the DPDP Act 2023, data principals may exercise the rights below. Requests are received via the in-app grievance channel / published DPO contact, identity-verified, logged in AuditLog, and fulfilled within the statutory timeframe.

| Right | How SwiftLoan fulfils it | Current state | Target |
|---|---|---|---|
| **Access** (right to information) | Export of all PII held about the principal | Not implemented (R-C10) | DSAR "export" API covering User + LoanApplication + leads/context |
| **Correction** | Update inaccurate PII | Profile edit exists for some fields | Full correction API incl. name/DOB/contact |
| **Erasure** | Delete personal data | `DELETE /me` cascade (`users.routes.ts:91`) — good for users | Extend erasure to orphan PII (AnonymousLead, ContextSession, Notification.body) — R-C9 |
| **Portability** | Machine-readable export | Not implemented | Structured JSON export via DSAR API |
| **Consent withdrawal** | Stop processing / sharing | `Consent` model exists but not enforced | Enforce consent checks before partner/CIBIL share; honour withdrawal (CICRA/DPDP) |
| **Grievance / nominate** | Escalate to Grievance Officer | Officer not yet appointed/published | Appoint & publish DPO/Grievance Officer (RBI + DPDP) |

Every DSAR action must write to **AuditLog** (A.5.33, A.8.15) to evidence accountability.

---

## 11. Data Retention & Disposal Schedule

Retention balances RBI/lending record requirements, CERT-In log retention, and DPDP storage-limitation. Disposal is by secure deletion (A.8.10); backups age out on their own encrypted cycle.

| Data type | Retention period | Trigger | Disposal method | Ref |
|---|---|---|---|---|
| Active user PII (name, phone, DOB, email, pincode) | Life of relationship + regulatory minimum | Account closure / erasure request | Cascade hard-delete (`DELETE /me`) | R-C9 |
| PAN / income / financial SPDI | Per RBI/lender record-keeping (typ. up to 8 yrs for lending records), else erase | Loan closure + statutory period | Secure delete of encrypted record | R-C1 |
| Aadhaar last-4 / bank last-4 | Same as loan record | Loan closure + statutory period | Secure delete | — |
| Voiceprint / voice session data | Minimal; delete after session unless consented | Session end | Delete at Ello + local (per DPA) | R-C2 |
| **Anonymous leads / ContextSession** | Short TTL (e.g., 30–90 days if not converted) | TTL expiry | **Automated purge job (to build)** | R-C9 |
| Notifications (`Notification.body`) | Short TTL | TTL expiry | Automated purge | R-C9 |
| Tracking / ActivityEvent metadata | Analytics-minimal, PII-scrubbed | TTL expiry | Purge; scrub PII on ingest | R-C8 |
| **Audit logs** | **≥ 180 days (CERT-In)** | Age-out after retention | Archived then deleted | A.8.15 |
| Consent records | Life of relationship + statutory period | Account closure + period | Secure delete | A.5.33 |
| Backups | Defined cycle, encrypted, India region | Rotation | Cryptographic erasure | R-C12 |

> **Gap:** no retention TTL or purge jobs exist today (R-C9). Building them is a P2 priority.

---

## 12. ISO 27001 Audit-Readiness Checklist (Clauses 4–10)

Mandatory ISMS documented information and management-system requirements:

| # | Clause | Mandatory item | Status | Notes / owner |
|---|---|---|---|---|
| 1 | 4.3 | ISMS scope (documented) | **Done** | §2.3–2.4 this document |
| 2 | 4.1 / 4.2 | Context & interested parties | **Done** | §2.5–2.6 |
| 3 | 5.2 | Information security policy | **Partial** | §3.2 summary; full policy suite to ratify — CISO |
| 4 | 5.3 | Roles, responsibilities & authorities | **Partial** | §3.3; formally appoint DPO/Grievance Officer |
| 5 | 6.1.2 | Risk assessment process | **Done** | §5.1 methodology |
| 6 | 6.1.2 | Risk assessment results (risk register) | **Done** | §5.2 (14 risks C1–C14) |
| 7 | 6.1.3 | Risk treatment plan | **Partial** | §5.3; execution P0–P3 in progress |
| 8 | 6.1.3 d) | Statement of Applicability (SoA) | **Done** | §6 (55 controls, 1 N/A justified) |
| 9 | 6.2 | Information security objectives | **Partial** | Objectives set (below); metrics to baseline |
| 10 | 7.2 | Competence (records) | **Planned** | Training records — HR/CISO |
| 11 | 7.3 | Awareness | **Planned** | Awareness program (A.6.3) |
| 12 | 7.5 | Documented information control | **Partial** | This doc set under version control |
| 13 | 8.1 | Operational planning & control | **Partial** | Runbooks (purge/backup/IR) to write |
| 14 | 8.2 / 8.3 | Risk assessment & treatment operation | **In progress** | P0 items prioritized |
| 15 | 9.1 | Monitoring, measurement, analysis & evaluation | **Planned** | KPIs/metrics to define |
| 16 | 9.2 | Internal audit (program + results) | **Planned** | Internal audit program to establish |
| 17 | 9.3 | Management review (records) | **Planned** | First management review to schedule |
| 18 | 10.1 | Nonconformity & corrective action | **Planned** | CAPA register to open |
| 19 | 10.2 | Continual improvement | **Planned** | Fed by incidents & audits |

**ISMS objectives (Clause 6.2), initial set:** (a) close all P0 risks (R-C3/C4/C5/C6, voice redaction) within 30 days; (b) encrypt/tokenize PAN and de-duplicate within 90 days; (c) implement DSAR + AuditLog write-path within 120 days; (d) execute DPAs with Ello and partner lenders before go-live; (e) achieve zero secrets in version control and enforce fail-closed configuration.

### 12.1 SOC 2 audit-readiness track

The SOC 2 examination reuses the ISMS control set. The following items are specific to a SOC 2 attestation and run in parallel with the ISO 27001 program.

| # | SOC 2 readiness item | Status | Notes / owner |
|---|---|---|---|
| S1 | **Trust categories in scope defined** | **Done** | Security (CC, mandatory) + Confidentiality + Privacy + Availability; Processing Integrity limited to lead/recommendation flow (§2.4, §6.5) |
| S2 | System description (Section III of the SOC 2 report) | Partial | Boundary aligned to ISMS scope (§2.3–2.4); narrative to draft with service auditor |
| S3 | **Gap assessment against the TSC** | **Done** | §6.5 TSC mapping records Implemented/Partial/Planned per criterion; open items tie to R-C1–R-C14 |
| S4 | Control matrix mapping controls → TSC points of focus | **Done** | §6.5 (CC1–CC9, A1, C1, PI1, P1–P8) with ISO Annex A cross-refs |
| S5 | Remediate open risks before observation window | In progress | P0/P1 risks (C1–C14) must be closed and operating before Type II period starts |
| S6 | **Type I vs Type II decision** | Decision pending | **Type I** = design of controls at a point in time (faster, suits current state); **Type II** = design **and operating effectiveness** over a review period |
| S7 | **Type II observation period** | Planned | **Type II requires 3–12 months of operating-effectiveness evidence** (control runs, tickets, logs, access reviews). Recommended path: remediate → Type I → begin a 6-month Type II window |
| S8 | Evidence collection & control-operation logging | Planned | Depends on AuditLog write-path (R-C10) and 180-day logging (A.8.15); ties to CC4.1/CC7.2 |
| S9 | Vendor/sub-processor management (CC9.2) | Planned | DPAs + SOC 2 reports from Ello and hosting provider (R-C12) |
| S10 | Management assertion & readiness review | Planned | Management assertion letter; independent readiness assessment before the formal exam |

**Recommendation:** given the open Critical/High risks (R-C3/C4/C5), pursue **SOC 2 Type I first** (design assessment) after P0 remediation, then run a **6-month Type II observation window**. Do not begin the Type II period until P0 and the P1 data-protection controls are implemented and operating, so the evidence reflects effective controls.

---

## 13. Audit Trail of Verified Findings (Evidence — C1–C14)

Each finding below is verified against the codebase with file:line references (source: audit brief §5) and maps to the corresponding risk in §5.2.

| ID | Finding | Evidence (file:line) | Risk | Priority |
|---|---|---|---|---|
| C1 | PAN plaintext & duplicated | `schema.prisma:62`, `:171` | R-C1 | P1 |
| C2 | Sensitive values leak to third-party voice AI | `src/voice/actionRegistry.ts:204`, `screenGraph.ts:207`, `voice/tools.ts:259` | R-C2 | P0/P1 |
| C3 | Fixed OTP `123456` accepted in production | `lib/crypto.ts:9-11`; `render.yaml` `DEMO_LOGIN`; `src/api/client.ts:77-84` | R-C3 | P0 |
| C4 | Default super-admin `admin@swiftloan.com / admin123` seeded & shown | `seed.ws4.ts:74,82-83` | R-C4 | P0 |
| C5 | Real Ello API key committed | `render.yaml:53`, `website/js/voice-widget.js:17` | R-C5 | P0 |
| C6 | Fail-open JWT/admin secrets (`dev-access`/`dev-refresh`) | `config/env.ts:12-13` | R-C6 | P0 |
| C7 | CORS fully open; no per-route rate limiting except auth | `app.ts:27` | R-C7 | P1 |
| C8 | Unvalidated tracking metadata (free-form JSON PII sink) | `tracking.routes.ts:30,67` | R-C8 | P2 |
| C9 | Orphan PII never purged / no retention TTL | `AnonymousLead`, `ContextSession`, `Notification.body`; outside `users.routes.ts:91` cascade | R-C9 | P2 |
| C10 | No DSAR beyond user self-delete; AuditLog never written | (schema models present, unused) | R-C10 | P2 |
| C11 | Admin tokens in localStorage (XSS-exfiltratable) | `admin/src/lib/api.ts:12-22` | R-C11 | P1 |
| C12 | No DB encryption-at-rest / residency; no DPA with Ello or lenders | (repo-wide; config) | R-C12 | P1/P2 |
| C13 | Voice transport `ws://`/`http://` cleartext by default | `voice/config.ts` | R-C13 | P1 |
| C14 | No client-side secure input / masking for PAN/Aadhaar | (client input fields) | R-C14 | P1 |

### 13.1 Controls verified as already present (evidence — do not regress)

- Passwords bcrypt — `server/src/lib/crypto.ts:4`.
- OTP & refresh tokens hashed before storage — `schema.prisma:94`, `:107`.
- Aadhaar & bank account reduced to last-4 — `schema.prisma:63`, `:265`.
- iOS ATS enforced (`NSAllowsArbitraryLoads=false`) — `ios/SwiftLoan/Info.plist:29-35`.
- Android release disallows cleartext (RN gradle default).
- Hard user delete with cascade — `server/src/modules/users.routes.ts:91`.
- `Consent` and `AuditLog` models present in schema (AuditLog not yet written).
- Voice system prompt forbids reading OTP/PAN/Aadhaar aloud.
- Admin backend auth real: bcrypt + JWT + rotating refresh — `adminAuth.routes.ts`.

---

*End of document — SWL-ISMS-03 v1.0. Classification: Restricted.*

# SwiftLoan — Product Requirements Document (PRD)

**Classification: CONFIDENTIAL**
_Prepared for ISO/IEC 27001:2022 ISMS documentation and compliance audit._

---

## 1. Document control

| Field | Value |
|---|---|
| Document title | SwiftLoan — Product Requirements Document |
| Document ID | SL-PRD-001 |
| Version | 1.0 |
| Date | 2026-08-04 |
| Status | Approved for Audit Review |
| Owner | Product Management, SwiftLoan |
| Author | Product & Compliance Working Group |
| Classification | Confidential |
| Distribution | Product, Engineering, Security/ISMS, Legal & Compliance, Internal Audit |

### 1.1 Reviewers & approvers

| Role | Responsibility | Approval |
|---|---|---|
| Head of Product | Functional scope & prioritisation | Required |
| Chief Information Security Officer (CISO) | Security & ISMS alignment | Required |
| Data Protection Officer (DPO) | DPDP Act 2023 & privacy | Required |
| Head of Engineering | Technical feasibility | Required |
| Legal & Compliance Lead | RBI / DPDP / CERT-In regime | Required |
| Internal Audit | ISO 27001 audit readiness | Advisory |

### 1.2 Revision history

| Version | Date | Author | Summary of change |
|---|---|---|---|
| 0.1 | 2026-07-20 | Product WG | Initial outline, scope draft |
| 0.5 | 2026-07-28 | Product & Security WG | Functional + non-functional requirements populated |
| 0.9 | 2026-08-01 | Compliance WG | Security/privacy/compliance section and traceability added |
| 1.0 | 2026-08-04 | Product & Compliance WG | Baselined for ISO 27001 audit |

### 1.3 Classification handling

This document is classified **Confidential**. It describes product design, a Personally Identifiable Information (PII) inventory, and known control gaps. It must be stored in access-controlled repositories, shared on a need-to-know basis, and handled per the SwiftLoan Information Classification Policy (ISO/IEC 27001:2022 control A.5.12 — Classification of information, A.5.13 — Labelling).

---

## 2. Introduction

### 2.1 Purpose

This Product Requirements Document (PRD) defines the vision, scope, functional and non-functional requirements, and — critically for the current audit — the **security, privacy, and regulatory compliance requirements** for the SwiftLoan platform. It is a controlled ISMS document intended to:

- establish an agreed, authoritative baseline of *what the product must do*;
- make explicit the requirements that the product must satisfy to protect personal and sensitive personal data;
- provide traceability from each security/privacy requirement to the applicable ISO/IEC 27001:2022 Annex A control and the governing Indian law; and
- support the Statement of Applicability (SoA) and the ISO 27001 certification audit.

Where this document records requirements that are **not yet fully implemented**, those are stated as target requirements with an implementation-status flag, so that the ISMS risk register and remediation plan can be tracked against them. This PRD does not overstate the product's current posture.

### 2.2 Scope of this document

This PRD covers the SwiftLoan mobile application (React Native, iOS + Android), its Node/Express/Prisma/PostgreSQL backend, the Next.js admin dashboard, the marketing website, and integrations with the third-party voice AI assistant ("Ruby", provided by Ello/Getello) and downstream RBI-regulated lending partners. It does not restate detailed system design (see the Technical Architecture Document, SL-TAD-001) or test coverage (see the Test Cases document, SL-TC-001), but it is the parent requirements document those derive from.

### 2.3 Intended audience

| Audience | Uses this document to |
|---|---|
| Product managers | Confirm scope, priorities, and acceptance criteria |
| Engineers & architects | Derive design and implementation from requirements |
| Security / ISMS team | Confirm control coverage and SoA linkage |
| DPO / privacy team | Confirm DPDP Act and RBI privacy obligations are captured |
| Legal & compliance | Confirm regulatory-regime coverage |
| Auditors (internal & external) | Assess requirement completeness and traceability |
| QA | Derive test cases from acceptance criteria |

### 2.4 Definitions & acronyms

| Term | Definition |
|---|---|
| **LSP** | Lending Service Provider — an agent engaged by a regulated lender to source/service loans on the lender's behalf, per the RBI Digital Lending Guidelines. |
| **DLA** | Digital Lending App — the mobile/web application through which a digital loan journey is conducted. |
| **RE** | Regulated Entity — a bank or NBFC regulated by the Reserve Bank of India (RBI). SwiftLoan's lending partners are REs. |
| **PII** | Personally Identifiable Information — data that identifies or can identify a natural person. |
| **SPDI** | Sensitive Personal Data or Information — per IT Act §43A + SPDI Rules 2011 (financial data, passwords, biometrics, etc.). |
| **KYC** | Know Your Customer — regulatory identity verification (RBI Master Direction – KYC). |
| **CKYC** | Central KYC Registry — centralised KYC record repository (CERSAI). |
| **DPDP** | Digital Personal Data Protection Act, 2023 (India). |
| **ISMS** | Information Security Management System — the ISO/IEC 27001 governance framework. |
| **DSAR** | Data Subject Access Request / Data Principal rights request (access, correction, erasure, portability). |
| **Data Principal** | The individual to whom personal data relates (DPDP Act term; equivalent to "data subject"). |
| **Data Fiduciary** | The entity determining the purpose and means of processing personal data (DPDP Act term). |
| **Data Processor** | An entity processing personal data on behalf of a Data Fiduciary. |
| **KFS** | Key Fact Statement — mandatory standardised loan disclosure under RBI Digital Lending Guidelines. |
| **PAN** | Permanent Account Number — Indian tax identity number; SPDI-class financial identifier. |
| **Aadhaar** | Indian 12-digit unique identity number issued by UIDAI. |
| **VAPT** | Vulnerability Assessment & Penetration Testing. |
| **RoPA / DPIA** | Record of Processing Activities / Data Protection Impact Assessment. |
| **SoA** | Statement of Applicability (ISO 27001). |
| **MoSCoW** | Prioritisation scheme: Must / Should / Could / Won't (this release). |

### 2.5 References

1. `_AUDIT_BRIEF.md` — SwiftLoan Verified Fact Base (internal source of truth).
2. SwiftLoan Technical Architecture Document (SL-TAD-001).
3. SwiftLoan Security & Compliance Document (SL-SEC-001).
4. SwiftLoan Test Cases (SL-TC-001).
5. ISO/IEC 27001:2022 — Information security management systems — Requirements.
6. ISO/IEC 27002:2022 — Information security controls.
7. ISO/IEC 27701:2019 — Privacy Information Management (PIMS extension).
8. ISO/IEC 27017:2015 / 27018:2019 — Cloud security / PII in public cloud.
8a. AICPA Trust Services Criteria (TSC 2017, rev. 2022) — SOC 2 Security, Availability, Confidentiality, Processing Integrity, and Privacy.
9. Digital Personal Data Protection Act, 2023 (India).
10. RBI Guidelines on Digital Lending, 2022 (and subsequent Master Directions).
11. RBI Master Direction — Know Your Customer (KYC).
12. CERT-In Directions, 6 April 2022 (incident reporting & log retention).
13. IT Act 2000 §43A & SPDI Rules 2011; Aadhaar Act 2016; CICRA 2005.

---

## 3. Product overview

### 3.1 Vision

SwiftLoan aims to be the fastest, most trustworthy way for an Indian consumer to discover and compare the loan products they are genuinely eligible for, and to be handed off cleanly to a regulated lender to complete the loan — with a mobile-first, multilingual, voice-assisted experience that treats the borrower's data with bank-grade care.

### 3.2 Regulatory positioning (fundamental to the product)

SwiftLoan operates as a **Lending Service Provider (LSP)** running a **Digital Lending App (DLA)** *on behalf of RBI-regulated lenders* (banks and NBFCs). This positioning is a hard product constraint:

- SwiftLoan **does not lend from its own book** and does not make or communicate credit-approval decisions. Approval, underwriting, and disbursal are the RE's responsibility.
- Loan disbursal must flow **directly from the RE to the borrower's bank account** — funds must not pass through SwiftLoan/LSP accounts (RBI Digital Lending Guidelines).
- SwiftLoan must present a **Key Fact Statement (KFS)** and disclose the LSP/RE relationship and partner identity transparently.
- SwiftLoan may collect only the data needed to originate and service the loan (data minimisation) and must obtain explicit, purpose-bound consent before any bureau pull or partner data-share.

Understanding this positioning is essential to reading the requirements below: SwiftLoan is a **data-collection, matching, and handoff** platform, not a lender.

### 3.3 Target users & personas

| Persona | Description | Primary goals |
|---|---|---|
| **Borrower (primary)** | Indian retail consumer, mobile-first, often more comfortable in a regional language or "Hinglish/Tenglish"; seeking a personal/business/education/vehicle/home loan. | Quickly see loans they qualify for, understand EMIs, complete a trustworthy application, get funds fast. |
| **Admin / Operations user** | Internal SwiftLoan staff (super-admin, admin, analyst) monitoring onboarding funnels, loan pipelines, leads, downloads, and system notifications via the admin dashboard. | Track conversion, spot stalled journeys, manage leads, view analytics. |
| **Regulated lending partner (external actor)** | Bank/NBFC receiving qualified, consented applicants. | Receive clean, consented, KYC-ready applicants. |
| **Data Principal (regulatory lens)** | The borrower in their capacity as the subject of personal data with DPDP rights. | Exercise consent, access, correction, and erasure rights. |

### 3.4 Value proposition

- **For borrowers:** one place to discover real, eligibility-matched offers; transparent EMI math; a guided, voice-assisted, multilingual journey; direct, regulated disbursal.
- **For lending partners:** pre-qualified, consented, funnel-tracked applicants with reduced acquisition cost.
- **For SwiftLoan:** an LSP marketplace with strong attribution/analytics and a defensible, compliance-first data posture.

### 3.5 Market

India retail-credit market, digital-first. Regulatory environment is defined by the RBI Digital Lending framework, the DPDP Act 2023, RBI KYC/CKYC directions, and CERT-In. Localisation across English, Hindi, Telugu, and colloquial Hinglish/Tenglish is a market differentiator.

---

## 4. Scope

### 4.1 In scope

- Language selection and multilingual UX (en/hi/te/hinglish/tenglish).
- Phone + OTP onboarding and authentication; anonymous/guest sessions.
- Profile capture ("About You": name, DOB, gender) and profile management.
- EMI calculator ("Fare").
- Loan application funnel: basic details → PAN capture → prequalification ("finding") → offers → secure handoff to lender.
- KYC/verification flow *(see status note in §4.2)*.
- Voice AI assistant "Ruby" (third-party Ello/Getello) for in-app guidance and navigation.
- Loan servicing surfaces: status, disbursed, repayment schedule, credit score, help/grievance.
- Marketing website with lead capture and context-aware install handoff.
- Admin dashboard: users, leads, loans, onboarding funnels, downloads, analytics, notifications.
- Activity/session tracking layer.

### 4.2 Explicitly out of scope (this release)

- **KYC document verification is NOT production-functional.** The KYC screens — Aadhaar (`aadhaar.tsx`), PAN verify (`panv.tsx`), bank verify (`bankv.tsx`), and selfie (`selfie.tsx`) — are **demo/UI stubs**. They do not perform real UIDAI/NSDL/penny-drop/liveness verification, and the selfie screen captures/stores nothing. Production KYC integration with licensed KYC providers and CKYC is a future release and is a prerequisite for real lending traffic.
- **SwiftLoan does not lend, underwrite, or disburse.** All credit decisions and fund transfers are the regulated lender's.
- **No card/payment-instrument handling** in this release (PCI-DSS therefore not currently in scope; to be reassessed if card data is ever introduced).
- Voiceprint/biometric *storage* — biometrics must never be stored (see §7).
- Non-India markets and non-supported languages.

---

## 5. Functional requirements

Requirements are grouped by module and uniquely numbered `FR-<module>-<n>`. Priority uses MoSCoW. "Status" reflects current implementation per the verified fact base; target requirements not yet met are flagged accordingly.

### 5.1 Onboarding & authentication (FR-AUTH)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-AUTH-1 | The app SHALL let a user select a language (en/hi/te/hinglish/tenglish) before onboarding and persist the choice to their profile (`User.lang`). | Must | Implemented |
| FR-AUTH-2 | The app SHALL authenticate borrowers via phone number + one-time password (OTP) delivered to that number. | Must | Implemented |
| FR-AUTH-3 | OTPs SHALL be single-use, time-expiring, and stored only as a hash (`OtpToken.codeHash`, SHA-256), never in plaintext. | Must | Implemented |
| FR-AUTH-4 | The system SHALL issue a short-lived JWT access token and a rotating refresh token; refresh tokens SHALL be stored hashed (`RefreshToken.tokenHash`) and be revocable. | Must | Implemented |
| FR-AUTH-5 | The app SHALL support an anonymous/guest session ("Skip") that can later be upgraded to an authenticated user. | Should | Implemented |
| FR-AUTH-6 | The system SHALL NOT accept any fixed/hard-coded OTP (e.g., `123456`) or demo-login bypass in production builds. | Must | **Target — gap C3; remediation P0** |
| FR-AUTH-7 | OTP verification SHALL be rate-limited and locked out after repeated failures to resist brute force. | Must | Partially (auth rate-limit present) |

### 5.2 Profile & "About You" (FR-PROF)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-PROF-1 | The app SHALL collect first/last/full name, date of birth, and gender during onboarding ("About You"). | Must | Implemented |
| FR-PROF-2 | The app SHALL let a user view and edit profile details, language, and notification preferences (loan updates, security alerts, promotional offers). | Must | Implemented |
| FR-PROF-3 | The app SHALL let a user permanently delete their account, cascading to their applications, loans, KYC, consents, OTPs, and sessions (`DELETE /me`). | Must | Implemented |
| FR-PROF-4 | Only the minimum profile data necessary for loan origination SHALL be collected (data minimisation). | Must | Should be re-verified against §7 |
| FR-PROF-5 | DOB SHOULD be reducible to the minimum precision needed (e.g., age band) where full DOB is not strictly required. | Could | Target |

### 5.3 EMI calculator ("Fare") (FR-EMI)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-EMI-1 | The app SHALL provide an EMI calculator that computes monthly instalment from principal, tenure, and interest rate, formatted in Indian currency (₹/lakh conventions). | Must | Implemented |
| FR-EMI-2 | The calculator SHALL operate without requiring PII and without server round-trips for the core computation. | Should | Implemented |
| FR-EMI-3 | Displayed rates/EMIs used for actual offers SHALL be clearly marked as indicative until confirmed by the lender's KFS. | Must | Target (disclosure) |

### 5.4 Loan application funnel (FR-FUNNEL)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-FUNNEL-1 | The app SHALL capture "basic" applicant details: name, DOB, monthly income, employment type, and pincode; creating a `LoanApplication` (status `draft`). | Must | Implemented |
| FR-FUNNEL-2 | The app SHALL capture the applicant's PAN in a dedicated step ("Basic PAN"), advancing the application to `pan_pending`. | Must | Implemented |
| FR-FUNNEL-3 | PAN SHALL be captured, transmitted, and stored securely (encrypted/tokenised) and SHALL NOT be duplicated across records. | Must | **Target — gap C1 (currently full PAN, plaintext, duplicated in `User.panNumber` and `LoanApplication.panNumber`); remediation P1** |
| FR-FUNNEL-4 | The system SHALL perform prequalification ("finding") and present eligibility-matched offers from lender partners, including EMI, APR, tenure, processing fee, and a recommended flag. | Must | Implemented |
| FR-FUNNEL-5 | Before any credit-bureau soft pull or sharing of applicant data with a lender partner, the system SHALL obtain and record explicit, purpose-specific consent (`Consent` of type `soft_pull` / `data_sharing`) and SHALL verify it server-side. | Must | **Target — consent model exists but is not yet enforced end-to-end (gap C10 area); remediation P1** |
| FR-FUNNEL-6 | The system SHALL execute a **secure handoff** to the selected regulated lender, and SHALL present a Key Fact Statement and disclose the partner identity before handoff. | Must | Handoff implemented; KFS disclosure = Target |
| FR-FUNNEL-7 | Loan disbursal SHALL be represented as flowing directly from the RE to the borrower; SwiftLoan SHALL NOT act as a fund conduit. | Must | Implemented (representational) |
| FR-FUNNEL-8 | The funnel SHALL degrade gracefully to design/demo data for guest/offline sessions without exposing another user's data. | Should | Implemented |

### 5.5 KYC / verification (FR-KYC)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-KYC-1 | The app SHALL provide a KYC flow offering Aadhaar, PAN, bank-account, and selfie verification methods (`KycVerification`). | Must | UI implemented; verification is **demo stub (out of scope this release, §4.2)** |
| FR-KYC-2 | Production KYC SHALL integrate licensed verification (UIDAI/Aadhaar with masking, NSDL PAN, penny-drop bank, liveness selfie) and SHALL support CKYC. | Must | **Target — future release** |
| FR-KYC-3 | Aadhaar SHALL be stored as **last-4 digits only**; the full Aadhaar number and core biometrics SHALL NEVER be stored (`User.aadhaarLast4`). | Must | Implemented |
| FR-KYC-4 | Bank account numbers SHALL be stored as **last-4 digits only** (`Loan.accountLast4`). | Must | Implemented |
| FR-KYC-5 | Selfie/face and any biometric data SHALL NOT be persisted; liveness results SHALL be stored as pass/fail references only. | Must | Implemented (nothing stored) |
| FR-KYC-6 | KYC document references SHALL be stored masked (`KycVerification.reference`). | Must | Implemented (schema supports) |

### 5.6 Voice assistant "Ruby" (FR-VOICE)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-VOICE-1 | The app SHALL offer an optional voice assistant ("Ruby", provided by Ello/Getello) to guide navigation and answer questions. | Should | Implemented |
| FR-VOICE-2 | Ruby SHALL be governed by a system prompt that forbids reading OTP, PAN, or Aadhaar values aloud. | Must | Implemented |
| FR-VOICE-3 | The assistant SHALL NOT transmit sensitive field values (PAN, Aadhaar, income, DOB) off-device to the third-party voice service; screen-context sent to Ruby SHALL be redacted/masked. | Must | **Target — gap C2 (page_context/read_screen currently egress live values; `sensitive` flag blocks writes only); remediation P0/P1** |
| FR-VOICE-4 | Voice transport SHALL use encrypted channels only (`wss://` / `https://`); cleartext `ws://`/`http://` SHALL be disallowed. | Must | **Target — gap C13; remediation P1** |
| FR-VOICE-5 | Voice processing SHALL be gated by explicit, revocable consent, and covered by a Data Processing Agreement (DPA) with Ello. | Must | **Target — gap C12; remediation P1** |

### 5.7 Admin dashboard (FR-ADMIN)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-ADMIN-1 | The admin dashboard SHALL provide authenticated views of users, leads, loans, onboarding funnels, app downloads, analytics, and notifications. | Must | Implemented |
| FR-ADMIN-2 | Admin authentication SHALL use bcrypt-hashed passwords, JWT access tokens, and rotating refresh tokens (`AdminUser`, `AdminRefreshToken`). | Must | Implemented |
| FR-ADMIN-3 | Admin access SHALL be role-based (super_admin / admin / analyst) with least-privilege enforcement per view and action. | Must | Roles modelled; enforcement = Target |
| FR-ADMIN-4 | The system SHALL NOT seed or display any default super-admin credentials; first-run SHALL force credential creation and SHALL support MFA. | Must | **Target — gap C4 (`admin@swiftloan.com/admin123` seeded & shown); remediation P0** |
| FR-ADMIN-5 | Admin session tokens SHALL be stored in httpOnly, secure cookies, not in browser `localStorage`. | Must | **Target — gap C11; remediation P1** |
| FR-ADMIN-6 | Admin access to any record containing PII SHALL be logged to an immutable audit trail (`AuditLog`). | Must | **Target — AuditLog exists but is not written (gap C10); remediation P2** |

### 5.8 Marketing site & lead capture (FR-WEB)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-WEB-1 | The marketing website SHALL capture leads (name, phone, city, product interest, amount, source/campaign) into `AnonymousLead`. | Must | Implemented |
| FR-WEB-2 | The website SHALL support a context-aware install handoff: a short opaque token (not PII) is carried in the app-download deep link and resolved server-side on first open (`ContextSession`). | Should | Implemented |
| FR-WEB-3 | Lead and context PII SHALL be subject to a retention TTL and automated purge, and SHALL be reachable by DSAR erasure. | Must | **Target — gap C9/C10 (orphan PII never purged, not in delete cascade); remediation P2** |
| FR-WEB-4 | Any secret/API key required by the website (e.g., voice widget key) SHALL be delivered via server-side configuration and SHALL NOT be committed to source or shipped in client code. | Must | **Target — gap C5 (real Ello key committed); remediation P0** |
| FR-WEB-5 | Marketing claims SHALL be validated against a compliance claims matrix (LSP disclosure, no misleading approval/rate promises). | Should | Target |

### 5.9 Notifications & tracking (FR-TRACK)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-TRACK-1 | The app SHALL emit fire-and-forget activity/session events (session start/end, navigation, funnel, loan steps) without blocking the UI (`Session`, `ActivityEvent`, `OnboardingFunnel`). | Should | Implemented |
| FR-TRACK-2 | Tracking event metadata SHALL be schema-validated and SHALL NOT contain PII (no free-form PII sink). | Must | **Target — gap C8 (`ActivityEvent.metadata` unvalidated free-form JSON); remediation P2** |
| FR-TRACK-3 | The admin system SHALL generate operational notifications (loan stale, onboarding stale, new lead, disbursed, system) with severity levels (`Notification`). | Should | Implemented |
| FR-TRACK-4 | App-download/attribution records SHALL be captured (`AppDownload`) without storing device identifiers as PII beyond what is necessary. | Could | Implemented |
| FR-TRACK-5 | Notification bodies SHALL NOT persist PII beyond retention limits and SHALL be covered by purge/erasure. | Should | **Target — gap C9; remediation P2** |

---

## 6. Non-functional requirements (NFR)

| ID | Category | Requirement | Priority |
|---|---|---|---|
| NFR-SEC-1 | Security | All data in transit SHALL use TLS 1.2+; cleartext transport SHALL be disallowed on all platforms (iOS ATS `NSAllowsArbitraryLoads=false`; Android cleartext disabled). | Must |
| NFR-SEC-2 | Security | Secrets SHALL be sourced from a managed secret store; the system SHALL **fail closed** if a required secret (JWT/admin/signing) is absent — no insecure default fallbacks. | Must |
| NFR-SEC-3 | Security | The backend SHALL enforce a strict CORS allow-list and per-route rate limiting / WAF protection. | Must |
| NFR-PRIV-1 | Privacy-by-design | The product SHALL apply data minimisation, purpose limitation, and privacy-by-default across all data collection (DPDP Act). | Must |
| NFR-PRIV-2 | Privacy-by-design | PII fields SHALL be encrypted at rest; SPDI (PAN, financial data) SHALL be tokenised/encrypted and access-controlled. | Must |
| NFR-PERF-1 | Performance | Core screens SHALL render within 2s on a mid-range Android device; EMI calculations SHALL be instantaneous (client-side). | Should |
| NFR-PERF-2 | Performance | Backend API P95 latency SHALL be < 500ms for read endpoints under expected load. | Should |
| NFR-AVL-1 | Availability | The backend SHALL target 99.5% monthly availability with health checks and graceful degradation for guest/offline flows. | Should |
| NFR-REL-1 | Reliability | Tracking SHALL be non-blocking and lossy-tolerant; core journeys SHALL not fail if telemetry fails. | Must |
| NFR-SCL-1 | Scalability | The data model SHALL use indexed, UUID-keyed tables and stateless API nodes to scale horizontally. | Should |
| NFR-USE-1 | Usability | The UI SHALL be a faithful, consistent design system (shared primitives, tokens, typography) with accessible contrast and touch targets. | Should |
| NFR-USE-2 | Accessibility | The app SHOULD meet WCAG 2.1 AA-equivalent guidance for mobile (labels, focus order, screen-reader support). | Should |
| NFR-L10N-1 | Localization | All user-facing copy SHALL be sourced from the i18n table supporting en/hi/te/hinglish/tenglish (te/hinglish/tenglish may fall back to en where untranslated). | Must |
| NFR-MNT-1 | Maintainability | Server, app, and admin SHALL remain separable workspaces with typed interfaces and documented navigation/state contracts. | Should |
| NFR-OBS-1 | Observability | The system SHALL provide structured logging with PII masking, and log retention of ≥180 days with NTP-synchronised timestamps (CERT-In). | Must |

---

## 7. Security, privacy & compliance requirements

This is a dedicated, audit-critical section. Each requirement is tagged with the standard/law it satisfies and the relevant **ISO/IEC 27001:2022 Annex A** control. In addition to ISO 27001, these requirements are mapped to the **AICPA SOC 2 Trust Services Criteria (TSC)** so the same control set supports both an ISO 27001 certification and a SOC 2 examination. The SOC 2 companion mapping is provided in **§7.12** and consolidated in the traceability table (§13). Requirements marked "Target" correspond to verified gaps tracked in the ISMS risk register with remediation priorities (P0–P3).

**SOC 2 scope for SwiftLoan.** The examination is scoped to the **Security (Common Criteria, mandatory), Availability, Confidentiality, Processing Integrity, and Privacy** Trust Services Categories. The Common Criteria used are CC1 (control environment), CC2 (communication & information), CC3 (risk assessment), CC4 (monitoring activities), CC5 (control activities), CC6 (logical & physical access controls), CC7 (system operations), CC8 (change management), and CC9 (risk mitigation); the category-specific criteria are Availability (A1), Confidentiality (C1), Processing Integrity (PI1), and Privacy (P1–P8).

### 7.1 Consent management

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-CON-1 | The system SHALL obtain free, specific, informed, unambiguous consent before processing personal data, recorded per purpose (`Consent`: terms, soft_pull, data_sharing, communications) with timestamp. | DPDP Act 2023 (Ch. II); RBI Digital Lending; ISO A.5.34 (Privacy & PII protection) | Model present; enforcement = Target (P1) |
| SEC-CON-2 | The system SHALL verify the relevant consent **server-side** before any credit-bureau soft pull (CICRA 2005) or before sharing applicant data with a lender partner. | CICRA 2005; RBI; DPDP; ISO A.5.34, A.8.2 (Privileged access) | **Target (P1)** |
| SEC-CON-3 | Consent SHALL be withdrawable as easily as it was given, and withdrawal SHALL propagate to downstream processing. | DPDP Act 2023 §6; ISO A.5.34 | **Target (P1)** |

### 7.2 Data minimisation & purpose limitation

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-MIN-1 | The system SHALL collect only data necessary for loan origination/servicing and process it only for the stated purpose. | DPDP Act 2023 §5–6; RBI Digital Lending (data minimisation); ISO A.5.34 | Partially; re-verify |
| SEC-MIN-2 | The system SHALL NOT duplicate SPDI across records unnecessarily; PAN SHALL exist in a single tokenised store rather than duplicated on both `User` and `LoanApplication`. | DPDP; ISO A.8.11 (Data masking), A.8.10 (Information deletion) | **Target — gap C1 (P1)** |
| SEC-MIN-3 | Tracking/telemetry SHALL NOT collect PII; event metadata SHALL be schema-constrained. | DPDP §8 (accuracy/limitation); ISO A.8.12 (DLP), A.8.15 (Logging) | **Target — gap C8 (P2)** |

### 7.3 PII encryption / tokenisation

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-CRY-1 | Passwords SHALL be stored using a strong adaptive hash (bcrypt) — never plaintext or reversible encryption. | IT Act SPDI; ISO A.8.24 (Cryptography) | Implemented |
| SEC-CRY-2 | OTPs and refresh tokens SHALL be stored hashed (SHA-256 / equivalent), never plaintext. | ISO A.8.24; A.5.17 (Authentication information) | Implemented |
| SEC-CRY-3 | PAN SHALL be encrypted or tokenised at rest, with access mediated by a key-managed vault; the full value SHALL never be logged. | DPDP; IT Act SPDI; ISO A.8.24, A.8.11, A.8.15 | **Target — gap C1 (P1)** |
| SEC-CRY-4 | Aadhaar and bank-account numbers SHALL be reduced to last-4 at rest; full values and core biometrics SHALL never be stored. | Aadhaar Act; RBI KYC; ISO A.8.11 | Implemented |
| SEC-CRY-5 | The production database SHALL enforce encryption-at-rest with encrypted backups hosted in an India region. | DPDP; RBI localisation; ISO A.8.24, A.8.13 (Backup), A.5.23 (Cloud services) | **Target — gap C12 (P1)** |
| SEC-CRY-6 | Client-side sensitive input fields (PAN/Aadhaar) SHALL use secure input and on-screen masking. | ISO A.8.11 (Data masking); RBI | **Target — gap C14 (P1)** |

### 7.4 Access control & secure development

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-AC-1 | Access to PII/SPDI SHALL follow least privilege with role-based access control across app, backend, and admin. | DPDP; ISO A.8.2 (Privileged access), A.8.3 (Info access restriction), A.5.15 (Access control) | Partially (Target for admin RBAC enforcement) |
| SEC-AC-2 | Authentication secrets (JWT/admin signing keys) SHALL be strong, rotated, and fail-closed; no `dev-access`/`dev-refresh` fallbacks in any deployed environment. | ISO A.5.17, A.8.24, A.8.9 (Config mgmt) | **Target — gap C6 (P0)** |
| SEC-AC-3 | Admin session tokens SHALL be stored in httpOnly secure cookies, not `localStorage`. | ISO A.8.3, A.8.5 (Secure authentication) | **Target — gap C11 (P1)** |
| SEC-AC-4 | No default/shared credentials SHALL exist in production; admin MFA SHALL be enforced. | ISO A.5.17, A.8.5; RBI IT governance | **Target — gap C4 (P0)** |
| SEC-DEV-1 | Secrets SHALL never be committed to source control; committed secrets SHALL be rotated and purged. | ISO A.8.25 (Secure development), A.8.4 (Access to source), A.8.24 | **Target — gap C5 (P0)** |
| SEC-DEV-2 | Development test bypasses (fixed OTP, DEMO_LOGIN) SHALL be compiled out / disabled in production. | ISO A.8.25, A.8.31 (Separation of environments), A.8.29 (Security testing) | **Target — gap C3 (P0)** |
| SEC-DEV-3 | The SDLC SHALL include security testing, dependency/vulnerability management, and independent VAPT before GA. | ISO A.8.25, A.8.8 (Vulnerability mgmt), A.8.28 (Secure coding), A.8.29 | **Target (P3)** |

### 7.5 Network & platform security

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-NET-1 | All transport (app, admin, voice) SHALL be encrypted (TLS/wss); cleartext SHALL be disallowed. | CERT-In; ISO A.8.20–A.8.23 (Network security), A.8.24 | Partially (voice = Target, gap C13) |
| SEC-NET-2 | CORS SHALL use a strict allow-list; all routes SHALL be rate-limited/WAF-protected. | ISO A.8.20, A.8.23 (Web filtering), A.8.9 | **Target — gap C7 (P1)** |

### 7.6 Data-principal rights (DSAR)

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-DSR-1 | A Data Principal SHALL be able to access a copy of their personal data and correct inaccuracies. | DPDP Act 2023 §11–12; ISO A.5.34 | **Target — gap C10 (P2)** |
| SEC-DSR-2 | A Data Principal SHALL be able to erase their data; erasure SHALL include orphan PII (leads, context sessions, notification bodies), not only the `User` cascade. | DPDP §12; ISO A.8.10 (Information deletion), A.5.34 | User self-delete implemented; orphan erasure = **Target — gap C9/C10 (P2)** |
| SEC-DSR-3 | The system SHALL provide a grievance-redressal channel and a named grievance officer/DPO. | DPDP §13; RBI Digital Lending (grievance redressal); ISO A.5.34, A.5.36 (Compliance) | SupportTicket present; governance = Target |

### 7.7 Retention & erasure

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-RET-1 | Personal data SHALL have defined retention periods and be automatically purged when no longer needed (TTL + purge jobs). | DPDP §8(7); ISO A.8.10, A.5.33 (Records protection) | **Target — gap C9 (P2)** |
| SEC-RET-2 | Security logs SHALL be retained ≥180 days with synchronised clocks (NTP). | CERT-In Directions 2022; ISO A.8.15 (Logging), A.8.17 (Clock sync) | **Target (P2)** |

### 7.8 Logging, monitoring & audit

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-LOG-1 | Access to and changes of PII SHALL be recorded in an immutable audit log (`AuditLog`), with PII masked in log content. | DPDP accountability; ISO A.8.15 (Logging), A.8.11 (Masking), A.5.28 (Evidence collection) | **Target — AuditLog not yet written (C10) (P2)** |
| SEC-LOG-2 | Logs SHALL be monitored for anomalies and support incident detection. | ISO A.8.16 (Monitoring), A.5.25 (Assessment of events) | Target |

### 7.9 Third-party / processor requirements

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-TPP-1 | Every processor handling personal data (Ello/Getello voice, lending partners, cloud host) SHALL be bound by a Data Processing Agreement (DPA) with security, purpose-limitation, and breach-notification clauses. | DPDP §8(2); RBI outsourcing; ISO A.5.19–A.5.22 (Supplier relationships), A.5.23 (Cloud) | **Target — gap C12 (P1/P2)** |
| SEC-TPP-2 | Sensitive values SHALL NOT be egressed to the voice processor; only redacted context SHALL be shared, under consent. | DPDP; ISO A.5.34, A.8.12 (DLP), A.8.11 | **Target — gap C2 (P0/P1)** |
| SEC-TPP-3 | Data shared with lenders SHALL be limited to what is consented and necessary, transferred over secure channels. | RBI Digital Lending; DPDP; ISO A.5.14 (Information transfer), A.8.20 | Target |

### 7.10 Breach notification & incident management

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-IR-1 | The organisation SHALL maintain an incident-response plan and report qualifying cyber incidents to CERT-In within **6 hours** of detection. | CERT-In Directions 2022; ISO A.5.24–A.5.26 (Incident mgmt) | **Target — runbook (P2)** |
| SEC-IR-2 | Personal-data breaches SHALL be notified to the Data Protection Board and affected Data Principals as required. | DPDP Act 2023 §8(6); ISO A.5.26, A.6.8 (Reporting events) | **Target (P2)** |

### 7.11 Governance & compliance

| ID | Requirement | Standards / ISO 27001 control | Status |
|---|---|---|---|
| SEC-GOV-1 | The organisation SHALL maintain a RoPA, conduct DPIAs for high-risk processing, and appoint a DPO/grievance officer. | DPDP; ISO A.5.34, A.5.35 (Independent review), A.5.36 | **Target (P2)** |
| SEC-GOV-2 | Information SHALL be classified (Public/Internal/Confidential/Restricted-SPDI) and handled per classification. | ISO A.5.12, A.5.13 | Defined in §8; enforcement = Target |
| SEC-GOV-3 | Personnel SHALL undergo security-awareness training and defined responsibilities. | ISO A.6.3 (Awareness), A.6.2 (Terms of employment) | Target |

### 7.12 SOC 2 Trust Services Criteria mapping (companion table)

Each SwiftLoan security/privacy requirement above is mapped to the relevant SOC 2 Trust Services Criteria. Common Criteria (CC1–CC9) apply to the Security category; A1 = Availability, C1 = Confidentiality, PI1 = Processing Integrity, P1–P8 = Privacy.

| Req ID | Requirement (short) | SOC 2 TSC | Status |
|---|---|---|---|
| SEC-CON-1 | Purpose-bound consent capture | P1 (notice), P2 (choice/consent), CC2 | Partial |
| SEC-CON-2 | Server-side consent check before bureau pull / partner share | P2, P6 (disclosure to third parties), CC6.1 | Target (P1) |
| SEC-CON-3 | Consent withdrawal propagation | P2, P4 (use/retention), P5 | Target (P1) |
| SEC-MIN-1 | Data minimisation / purpose limitation | P3 (collection), P4, C1 | Partial |
| SEC-MIN-2 | No SPDI duplication; single tokenised PAN | C1, PI1, P4 | Target (P1) |
| SEC-MIN-3 | No PII in telemetry | C1, P3, PI1 | Target (P2) |
| SEC-CRY-1 | Password hashing (bcrypt) | CC6.1, CC6.7, C1 | Met |
| SEC-CRY-2 | OTP/refresh-token hashing | CC6.1, CC6.7 | Met |
| SEC-CRY-3 | PAN encryption/tokenisation at rest | CC6.1, CC6.7, C1, P4 | Target (P1) |
| SEC-CRY-4 | Aadhaar/bank last-4 only; no biometrics stored | C1, P3, P4 | Met |
| SEC-CRY-5 | DB encryption-at-rest + India-region backups | CC6.1, A1.2 (backup), C1 | Target (P1) |
| SEC-CRY-6 | Secure input + masking of PAN/Aadhaar | CC6.1, C1, P4 | Target (P1) |
| SEC-AC-1 | Least-privilege RBAC over PII | CC6.1, CC6.2, CC6.3 | Partial |
| SEC-AC-2 | Fail-closed auth secrets | CC6.1, CC7.1, CC8.1 | Target (P0) |
| SEC-AC-3 | Admin tokens in httpOnly cookies | CC6.1, CC6.6 | Target (P1) |
| SEC-AC-4 | No default creds; admin MFA | CC6.1, CC6.2 | Target (P0) |
| SEC-DEV-1 | No committed secrets; rotate & purge | CC8.1, CC6.1, CC6.8 | Target (P0) |
| SEC-DEV-2 | Disable OTP/demo bypass in prod | CC8.1, CC6.1, CC7.1 | Target (P0) |
| SEC-DEV-3 | Security testing + VAPT | CC4.1, CC7.1, CC9.1, CC8.1 | Target (P3) |
| SEC-NET-1 | Encrypted transport everywhere (incl. voice) | CC6.1, CC6.6, CC6.7 | Partial |
| SEC-NET-2 | Strict CORS + rate limit / WAF | CC6.6, CC7.1, A1.1 | Target (P1) |
| SEC-DSR-1 | Access & correction rights | P5 (access), P8 (quality/correction) | Target (P2) |
| SEC-DSR-2 | Erasure incl. orphan PII | P4 (retention/disposal), P5 | Partial |
| SEC-DSR-3 | Grievance officer / DPO channel | P7 (monitoring & enforcement), CC2.2 | Partial |
| SEC-RET-1 | Retention TTL + purge | P4, C1 | Target (P2) |
| SEC-RET-2 | ≥180-day logs + NTP sync | CC7.2, CC7.3 | Target (P2) |
| SEC-LOG-1 | Immutable PII-access audit log (masked) | CC7.2, CC7.3, P7 | Target (P2) |
| SEC-LOG-2 | Monitoring & anomaly detection | CC4.1, CC7.2, CC7.3 | Target |
| SEC-TPP-1 | DPAs with processors (Ello, lenders, host) | CC9.2 (vendor mgmt), P6 | Target (P1/P2) |
| SEC-TPP-2 | No SPDI egress to voice processor | P6, C1, CC6.1 | Target (P0/P1) |
| SEC-TPP-3 | Minimal, secure lender data transfer | P6, C1, PI1 | Target |
| SEC-IR-1 | CERT-In 6-hour incident reporting | CC7.3, CC7.4, CC7.5 | Target (P2) |
| SEC-IR-2 | DPDP breach notification | CC7.4, CC7.5, P6 | Target (P2) |
| SEC-GOV-1 | RoPA, DPIA, DPO | CC1.1–CC1.5, CC3.1, P7 | Target (P2) |
| SEC-GOV-2 | Information classification | CC3.2, C1, CC6.1 | Defined |
| SEC-GOV-3 | Security-awareness training | CC1.4, CC2.2 | Target |

### 7.13 SOC 2 Type II — evidence of operating effectiveness

A SOC 2 **Type I** report attests that controls are *suitably designed* at a point in time. A SOC 2 **Type II** report additionally requires evidence that the controls **operated effectively over a review period, typically 3 to 12 months**. Consequently, satisfying the requirements above is necessary but not sufficient for a Type II opinion: SwiftLoan must also generate and retain *operating-effectiveness evidence* across that window — e.g., consent logs, access-review records, audit-log samples, change-management tickets, incident-response drills, and retention/purge job runs. The remediation of P0/P1 gaps should therefore be completed and stabilised *before* the Type II observation period begins, so the controls have an unbroken evidence trail throughout.

---

## 8. Data requirements

### 8.1 PII / data inventory

Derived from the verified fact base. "State today" reflects current implementation; target state per §7.

| Data element | Collected at | Stored as | Classification | State today |
|---|---|---|---|---|
| Phone number | mobile screen | `User.phone` (unique) | Confidential (PII) | Plaintext |
| Name (first/last/full) | aboutyou, basic, profile | `User.firstName/lastName/fullName` | Confidential (PII) | Plaintext |
| DOB / age | aboutyou, basic | `User.dob` | Confidential (PII) | Plaintext (full DOB) |
| Monthly income | basic | `User.monthlyIncome`, `LoanApplication.monthlyIncome` | Restricted (SPDI — financial) | Plaintext |
| **PAN card** | basicpan | `User.panNumber`, `LoanApplication.panNumber` | **Restricted (SPDI)** | **Full PAN, plaintext, duplicated ⚠ (C1)** |
| Aadhaar | aadhaar (stub) | `User.aadhaarLast4` | Restricted (SPDI) | Last-4 only ✓ |
| Bank account | bankv (stub) | `Loan.accountLast4` | Restricted (SPDI — financial) | Last-4 only ✓ |
| Selfie / face | selfie (stub) | not stored | Restricted (SPDI — biometric) | Nothing stored ✓ |
| Voice / voiceprint | voice widget → Ello | third-party (Ello) | Restricted (SPDI — biometric) | Egressed to processor ⚠ (C2/C12) |
| Email, address/pincode | basic, profile | `User.email`, `User.pincode` | Confidential (PII) | Plaintext |
| Credit score | derived | `User.creditScore` (default 750) | Restricted (SPDI — financial) | Plaintext |
| Passwords | admin/optional | `User.passwordHash`, `AdminUser.passwordHash` | Restricted (SPDI) | bcrypt ✓ |
| OTP | auth | `OtpToken.codeHash` | Confidential (auth secret) | SHA-256 hashed ✓ |
| Tracking metadata | app events | `ActivityEvent.metadata` (JSON) | Internal (PII risk) | Unvalidated sink ⚠ (C8) |
| Leads (name/phone/city) | website/deep-link | `AnonymousLead`, `ContextSession` | Confidential (PII) | Plaintext, not purged ⚠ (C9) |

### 8.2 Data classification scheme

| Class | Definition | Examples in SwiftLoan | Baseline handling |
|---|---|---|---|
| **Public** | Freely shareable; no harm if disclosed. | Marketing copy, public lender catalogue names, EMI formula. | No special controls. |
| **Internal** | Non-public operational data. | Aggregated analytics, non-PII telemetry, notification metadata. | Access-controlled to staff. |
| **Confidential** | PII whose disclosure harms an individual. | Name, phone, email, pincode, DOB, leads. | Encryption in transit; access control; audit; retention limits. |
| **Restricted (SPDI)** | Sensitive personal data under IT Act SPDI Rules / DPDP. | PAN, financial data (income, credit score, bank), biometrics (voice/selfie), passwords. | Encryption/tokenisation at rest + in transit; strict least-privilege; masking; audit logging; no third-party egress without DPA & consent. |

---

## 9. User journeys / flows

### 9.1 Borrower onboarding & loan funnel

`splash → language → mobile (phone + OTP) → aboutyou (name/DOB/gender) → home → fare (EMI calculator) → basic (name, DOB, income, employment, pincode) → basicpan (PAN) → finding (prequalification) → offers → handoff (to regulated lender) → kyc → aadhaar / panv / bankv / selfie (demo stubs today) → status → disbursed → repay / creditscore / profile / help`

Key control points along this journey:
- **OTP step** — authentication; must reject fixed/demo OTP in production (FR-AUTH-6).
- **PAN step** — SPDI capture; must be masked on input and tokenised at rest (SEC-CRY-3, SEC-CRY-6).
- **Finding/offers** — bureau soft pull and partner data-share; must be consent-gated server-side (SEC-CON-2).
- **Handoff** — KFS disclosure + partner identity; direct RE disbursal (FR-FUNNEL-6/7).
- **KYC** — currently demo stubs (out of scope §4.2); production requires licensed integration.
- **Voice assistant** — optional across the journey; must redact SPDI from context (SEC-TPP-2).

### 9.2 Admin / operations flow

Admin authenticates (bcrypt + JWT + rotating refresh) → lands on Master Overview → drills into Onboarding funnels, Loan pipeline, Leads (with status/note edit), App downloads, All users / user profile, Analytics, and Notifications. Every PII-bearing view must enforce RBAC (FR-ADMIN-3) and write an audit-log entry (FR-ADMIN-6 / SEC-LOG-1). An optional Ello voice-navigation widget assists dashboard navigation.

### 9.3 Lead-to-install context handoff

Website/voice widget captures a lead (`AnonymousLead`) and a `ContextSession`; a short opaque token (never the PII) travels in the app-download deep link and is resolved server-side on first open, letting the in-app assistant continue the conversation. The PII in these records must be retention-bound and DSAR-erasable (FR-WEB-3, SEC-RET-1).

---

## 10. Assumptions, dependencies & constraints

### 10.1 Assumptions
- SwiftLoan will onboard only RBI-regulated lenders as partners.
- Real KYC/lending traffic will not go live until production KYC integration and the P0/P1 remediations are complete.
- Data hosting will be within an India region to satisfy localisation expectations.

### 10.2 Dependencies
- **Ello/Getello** — third-party voice AI ("Ruby"); requires a DPA (SEC-TPP-1).
- **Lending partners (REs)** — receive consented applicants; require DPAs and secure transfer.
- **Cloud/hosting provider** — inherits physical/environmental controls (ISO A.7.x); requires cloud DPA and encryption-at-rest.
- **Credit bureaus (CIBIL/CRIF)** — soft-pull under CICRA consent.
- **Managed Postgres, Redis (optional), secret store** — platform dependencies.

### 10.3 Constraints
- LSP/DLA regulatory posture forbids direct lending and fund conduiting.
- Biometric data must never be stored.
- The mobile app is a faithful design-bundle port; UX changes must respect design fidelity.
- Existing schema models (User, LoanApplication, Offer, Loan, Repayment) are stable; extensions are additive.

---

## 11. Success metrics / KPIs

| KPI | Definition | Target (indicative) |
|---|---|---|
| Onboarding completion rate | Users completing language→home | ≥ 70% |
| Funnel conversion | basic → offers → handoff | ≥ 35% to offers |
| Time-to-offer | Median time from basic to offers | < 90s |
| Handoff-to-disbursal | Offers accepted that reach disbursal (RE) | Tracked, partner-dependent |
| Lead conversion | `AnonymousLead` → converted `User` | ≥ 15% |
| Consent capture rate | Applicants with recorded soft_pull/data_sharing consent before share | 100% (compliance gate) |
| Security posture | P0/P1 remediation items closed | 100% before GA |
| DSAR SLA | Access/erasure requests fulfilled within statutory window | 100% |
| CERT-In readiness | Qualifying incidents reported ≤ 6 hours | 100% |
| Availability | Backend monthly uptime | ≥ 99.5% |

---

## 12. ISO 27001 audit-readiness note

This PRD is a controlled input to the SwiftLoan Information Security Management System (ISMS) and directly supports the ISO/IEC 27001:2022 certification effort:

- **Documented requirements (Clause 7.5).** The security, privacy, and compliance requirements in §7 are formally documented, versioned, classified, and approved — satisfying the ISMS documented-information requirement and providing evidence of management intent.
- **Risk-driven controls (Clause 6.1 / Annex A).** Each requirement in §7 is mapped to an Annex A control and to the verified risk (C1–C14) it addresses, feeding the ISMS risk register and risk-treatment plan. Requirements flagged "Target" are the treatment actions with priorities (P0–P3).
- **Statement of Applicability linkage.** The traceability table in §13 provides the requirement→Annex A control mapping the SoA draws on: controls referenced here (A.5.12/A.5.13 classification; A.5.19–A.5.23 supplier/cloud; A.5.34 privacy; A.8.2/A.8.3 access; A.8.10 deletion; A.8.11 masking; A.8.12 DLP; A.8.15/A.8.16 logging/monitoring; A.8.24 cryptography; A.8.25–A.8.29 secure development; A.5.24–A.5.26 incident management; A.8.17 clock sync) are marked applicable, with justification traceable to product requirements.
- **Legal & regulatory register (A.5.31, A.5.36).** §2.5 and §7 tie the product to DPDP Act 2023, RBI Digital Lending / KYC / CKYC, CERT-In, IT Act SPDI, Aadhaar Act, and CICRA — supporting the legal-requirements identification and compliance-review controls.
- **Continual improvement (Clause 10).** Requirement statuses and the revision history give auditors an evidence trail of gap identification and planned remediation, demonstrating the ISMS is operating and improving rather than static.

Auditors should read this PRD together with SL-SEC-001 (Security & Compliance), SL-TAD-001 (Technical Architecture), and the risk register seeded by concerns C1–C14 in the verified fact base.

---

## 13. Traceability — security/privacy requirement → ISO 27001:2022 Annex A control → applicable law

| Req ID | Requirement (short) | ISO/IEC 27001:2022 Annex A control | SOC 2 TSC | Applicable law/standard | Risk ref | Status |
|---|---|---|---|---|---|---|
| SEC-CON-1 | Purpose-bound consent capture | A.5.34 Privacy & PII protection | P1, P2, CC2 | DPDP Act 2023 | — | Partial |
| SEC-CON-2 | Server-side consent check before bureau pull / partner share | A.5.34; A.8.2 Privileged access | P2, P6, CC6.1 | DPDP; CICRA 2005; RBI DL | C10 | Target (P1) |
| SEC-CON-3 | Consent withdrawal propagation | A.5.34 | P2, P4, P5 | DPDP Act §6 | — | Target (P1) |
| SEC-MIN-1 | Data minimisation / purpose limitation | A.5.34 | P3, P4, C1 | DPDP; RBI DL | — | Partial |
| SEC-MIN-2 | No SPDI duplication; single tokenised PAN | A.8.11 Data masking; A.8.10 Information deletion | C1, PI1, P4 | DPDP; IT Act SPDI | C1 | Target (P1) |
| SEC-MIN-3 | No PII in telemetry | A.8.12 DLP; A.8.15 Logging | C1, P3, PI1 | DPDP | C8 | Target (P2) |
| SEC-CRY-1 | Password hashing (bcrypt) | A.8.24 Cryptography | CC6.1, CC6.7, C1 | IT Act SPDI | — | Met |
| SEC-CRY-2 | OTP/refresh-token hashing | A.8.24; A.5.17 Authentication information | CC6.1, CC6.7 | IT Act SPDI | — | Met |
| SEC-CRY-3 | PAN encryption/tokenisation at rest | A.8.24; A.8.11; A.8.15 | CC6.1, CC6.7, C1, P4 | DPDP; IT Act SPDI | C1 | Target (P1) |
| SEC-CRY-4 | Aadhaar/bank last-4 only; no biometrics stored | A.8.11 Data masking | C1, P3, P4 | Aadhaar Act; RBI KYC | — | Met |
| SEC-CRY-5 | DB encryption-at-rest + India-region backups | A.8.24; A.8.13 Backup; A.5.23 Cloud services | CC6.1, A1.2, C1 | DPDP; RBI localisation | C12 | Target (P1) |
| SEC-CRY-6 | Secure input + masking of PAN/Aadhaar | A.8.11 Data masking | CC6.1, C1, P4 | RBI; DPDP | C14 | Target (P1) |
| SEC-AC-1 | Least-privilege RBAC over PII | A.8.2; A.8.3; A.5.15 Access control | CC6.1, CC6.2, CC6.3 | DPDP | — | Partial |
| SEC-AC-2 | Fail-closed auth secrets | A.5.17; A.8.24; A.8.9 Config mgmt | CC6.1, CC7.1, CC8.1 | CERT-In; ISO | C6 | Target (P0) |
| SEC-AC-3 | Admin tokens in httpOnly cookies | A.8.3; A.8.5 Secure authentication | CC6.1, CC6.6 | ISO best practice | C11 | Target (P1) |
| SEC-AC-4 | No default creds; admin MFA | A.5.17; A.8.5 | CC6.1, CC6.2 | RBI IT governance | C4 | Target (P0) |
| SEC-DEV-1 | No committed secrets; rotate & purge | A.8.25 Secure development; A.8.4 Access to source; A.8.24 | CC8.1, CC6.1, CC6.8 | CERT-In; ISO | C5 | Target (P0) |
| SEC-DEV-2 | Disable OTP/demo bypass in prod | A.8.25; A.8.31 Env separation; A.8.29 Security testing | CC8.1, CC6.1, CC7.1 | RBI; ISO | C3 | Target (P0) |
| SEC-DEV-3 | Security testing + VAPT | A.8.8 Vulnerability mgmt; A.8.28 Secure coding; A.8.29 | CC4.1, CC7.1, CC9.1, CC8.1 | ISO; RBI | — | Target (P3) |
| SEC-NET-1 | Encrypted transport everywhere (incl. voice) | A.8.20–A.8.23 Network security; A.8.24 | CC6.1, CC6.6, CC6.7 | CERT-In | C13 | Partial |
| SEC-NET-2 | Strict CORS + rate limit / WAF | A.8.20; A.8.23 Web filtering; A.8.9 | CC6.6, CC7.1, A1.1 | ISO; CERT-In | C7 | Target (P1) |
| SEC-DSR-1 | Access & correction rights | A.5.34 | P5, P8 | DPDP Act §11–12 | C10 | Target (P2) |
| SEC-DSR-2 | Erasure incl. orphan PII | A.8.10 Information deletion; A.5.34 | P4, P5 | DPDP Act §12 | C9/C10 | Partial |
| SEC-DSR-3 | Grievance officer / DPO channel | A.5.34; A.5.36 Compliance | P7, CC2.2 | DPDP §13; RBI DL | — | Partial |
| SEC-RET-1 | Retention TTL + purge | A.8.10; A.5.33 Records protection | P4, C1 | DPDP §8(7) | C9 | Target (P2) |
| SEC-RET-2 | ≥180-day logs + NTP sync | A.8.15 Logging; A.8.17 Clock sync | CC7.2, CC7.3 | CERT-In | — | Target (P2) |
| SEC-LOG-1 | Immutable PII-access audit log (masked) | A.8.15; A.8.11; A.5.28 Evidence collection | CC7.2, CC7.3, P7 | DPDP accountability | C10 | Target (P2) |
| SEC-LOG-2 | Monitoring & anomaly detection | A.8.16 Monitoring; A.5.25 Assessment of events | CC4.1, CC7.2, CC7.3 | ISO | — | Target |
| SEC-TPP-1 | DPAs with processors (Ello, lenders, host) | A.5.19–A.5.22 Supplier; A.5.23 Cloud | CC9.2, P6 | DPDP §8(2); RBI outsourcing | C12 | Target (P1/P2) |
| SEC-TPP-2 | No SPDI egress to voice processor | A.5.34; A.8.12 DLP; A.8.11 | P6, C1, CC6.1 | DPDP | C2 | Target (P0/P1) |
| SEC-TPP-3 | Minimal, secure lender data transfer | A.5.14 Information transfer; A.8.20 | P6, C1, PI1 | RBI DL; DPDP | — | Target |
| SEC-IR-1 | CERT-In 6-hour incident reporting | A.5.24–A.5.26 Incident mgmt | CC7.3, CC7.4, CC7.5 | CERT-In Directions 2022 | — | Target (P2) |
| SEC-IR-2 | DPDP breach notification | A.5.26; A.6.8 Reporting events | CC7.4, CC7.5, P6 | DPDP Act §8(6) | — | Target (P2) |
| SEC-GOV-1 | RoPA, DPIA, DPO | A.5.34; A.5.35 Independent review; A.5.36 | CC1.1–CC1.5, CC3.1, P7 | DPDP | — | Target (P2) |
| SEC-GOV-2 | Information classification | A.5.12; A.5.13 Labelling | CC3.2, C1, CC6.1 | ISO; DPDP | — | Defined |
| SEC-GOV-3 | Security-awareness training | A.6.3 Awareness; A.6.2 Terms of employment | CC1.4, CC2.2 | ISO | — | Target |

---

_End of document — SwiftLoan Product Requirements Document v1.0 (Confidential)._

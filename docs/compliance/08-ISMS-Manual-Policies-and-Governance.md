# SwiftLoan — ISMS Manual, Policies & Governance (Doc 08)

> **Document ownership & accountable roles** — Product Owner: **Sridhar Muppidi** · Product / Technical Head: **Sachin Tulla** · Head of Engineering: **Hari PS** · Security Head: **Anil M**.

**Classification: Restricted** · Prepared for ISO/IEC 27001:2022 certification and SOC 2 (Type II) examination.

---

## 0. Document control

| Field | Value |
|---|---|
| Document ID | SL-ISMS-08 |
| Title | ISMS Manual, Policies & Governance |
| Version | 1.0 |
| Status | Approved for audit |
| Effective date | 2026-08-04 |
| Next review | 2027-08-04 (or on material change) |
| Owner | Chief Information Security Officer (CISO) |
| Approver | CEO / Management (ISMS top management) |
| Classification | **Restricted** |
| Distribution | ISMS steering committee, engineering leadership, external auditors under NDA |

### 0.1 Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-30 | CISO | Initial draft — ISMS scope and clause structure |
| 0.9 | 2026-08-02 | CISO | Added full policy set, privacy management, SOC 2 supplements |
| 1.0 | 2026-08-04 | CISO | Baselined against `_AUDIT_BRIEF.md` §9 gap analysis; cross-referenced Docs 01–10 and repo controls (SECURITY.md, CODEOWNERS, security-scan.yml, Dependabot, PR template, LICENSE, compliance-sync) |

### 0.2 How to read this manual

This single manual is the SwiftLoan ISMS Manual. It is deliberately consolidated (a manual, not twenty separate files). It contains: (§1) the ISMS Manual mapped to ISO/IEC 27001:2022 Clauses 4–10; (§2) the consolidated policy set; (§3) privacy management; (§4) SOC 2 supplements; (§5) the document register. Every policy and clause is tagged with the relevant **ISO/IEC 27001:2022 Annex A control(s)** and **SOC 2 Trust Services Criteria (TSC)**. Where a control is not yet implemented, this manual states the fact and points to the risk treatment plan (Doc 03) and the live status tracker (`docs/compliance/COMPLIANCE-STATUS.md`) — it does not overclaim.

### 0.3 Related documents

| Doc | Title | Role relative to this manual |
|---|---|---|
| 01 | Product Requirements Document | Product scope, user flows |
| 02 | Technical Architecture Document | System boundary, data flows, components |
| 03 | Security & Compliance Document | Risk assessment, risk treatment plan, scope statement |
| 04 | Test Cases Document | Verification evidence |
| 05 | Statement of Applicability (SoA) | Annex A applicability & justification |
| 06 | Compliance Evidence Pack & Claims Matrix | Evidence index, marketing-claims control |
| 07 | SDLC & Change Management Tracker | Change control, CI/CD gates |
| **08** | **ISMS Manual, Policies & Governance** | **This document** |
| 09 | Secure-by-Design, Privacy-by-Design & Compliance-by-Design | Principles, threat model, DPIA |
| 10 | ISO 27001 & SOC 2 Certification Readiness & Gap Assessment | Gap & remediation tracking |

---

# §1 ISMS Manual — ISO/IEC 27001:2022 Clauses 4–10

## Clause 4 — Context of the organization

**4.1 Understanding the organization and its context.** SwiftLoan operates a Digital Lending App (DLA) as a Lending Service Provider (LSP) *on behalf of* RBI-regulated lenders (banks/NBFCs). SwiftLoan does not lend directly and does not decide loan approvals. It handles PII and SPDI (financial data, PAN, Aadhaar last-4, contact data, and — via a third-party voice assistant — voice/biometric-class data). External context: RBI Digital Lending Guidelines 2022, DPDP Act 2023, CERT-In Directions 2022, IT Act 2000 §43A + SPDI Rules 2011, Aadhaar Act, CICRA 2005. Internal context: a small engineering-led organization, cloud-hosted (Render), monorepo, third-party dependencies (Ello/Getello "Ruby" voice AI, lenders).

**4.2 Interested parties and requirements.**

| Interested party | Key requirements |
|---|---|
| Data principals (borrowers) | Consent, transparency, data-principal rights, minimal collection, secure handling |
| RBI-regulated lender partners | Data localization, KFS, direct disbursal, grievance redressal, secure data sharing |
| Regulators (RBI, Data Protection Board, CERT-In) | Compliance with lending, privacy, and breach-notification duties |
| Ello/Getello (sub-processor) | DPA, secure integration, redaction of sensitive fields |
| Cloud/hosting provider (Render) | Shared-responsibility controls, region/residency |
| Employees & contractors | Clear roles, acceptable use, secure working conditions |
| Investors / auditors | Demonstrable ISMS, certification readiness |

**4.3 Scope of the ISMS.** The ISMS scope is defined in **Doc 03 (Security & Compliance Document)** and covers: the React Native mobile app (iOS + Android), the Node/Express/Prisma/PostgreSQL backend, the Next.js admin dashboard, the marketing website, the compliance/CI tooling in the repository, and the personnel, processes, and third-party integrations that support them. Physical data-center security is inherited from the cloud provider (carve-out; see §4 SOC 2 supplements).

**4.4 ISMS.** SwiftLoan establishes, implements, maintains, and continually improves the ISMS in accordance with ISO/IEC 27001:2022. This manual is the top-level ISMS record.

- **Annex A:** A.5.1, A.5.31, A.5.35 · **SOC 2 TSC:** CC1.1, CC2.1, CC3.1
- **Evidencing artifacts:** Doc 03 (scope & risk), this manual §4.2 table, Doc 10 (readiness).

## Clause 5 — Leadership

**5.1 Leadership & commitment.** Top management is accountable for the ISMS, allocates resources (Clause 7), integrates ISMS requirements into the SDLC (Doc 07), and reviews performance (Clause 9). Security-, privacy-, and compliance-by-design are mandated as engineering principles (Doc 09).

### 5.2 Information Security Policy (top-level statement)

> **SwiftLoan Information Security Policy.** SwiftLoan is committed to protecting the confidentiality, integrity, and availability of the personal and financial information entrusted to us by borrowers and lender partners. We operate an Information Security Management System aligned to ISO/IEC 27001:2022 and the SOC 2 Trust Services Criteria, and a Privacy Information Management System aligned to ISO/IEC 27701 and India's DPDP Act 2023. We apply **least privilege, data minimization, secure defaults, fail-closed design, and privacy-by-design**. We comply with applicable legal, regulatory, and contractual obligations, including RBI Digital Lending Guidelines, CERT-In Directions, and the DPDP Act. We manage risk through a documented methodology, set measurable security objectives, respond to incidents within regulatory timelines, and continually improve. Every employee and contractor is responsible for information security within their role. Violations are subject to disciplinary action.
>
> *Approved by top management. Reviewed at least annually.*

### 5.3 Organizational roles, responsibilities & authorities

| Role | Responsibilities | Authority |
|---|---|---|
| **CISO** (ISMS owner) | Owns the ISMS, risk register, SoA, policy set; chairs management review; approves risk treatment and exceptions | Accept/reject risk within criteria (§6.2); halt releases on unmitigated critical risk |
| **DPO / Grievance Officer** | Privacy compliance, RoPA, DPIA, DSAR handling, consent governance, breach notice to Data Protection Board and data principals; grievance redressal under RBI DLG | Direct data-processing changes; act as DPDP contact point |
| **Head of Engineering** | Change control, release gates, segregation of duties, deployment approvals (Doc 07) | Block releases failing security/CI gates |
| **Engineering Lead** | Secure development, code ownership (CODEOWNERS), remediation ownership, competence of engineers | Assign remediation; approve/reject PRs in owned areas |
| **All staff/contractors** | Acceptable use, awareness training, incident reporting | — |

- **Annex A:** A.5.1, A.5.2, A.5.3 (SoD), A.5.4, A.6.1 · **SOC 2 TSC:** CC1.1–CC1.5, CC2.2
- **Evidencing artifacts:** this policy statement, `CODEOWNERS`, `.github/pull_request_template.md` (SoD reminder), Doc 07 (release gates), `SECURITY.md`.

## Clause 6 — Planning

**6.1 Actions to address risks and opportunities — risk management methodology.** SwiftLoan uses an asset- and threat-based risk methodology documented in **Doc 03**:
1. Identify assets and data flows (PII/SPDI inventory — see `_AUDIT_BRIEF.md` §3, Doc 02).
2. Identify threats/vulnerabilities and existing controls.
3. Score **Likelihood (1–5) × Impact (1–5) = Risk (1–25)**; impact weighs data sensitivity, regulatory exposure, and customer harm.
4. Determine treatment: **treat / accept / avoid / transfer**.
5. Record in the risk register (Doc 03); map to Annex A via the SoA (Doc 05).

**6.2 Risk acceptance criteria.**

| Risk score | Rating | Acceptance rule |
|---|---|---|
| 20–25 | Critical | Not acceptable. Immediate treatment (P0); CEO + CISO sign-off if temporary exception |
| 12–19 | High | Not acceptable without a time-bound treatment plan (P1); CISO approval |
| 6–11 | Medium | Acceptable with compensating controls and scheduled treatment (P2) |
| 1–5 | Low | Acceptable; monitor (P3) |

Residual risk above "Medium" requires documented CISO acceptance with expiry. The seeded risk register (C1–C14 in `_AUDIT_BRIEF.md` §5) is the current risk baseline; open items (e.g., C1 PAN plaintext, C2 voice sensitive-field leak, C5 committed key) are in treatment per Doc 03.

**6.2.x Security objectives & KPIs.**

| # | Security objective | KPI / metric | Target | Owner |
|---|---|---|---|---|
| O1 | Eliminate plaintext SPDI at rest | % SPDI fields encrypted/tokenized (PAN) | 100% | Eng Lead |
| O2 | No secrets in source | gitleaks findings on `main` | 0 | Security |
| O3 | Timely vulnerability remediation | Critical/High vulns remediated within SLA | 100% (≤30 days) | Eng Lead |
| O4 | Secure change control | % PRs with Code Owner review + passing CI gates | 100% | Release Mgr |
| O5 | Breach reporting readiness | Mean time to CERT-In report | ≤6 hours | DPO |
| O6 | Awareness coverage | Staff completing annual security+privacy training | 100% | CISO |
| O7 | Dependency hygiene | Dependabot High/Critical PRs merged on time | ≥95% | Eng Lead |
| O8 | DSAR responsiveness | DSARs fulfilled within DPDP timeline | 100% | DPO |

**6.3 Planning of changes.** Changes to the ISMS are planned and controlled (Doc 07; §3 Change Management policy).

- **Statement of Applicability:** **Doc 05** · **Risk treatment plan:** **Doc 03**
- **Annex A:** A.5.7 (threat intel), A.8.8 · **SOC 2 TSC:** CC3.1–CC3.4, CC4.1, CC5.1
- **Evidencing artifacts:** Doc 03 (risk register + treatment), Doc 05 (SoA), `COMPLIANCE-STATUS.md` (live objective tracking).

## Clause 7 — Support

**7.1 Resources.** Top management provides tooling (CI/CD, CodeQL, gitleaks, Dependabot), cloud infrastructure, and personnel to operate the ISMS.

**7.2 Competence.** Engineers are expected to be competent in secure coding, OWASP risks, and privacy-by-design. Competence is maintained via onboarding, code review (CODEOWNERS), and training; gaps are treated as nonconformities (Clause 10).

**7.3 Awareness & training program.**

| Audience | Content | Cadence | Evidence |
|---|---|---|---|
| All staff | Security & privacy fundamentals, DPDP, phishing, incident reporting, acceptable use | On hire + annual | Training register |
| Engineers | Secure SDLC, OWASP Top 10, secrets handling, data classification, PR/CI gates | On hire + annual + on major change | Training register, PR reviews |
| Support/ops | DSAR handling, grievance redressal, breach escalation | On hire + annual | Training register |
| Incident responders | IR plan tabletop / drill | Annual | Drill report |

**7.4 Communication.** Internal: ISMS steering channel, release notes, security advisories. External: `SECURITY.md` (vulnerability disclosure), privacy notice, grievance officer contact, breach notices to CERT-In / Data Protection Board / data principals.

**7.5 Control of documented information — document register.** All ISMS documents are version-controlled in the repository under `docs/compliance/`, owned per the register in §5, classified, and reviewed at least annually. Changes follow change control (Doc 07). The full document register is in **§5 of this manual**. Auto-generated status (`COMPLIANCE-STATUS.md`) is produced by `scripts/compliance/compliance_sync.py` and must not be hand-edited.

- **Annex A:** A.5.10, A.5.37, A.6.3 (awareness), A.7.7 · **SOC 2 TSC:** CC1.4, CC2.1–CC2.3, CC5.3
- **Evidencing artifacts:** training register, `SECURITY.md`, this manual's document register, the `compliance-doc-sync` skill + `scripts/compliance/compliance_sync.py`.

## Clause 8 — Operation

**8.1 Operational planning and control.** SwiftLoan plans and controls the processes needed to meet ISMS requirements and to implement risk treatment. Operational security is executed through the policy set (§3), the SDLC and change-management controls (Doc 07), the technical architecture and data-flow controls (Doc 02), and the risk treatment plan (Doc 03). CI security gates (CodeQL, gitleaks, npm audit, Dependabot) run on every push/PR and on a weekly schedule.

**8.2 Information security risk assessment.** Performed at planned intervals and on significant change (see Doc 03; results feed Clause 9 and Clause 10).

**8.3 Information security risk treatment.** Executed per the risk treatment plan (Doc 03); status tracked in `COMPLIANCE-STATUS.md` and Doc 10.

- **References:** Docs 03 (risk), 07 (SDLC/change), 09 (secure-by-design), 02 (architecture)
- **Annex A:** A.8.* (technological controls), A.5.8 (security in project mgmt) · **SOC 2 TSC:** CC5.1–CC5.3, CC7.1, CC8.1
- **Evidencing artifacts:** `.github/workflows/security-scan.yml`, `.github/dependabot.yml`, Doc 07 tracker.

## Clause 9 — Performance evaluation

**9.1 Monitoring, measurement, analysis & evaluation.** Metrics from the KPI table (§6.2.x) are collected and reviewed. Automated signals: CI gate pass/fail, gitleaks/CodeQL/npm-audit findings, Dependabot alerts, `COMPLIANCE-STATUS.md` control counts. Manual signals: DSAR turnaround, incident MTTR, training completion.

**9.2 Internal audit program & schedule.**

| Audit | Scope | Frequency | Auditor (independent of area) |
|---|---|---|---|
| Full ISMS internal audit | All clauses + Annex A via SoA | Annual (pre-certification and each cycle) | Internal auditor / external consultant |
| Access review | User/admin/RBAC access, least privilege | Quarterly | Security |
| Change/CI-gate audit | PRs, Code Owner reviews, release approvals | Quarterly | Head of Engineering peer |
| Privacy audit | RoPA, consent, DSAR, retention | Semi-annual | DPO |
| Supplier review | Ello/Getello, lenders, Render — DPAs & controls | Annual | DPO + Security |

Findings are logged as nonconformities (Clause 10). Auditors must be independent of the audited activity.

**9.3 Management review.**

- **Cadence:** at least semi-annually, plus after any major incident or significant change.
- **Inputs:** status of prior actions; changes in internal/external context and interested-party requirements; ISMS performance (KPIs, nonconformities, corrective actions, monitoring results, audit results); risk assessment/treatment status; adequacy of resources; supplier performance; opportunities for improvement.
- **Outputs:** decisions on continual improvement, changes to the ISMS, resource needs, updated objectives, and risk-acceptance decisions.
- **Records:** management-review minutes retained as ISMS records.

- **Annex A:** A.5.35 (independent review), A.5.36, A.8.15 (logging), A.8.16 (monitoring) · **SOC 2 TSC:** CC4.1, CC4.2, CC3.1
- **Evidencing artifacts:** internal audit reports, management-review minutes, `COMPLIANCE-STATUS.md`, Doc 10.

## Clause 10 — Improvement

**10.1 Continual improvement.** The ISMS is continually improved through the risk, audit, management-review, and incident cycles. Improvements are tracked to closure.

**10.2 Nonconformity & corrective action (CAPA) procedure.**
1. **Identify & record** the nonconformity (source: audit, incident, monitoring, CI gate, DSAR miss).
2. **Contain** — react to control and correct consequences.
3. **Root-cause analysis** — determine why it occurred and whether it exists elsewhere.
4. **Corrective action** — implement, assign owner and due date.
5. **Verify effectiveness**; update risk register / SoA / policies as needed.
6. **Close** and record.

**CAPA register template.**

| CAPA ID | Date raised | Source | Nonconformity | Severity | Root cause | Corrective action | Owner | Due | Status | Effectiveness verified |
|---|---|---|---|---|---|---|---|---|---|---|
| CAPA-YYYY-NNN | | Audit/Incident/CI/DSAR | | Critical/High/Med/Low | | | | | Open/In-progress/Closed | Yes/No |

Seed CAPA candidates map directly to open risks (e.g., C1 PAN plaintext, C5 committed Ello key, C3 demo-OTP in prod) per `_AUDIT_BRIEF.md` §5 and `COMPLIANCE-STATUS.md`.

- **Annex A:** A.5.27 (learning from incidents), A.5.36 · **SOC 2 TSC:** CC4.2, CC5.3, CC7.4, CC7.5
- **Evidencing artifacts:** CAPA register, incident post-mortems, updated Doc 03/05.

---

# §2 Policy Set

> Each policy is intentionally concise (this is a manual, not separate files) and states **Purpose · Scope · Policy statements · Control refs**. Scope for every policy = the ISMS scope in Clause 4.3 unless narrowed.

## 2.1 Access Control Policy
**Purpose:** Ensure only authorized identities access systems and data. **Policy:** Least privilege and need-to-know; unique named accounts (no shared/default credentials — remediating C4 default admin); RBAC for admin dashboard; MFA required for admin/privileged access; access granted via approval and reviewed quarterly; revoked on offboarding within 24h; secrets fail-closed (no `dev-access`/`dev-refresh` fallbacks — remediating C6); admin session tokens to move from `localStorage` to httpOnly cookies (remediating C11).
**Annex A:** A.5.15, A.5.16, A.5.17, A.5.18, A.8.2, A.8.3, A.8.5 · **SOC 2:** CC6.1, CC6.2, CC6.3.

## 2.2 Cryptography & Key Management Policy
**Purpose:** Protect confidentiality/integrity via approved cryptography. **Policy:** TLS 1.2+ in transit everywhere (ATS enforced on iOS, cleartext disallowed on Android; voice transport to be wss/https only — remediating C13); passwords bcrypt; OTP/refresh tokens hashed (SHA-256/bcrypt); SPDI at rest (PAN) to be field-encrypted/tokenized (remediating C1); DB encryption-at-rest and encrypted backups in an India region (remediating C12); keys stored in a secrets manager, never in source (remediating C5); key rotation on suspected compromise and at defined intervals; approved algorithms only.
**Annex A:** A.8.24, A.8.20, A.8.26 · **SOC 2:** CC6.1, CC6.7, C1.1.

## 2.3 Data Classification & Handling Policy
**Purpose:** Handle data per sensitivity. **Classification tiers:** Public · Internal · Confidential · **Restricted/SPDI** (PAN, Aadhaar, financial, biometric/voice, credentials). **Policy:** Label and handle per tier; minimize collection (Aadhaar/bank stored last-4 only — keep); mask SPDI in UI and logs (secure input + PAN masking — remediating C14); redact SPDI before third-party egress, incl. voice `page_context`/`read_screen` (remediating C2); no SPDI in URLs, tracking metadata (remediating C8), or fixtures.
**Annex A:** A.5.12, A.5.13, A.8.11 (masking), A.8.12 (DLP) · **SOC 2:** C1.1, P4, CC6.1.

## 2.4 Data Retention & Disposal Policy
**Purpose:** Retain personal data only as long as needed; dispose securely. **Policy:** Enforce retention TTLs and purge jobs, including orphan PII (AnonymousLead, ContextSession, Notification.body — remediating C9); secure deletion via cascade on user delete (existing `DELETE /me`) extended to orphan records; logs retained ≥180 days (CERT-In); disposal logged.

**Retention schedule.**
| Data category | Retention | Basis | Disposal |
|---|---|---|---|
| Active borrower account (User) | Life of relationship + regulatory hold | Contract / RBI-KYC | Cascade hard-delete on request |
| KYC records (Aadhaar last-4, PAN token) | Per RBI/CKYC retention | Legal obligation | Secure erase |
| Loan/application records | Per lender + RBI requirements | Legal obligation | Secure erase after hold |
| Anonymous leads / ContextSession | ≤90 days (proposed TTL) | Legitimate use, minimization | Automated purge |
| OTP tokens | Short-lived (minutes) | Security | Expiry/purge |
| Application & access logs | ≥180 days, ≤ defined max | CERT-In | Rotate & delete |
| Marketing/comms consent records | Until withdrawn + evidence period | Consent | Erase on withdrawal |

**Annex A:** A.5.33, A.5.34, A.8.10 (deletion), A.8.13 · **SOC 2:** C1.2, P4, P6.

## 2.5 Backup & Recovery Policy
**Purpose:** Ensure recoverability. **Policy:** Automated encrypted backups of the PostgreSQL database in the India region; defined backup frequency; periodic restore tests; backups access-controlled and retained per schedule; recovery aligned to BCDR RTO/RPO (§2.12).
**Annex A:** A.8.13, A.8.14 · **SOC 2:** A1.2, A1.3, CC7.5.

## 2.6 Logging & Monitoring Policy
**Purpose:** Detect and investigate security events. **Policy:** Structured logs with PII masked; write the existing `AuditLog` model on PII access/admin actions (currently not written — remediating C10); NTP-synced clocks and ≥180-day retention (CERT-In); alerting on anomalies; CI security findings (CodeQL/gitleaks/npm audit) monitored; logs protected from tampering.
**Annex A:** A.8.15, A.8.16, A.8.17 · **SOC 2:** CC7.1, CC7.2, CC7.3.

## 2.7 Vulnerability & Patch Management Policy
**Purpose:** Manage technical vulnerabilities. **Policy:** SAST (CodeQL) and secret scanning (gitleaks) on every push/PR + weekly; Dependabot weekly across all package ecosystems; `npm audit` (high+) in CI; remediation SLAs — Critical ≤7d, High ≤30d, Medium ≤90d; independent VAPT before major releases; findings tracked as CAPA.
**Implemented artifacts:** `.github/workflows/security-scan.yml`, `.github/dependabot.yml`.
**Annex A:** A.8.8, A.8.9 · **SOC 2:** CC7.1, CC8.1.

## 2.8 Secure Development Policy
**Purpose:** Build security in. **Policy:** Security-, privacy-, and compliance-by-design (Doc 09); secure defaults, fail-closed, least privilege, data minimization; threat modeling for significant features; mandatory Code Owner review (CODEOWNERS) for security/privacy-sensitive paths; PR security/compliance checklist (`.github/pull_request_template.md`); no secrets in code; separate dev/prod config; source-code access controlled.
**Annex A:** A.8.25, A.8.26, A.8.27, A.8.28, A.8.4, A.8.31 · **SOC 2:** CC8.1, CC5.2.

## 2.9 Change Management Policy
**Purpose:** Control changes to production. **Policy:** All changes via version control and pull request; branch protection on `main` (require PR review + Code Owners + passing status checks); segregation of duties (author ≠ approver ≠ deployer per PR template reminder); release approvals and rollback plans; emergency-change process with retroactive review. Full procedure and evidence in **Doc 07 (SDLC & Change Management Tracker)**.
**Annex A:** A.8.32, A.8.9, A.5.3 (SoD) · **SOC 2:** CC8.1.

## 2.10 Supplier / Third-Party Management Policy
**Purpose:** Manage risk from suppliers and sub-processors. **Policy:** Maintain a supplier register; execute Data Processing Agreements (DPAs) with all processors before data sharing; assess security posture; define data flows and residency; monitor annually.
| Supplier | Role | Key controls required |
|---|---|---|
| Ello / Getello ("Ruby" voice AI) | Sub-processor of voice/biometric-class + screen data | DPA; redaction of SPDI from `page_context`; wss/https only; key rotation; retention limits |
| Lender partners (banks/NBFCs) | Joint/independent controllers for lending | DPA/data-sharing agreement; consent-gated sharing; localization; KFS |
| Render (hosting) | Sub-service organization (infrastructure) | Shared-responsibility; region/residency; encryption-at-rest; carve-out (SOC 2) |
**Annex A:** A.5.19, A.5.20, A.5.21, A.5.22, A.5.23 · **SOC 2:** CC9.2, CC3.4.

## 2.11 Incident Response Plan
**Purpose:** Detect, respond to, and report security incidents. **Severity levels:** **SEV-1** (confirmed SPDI/personal-data breach or system compromise) · **SEV-2** (significant security event, limited exposure) · **SEV-3** (minor/potential) · **SEV-4** (informational). **Steps:** Detect → Triage & classify → Contain → Eradicate → Recover → Notify → Post-incident review (CAPA). **Regulatory notification:** report to **CERT-In within 6 hours** of noticing a reportable cyber incident; for personal-data breaches, notify the **Data Protection Board and affected data principals per the DPDP Act 2023** without undue delay; grievance officer informs affected borrowers. Contacts and reporting channel are in `SECURITY.md`. Annual tabletop drills.
**Annex A:** A.5.24, A.5.25, A.5.26, A.5.27, A.5.28, A.6.8 · **SOC 2:** CC7.3, CC7.4, CC7.5.

## 2.12 Business Continuity & Disaster Recovery Policy
**Purpose:** Maintain/restore service after disruption. **Policy:** Documented BCDR with defined **RTO ≤ 4 hours** and **RPO ≤ 1 hour** for the core lending API and database (targets; validated by restore tests); redundant cloud infrastructure; encrypted off-instance backups (§2.5); annual DR test; dependency on cloud-provider availability documented in the shared-responsibility model.
**Annex A:** A.5.29, A.5.30, A.8.14 · **SOC 2:** A1.1, A1.2, A1.3.

## 2.13 HR Security Policy
**Purpose:** Reduce personnel risk. **Policy:** Background/reference screening before hire (proportionate to role and law); signed NDA and acceptable-use acknowledgment at onboarding; role-based access provisioning; security & privacy training on hire; disciplinary process for violations; offboarding checklist revokes all access and recovers assets within 24h.
**Annex A:** A.6.1, A.6.2, A.6.4, A.6.5, A.6.6 · **SOC 2:** CC1.4, CC1.5.

## 2.14 Acceptable Use Policy
**Purpose:** Define acceptable use of assets and data. **Policy:** Assets used for authorized business only; no storage of production SPDI on local devices; approved tools only; no sharing of credentials; report suspected misuse; comply with all policies in this manual.
**Annex A:** A.5.10, A.8.1 · **SOC 2:** CC1.1, CC2.2.

## 2.15 Password & Authentication Policy
**Purpose:** Ensure strong authentication. **Policy:** No default/shared credentials (remediating C4); enforced password complexity and bcrypt storage; MFA for admin/privileged and remote access; OTP hashed and short-lived with demo/fixed-OTP bypass disabled in production (remediating C3); session tokens with rotation and secure storage (httpOnly cookies for admin — remediating C11); lockout on repeated failures.
**Annex A:** A.5.17, A.8.5 · **SOC 2:** CC6.1.

## 2.16 Remote Working Policy
**Purpose:** Secure work outside the office. **Policy:** Company-managed or hardened endpoints; full-disk encryption; VPN/secure access for admin functions; no public/unsecured networks for production access; screen lock; comply with data-classification handling.
**Annex A:** A.6.7, A.8.1 · **SOC 2:** CC6.6, CC6.7.

## 2.17 Physical & Environmental Security Policy (cloud-provider inherited)
**Purpose:** Protect physical facilities and equipment. **Policy:** Data-center physical and environmental controls (secure areas, power, fire, media handling) are **inherited from the cloud/hosting provider (Render)** and validated via the provider's certifications/attestations — treated as a **carve-out sub-service organization** for SOC 2. Office endpoints follow endpoint and acceptable-use controls; media containing SPDI is securely wiped or destroyed before disposal.
**Annex A:** A.7.1–A.7.14 (inherited where cloud), A.7.10 (media), A.7.14 (secure disposal) · **SOC 2:** CC6.4, CC6.5.

## 2.18 Asset Management Policy
**Purpose:** Know and protect assets. **Policy:** Maintain an inventory of information assets, systems, repositories, and data stores with assigned owners and classification; ownership enforced via CODEOWNERS; assets returned on offboarding; acceptable-use rules apply; source code protected (A.8.4) and IP asserted via `LICENSE`.
**Annex A:** A.5.9, A.5.10, A.5.11, A.5.32 (IP), A.8.4 · **SOC 2:** CC6.1, CC3.2.

---

# §3 Privacy Management (DPDP Act 2023 · ISO/IEC 27701)

## 3.1 Privacy Policy & Notice (summary)
SwiftLoan acts as a **Data Fiduciary** (and, for lender-directed processing, a processor/joint arrangement). The privacy notice discloses: identity and contact of the fiduciary and **DPO/Grievance Officer**; categories of personal data collected (phone, name, DOB, income, PAN, Aadhaar last-4, bank last-4, email/pincode, credit score, voice via Ello); purposes (loan discovery, KYC facilitation, lender matching, communications); legal basis (consent / legitimate use / legal obligation); recipients (lender partners, Ello sub-processor); retention (per §2.4); cross-border transfer posture; and data-principal rights and how to exercise them. Notice is presented before/at collection in clear language.
**Maps to:** DPDP §5 (notice), §6 (consent) · ISO 27701 clauses on notice · **Annex A** A.5.34 · **SOC 2** P1, P2.

## 3.2 Consent Management
Consent is **free, specific, informed, unambiguous, and withdrawable**. The `Consent` model (terms / soft_pull / data_sharing / communications) is the record of consent. Consent must be captured and **checked before any partner/CIBIL bureau share or voice processing** (end-to-end wiring is a P1 remediation). Withdrawal is as easy as granting; withdrawal stops further processing and triggers retention/erasure where applicable.
**Maps to:** DPDP §6, §7 (withdrawal), CICRA (bureau-pull consent) · **Annex A** A.5.34 · **SOC 2** P2, P3.

## 3.3 DSAR / Data-Principal-Rights procedure
Rights supported: **access, correction, completion, update, erasure, and grievance redressal**; nomination per DPDP. Procedure: authenticate requester → log request → fulfill within the DPDP timeline → cover **all** stores including orphan PII (leads, ContextSession) and write to `AuditLog`. Current state: only user self-delete exists (`DELETE /me`); export/correct/erase for leads/context and audit logging are **P2 remediations (C10)**. Grievance Officer is the escalation and DPDP contact point.
**Maps to:** DPDP §11–§13 (rights, grievance) · **Annex A** A.5.34 · **SOC 2** P5, P6, P7.

## 3.4 Records of Processing Activities (RoPA)

| Processing activity | Purpose | Data categories | Legal basis | Recipients | Retention | Transfers |
|---|---|---|---|---|---|---|
| Account creation & auth | Identify user, secure login | Phone, name, DOB, hashed OTP | Consent / contract | Internal | Life of relationship | None |
| Loan eligibility & matching | Recommend lender offers | Income, employment, pincode, PAN, credit score | Consent / legitimate use | Lender partners | Per lender + RBI | India-region hosting |
| KYC facilitation | Support lender KYC | PAN (to be tokenized), Aadhaar last-4, bank last-4, selfie (stub) | Legal obligation (KYC) | Lender partners | Per RBI/CKYC | India-region |
| Voice assistant ("Ruby") | Conversational help | Voice/biometric-class, screen context | Consent (must be gated) | Ello/Getello (sub-processor) | Per DPA (to minimize) | Egress to Ello |
| Communications | Notify user | Phone, email, notification body | Consent | Internal / comms provider | Until withdrawn | None |
| Analytics/tracking | Product improvement | Event metadata (must exclude PII — C8) | Legitimate use | Internal | ≤ defined TTL | None |
| Lead capture (web/deep-link) | Pre-onboarding | Name, phone, city | Consent / legitimate use | Internal | ≤90 days (proposed) | None |

## 3.5 DPIA
A Data Protection Impact Assessment is required for high-risk processing (SPDI, biometric/voice egress, bureau pulls). The DPIA is maintained in **Doc 09 (Secure/Privacy/Compliance-by-Design)** and referenced here; DPIA-by-default is a stated principle. High-risk items (C1 PAN, C2 voice egress, C12 residency/DPA) are DPIA inputs.
**Maps to:** DPDP (Significant Data Fiduciary duties) · ISO 27701 · **Annex A** A.5.34 · **SOC 2** P.

---

# §4 SOC 2 Supplements

## 4.1 System Description (formal)
**Services provided.** SwiftLoan operates a digital lending marketplace/recommendation service (a DLA/LSP) enabling borrowers to discover and be matched to loan offers from RBI-regulated lenders. It does not lend or approve loans.
**System components.** (a) **Infrastructure:** cloud hosting (Render), PostgreSQL database, CI/CD (GitHub Actions). (b) **Software:** React Native mobile app, Node/Express/Prisma backend, Next.js admin dashboard, marketing website. (c) **People:** engineering, security (CISO), privacy (DPO/Grievance Officer), release management, support. (d) **Data:** PII/SPDI per the inventory (`_AUDIT_BRIEF.md` §3). (e) **Processes:** SDLC/change management (Doc 07), incident response, access management, monitoring.
**Boundaries.** In scope: the four applications, backend, database, and CI/compliance tooling. Out of scope / carved out: cloud-provider physical infrastructure; third-party voice AI (Ello) internal operations.
**Principal service commitments & system requirements:** confidentiality of SPDI, availability of the lending API (RTO/RPO §2.12), processing integrity of matching, and privacy per DPDP.
**Relevant TSC:** Security (CC), Availability (A), Confidentiality (C), Processing Integrity (PI), Privacy (P).

## 4.2 Complementary User Entity Controls (CUECs)
Controls that **lender partners / integrating entities** are responsible for:
- Protecting API credentials/keys issued to them and rotating on suspected compromise.
- Obtaining and honoring their own borrower consents where they act as controllers.
- Validating and securely handling data received from SwiftLoan; enforcing their own KYC/AML.
- Restricting access to SwiftLoan integrations to authorized personnel.
- Reporting suspected security/privacy incidents involving shared data promptly.

## 4.3 Sub-service organizations & method
| Sub-service org | Service | Method | Rationale |
|---|---|---|---|
| Render (hosting) | Infrastructure, physical/environmental, encryption-at-rest | **Carve-out** | Physical controls fully inherited; validated via provider attestations |
| Ello / Getello ("Ruby") | Voice AI processing of voice/screen context | **Carve-out** | Independent processor under DPA; controls out of SwiftLoan's operation |

Complementary sub-service organization controls (CSOCs) — e.g., provider physical security, environmental controls, host encryption — are relied upon and monitored via annual review of the sub-service organizations' certifications/reports.

## 4.4 Continuous control monitoring
Automated, continuous evidence: CI security gates (CodeQL, gitleaks, npm audit) on every push/PR + weekly schedule; Dependabot alerts; branch protection status checks; `scripts/compliance/compliance_sync.py` regenerating `COMPLIANCE-STATUS.md` from repo state; access reviews (quarterly); log monitoring. Exceptions are raised as CAPA and reviewed at management review.
**TSC:** CC4.1, CC4.2, CC7.1, CC8.1.

---

# §5 Document Register

| Doc | Title | Owner | Classification |
|---|---|---|---|
| 01 | Product Requirements Document | Product Lead | Internal |
| 02 | Technical Architecture Document | Engineering Lead | Confidential |
| 03 | Security & Compliance Document | CISO | Restricted |
| 04 | Test Cases Document | QA Lead | Internal |
| 05 | Statement of Applicability (SoA) | CISO | Restricted |
| 06 | Compliance Evidence Pack & Claims Matrix | CISO | Restricted |
| 07 | SDLC & Change Management Tracker | Head of Engineering | Confidential |
| 08 | ISMS Manual, Policies & Governance (this document) | CISO | Restricted |
| 09 | Secure-/Privacy-/Compliance-by-Design Principles | CISO | Restricted |
| 10 | ISO 27001 & SOC 2 Certification Readiness & Gap Assessment | CISO | Restricted |

---

## Appendix A — Control-to-clause/policy tag index (summary)

| ISO 27001:2022 theme | Covered by |
|---|---|
| A.5 Organizational | Clauses 4–6, §2.1, §2.9, §2.10, §2.11, §2.13, §2.18, §3 |
| A.6 People | Clause 7, §2.13, §2.16, §2.11 |
| A.7 Physical | §2.17 (cloud-inherited / carve-out) |
| A.8 Technological | Clause 8, §2.1–§2.8, §2.15, §2.6, §2.7 |

**SOC 2 TSC coverage:** CC1–CC9 across Clauses 5–10 and the policy set; **A** (§2.5, §2.12); **C** (§2.2, §2.3, §2.4); **PI** (§4.1); **P** (§3, §2.3, §2.4).

*End of Doc 08 — ISMS Manual, Policies & Governance. Maintained under change control; see Doc 07.*

# Security Policy

SwiftLoan handles sensitive financial and personal data (PII/SPDI) under India's
DPDP Act 2023 and RBI Digital Lending Guidelines. We take security seriously and
run an ISMS aligned to **ISO/IEC 27001:2022** and **SOC 2**.

## Supported versions

| Component | Supported |
|---|---|
| Mobile app (latest release) | ✅ |
| Backend API (`main`) | ✅ |
| Admin dashboard (`main`) | ✅ |
| Older tagged builds | ❌ (upgrade to latest) |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **security@swiftloan.example** (replace with the real security mailbox)
with:

- A description of the issue and its impact
- Steps to reproduce / proof of concept
- Affected component, version, and configuration

### Our commitment (SLA)

| Stage | Target |
|---|---|
| Acknowledgement | within 2 business days |
| Triage & severity assignment | within 5 business days |
| Fix or mitigation for critical issues | within 30 days |
| Coordinated disclosure | after a fix is available, by mutual agreement |

Security incidents that involve personal data are additionally handled per our
incident-response plan and reported to CERT-In within **6 hours** and to affected
data principals / the Data Protection Board per the DPDP Act, as applicable.

## Safe harbour

We will not pursue legal action against researchers who:

- Act in good faith and avoid privacy violations, data destruction, and service
  disruption
- Do not access, modify, or exfiltrate data beyond what is needed to demonstrate
  the issue
- Give us reasonable time to remediate before public disclosure

## Scope

In scope: the mobile app, backend API, admin dashboard, marketing website, and
their supporting infrastructure. Out of scope: third-party services (report to
the respective vendor), social engineering, and physical attacks.

## Handling of secrets and PII

- Never include real credentials, API keys, tokens, or customer PII in reports,
  issues, pull requests, logs, or test fixtures.
- Secret scanning (gitleaks) and SAST (CodeQL) run in CI; do not bypass them.

<!-- SwiftLoan pull request. Review is mandatory (segregation of duties): the
approver/merger must be different from the author. -->

## What & why

<!-- Summary of the change and the linked issue / requirement / finding (e.g. FR-xx, C-xx, R-Cx). -->

Closes:

## Type of change

- [ ] Feature
- [ ] Fix
- [ ] Security remediation
- [ ] Documentation / compliance
- [ ] Infrastructure / CI

## Testing

<!-- How was this verified? Unit/integration/security tests, manual QA, CI status. -->

## Security & compliance checklist (required)

- [ ] **No secrets** (API keys, tokens, passwords, `.env`) or real customer PII are committed
- [ ] Handles **PII/SPDI** per policy (minimised, encrypted/masked, not logged) — or N/A
- [ ] **Least privilege / secure defaults / fail-closed** preserved (no new open CORS, no default creds, no cleartext)
- [ ] **Consent / purpose limitation** respected for any new data use — or N/A
- [ ] **Tests** added/updated and passing; **CI** (lint, typecheck, security-scan) green
- [ ] **Threat considered**: describe any new attack surface and how it's mitigated
- [ ] Impact on documented controls (Docs 01–07) assessed; compliance docs updated if needed
- [ ] Change follows the SDLC gates (created → reviewed → tested → approved → merged)

## Reviewer notes

<!-- For the approver: confirm SoD (you are not the author) and that the checklist holds. -->

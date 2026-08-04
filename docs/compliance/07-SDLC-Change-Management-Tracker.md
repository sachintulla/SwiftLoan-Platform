# SwiftLoan — SDLC & Change-Management Tracker

> **Document ownership & accountable roles** — Product Owner: **Sridhar Muppidi** · Product Head: **Sachin Tulla** · Technical Head: **Sachin Tulla** · Head of Engineering: **Hari PS** · Security Head: **Anil M**.

| | |
|---|---|
| **Document ID** | SL-CMP-07 |
| **Version** | 1.0 |
| **Owner** | Engineering Lead / Release Manager |
| **Classification** | Confidential |
| **Status** | Live (maintained per change) |
| **Related** | Companion live log: `07-SDLC-Change-Management-Tracker.xlsx` |

> **Purpose (for auditors).** This document evidences that SwiftLoan follows a
> **controlled, repeatable Secure Software Development Life Cycle (SDLC)** in which
> every change is *created, reviewed, decomposed into tasks, assigned, implemented,
> tested, approved, and pushed/merged* through version control with traceable
> records. It is the human-readable companion to the live change log
> (`.xlsx`), which is populated from the project's real Git history and pull requests.

---

## 1. Applicable controls

This SDLC and its records provide evidence for:

| Framework | Control | How this document satisfies it |
|---|---|---|
| ISO/IEC 27001:2022 | **A.8.25** Secure development life cycle | Defined lifecycle stages & gates below |
| ISO/IEC 27001:2022 | **A.8.26** Application security requirements | Requirements captured in PRD, referenced per change |
| ISO/IEC 27001:2022 | **A.8.28** Secure coding | Peer review gate; lint/typecheck in CI |
| ISO/IEC 27001:2022 | **A.8.29** Security testing in development | Test stage; Jest suite + security test cases (Doc 04) |
| ISO/IEC 27001:2022 | **A.8.31** Separation of dev/test/prod | Feature branches → PR → main; deploy workflows |
| ISO/IEC 27001:2022 | **A.8.32** Change management | This tracker; PR review + approval before merge |
| ISO/IEC 27001:2022 | **A.8.4** Access to source code | Private GitHub repo; branch protection |
| SOC 2 (TSC) | **CC8.1** Change management | Documented, authorized, tested changes with evidence |
| SOC 2 (TSC) | **CC3.x / CC5.x** Risk & control activities | Review + approval gates; segregation of duties |

---

## 2. SDLC stages & exit gates

Every change (feature, fix, security remediation, or documentation) flows through
the following stages. Each stage has an **exit gate** — the change cannot advance
until the gate's evidence exists.

| # | Stage | What happens | Exit-gate evidence |
|---|-------|--------------|--------------------|
| 1 | **Created** | Work item raised (issue / requirement / finding) | Item logged with ID, date, requirement/control ref |
| 2 | **Reviewed** | Item triaged, scoped, risk-assessed, prioritized | Priority + acceptance criteria recorded |
| 3 | **Tasks defined** | Broken into implementable tasks | Task breakdown / sub-tasks recorded |
| 4 | **Assigned** | Owner (and reviewer/approver) assigned | Assignee recorded |
| 5 | **Fixed / Implemented** | Code written on a feature branch | Commit(s) on branch |
| 6 | **Tested** | Unit/integration/security tests run; QA | Test result / CI status; Jest/smoke evidence |
| 7 | **Approved** | Peer review + approval (segregation of duties) | PR review approval by a different person |
| 8 | **Pushed / Merged** | Merged to `main`; deployed via workflow | Merge commit / PR number; deploy run |

**Segregation of duties (SoD):** the person who **approves/merges** a change must be
different from the person who **implemented** it. In this project, implementation
is done by the feature author and approval/merge is performed by the release
manager via the GitHub Pull Request review, satisfying SoD (SOC 2 CC5.x, ISO A.5.3).

**Definition of Done:** a change is Done only when it has passed all eight gates —
tested, peer-approved, merged to `main`, and (for security-relevant changes)
reflected in the compliance documents (Docs 01–06) and the live control status
(`COMPLIANCE-STATUS.md`, auto-checked by the compliance-sync CI on `main`).

---

## 3. Toolchain & records (where the evidence lives)

| Activity | Tool | Auditable record |
|---|---|---|
| Version control | Git / GitHub (private) | Commit history, signed authorship, dates |
| Change review & approval | GitHub Pull Requests | PR number, reviewers, approval, merge commit |
| Branching model | feature branches → PR → `main` | Branch names, PR base/head |
| CI / build / lint / typecheck | GitHub Actions | Workflow runs, pass/fail status |
| Test | Jest (110 tests), API smoke, security test cases (Doc 04) | Test run logs, coverage |
| Deployment | GitHub Actions (`deploy-prod.yml`, dev deploy) | Deployment run history |
| Compliance drift control | `compliance-sync` workflow (main only) | `COMPLIANCE-STATUS.md`, CSV, PR gate |

---

## 4. How to read the live log (`.xlsx`)

The companion workbook contains:

- **Change Log** — one row per work item / pull request, with the date and
  actor for each of the eight lifecycle stages, the PR/commit reference, the
  test evidence, and the current status. Rows are drawn from **real** project
  history (PRs #2–#11 and their commits).
- **Security Remediation Backlog** — the C1–C14 findings / P0–P3 actions as
  tracked items, shown at their **current** SDLC stage (most are *Created → Tasks
  defined → Assigned*, awaiting implementation), so an auditor can see the
  pipeline for outstanding security work.
- **Approvals & Sign-off Register** — formal approvals (change, release,
  security, compliance) with approver, role, date, and decision.
- **Stage Legend & Control Mapping** — the stage definitions and the ISO/SOC 2
  controls each stage evidences.

---

## 5. Illustrative traceability (real examples from this project)

| Work item | Created → Merged | Evidence |
|---|---|---|
| Ello voice-command layer | Jul 2026 | commit `86013f2`; merged via PR #6 |
| Admin dashboard + tracking backend + website | Jul 2026 | commit `6845fc6`; PR #4 (MERGED) |
| Real Twilio OTP + screen drop-off tracking | Jul 2026 | commits `c8ed123`,`c784b3a`,`81c45ee`; PR #5 |
| WebRTC transport for voice | Jul 2026 | PR #9 (MERGED) |
| Name copilot "Ruby" + prompt refinement | Jul 31 2026 | commits `8aa2ab5`,`e2955c1` |
| Production deployment workflow | Aug 3 2026 | commit `df5d2ea` |
| **Compliance documentation suite + automated sync** | Aug 4 2026 | commit `6c1348c`; **PR #11 (open)** |
| Render diagrams to real images; embed architecture | Aug 4 2026 | commits `e0b5e25`,`2a082f8` (PR #11) |

Every ID in the live log resolves to a commit hash and/or PR number in the
GitHub repository, giving auditors an independently verifiable chain from
requirement → implementation → test → approval → production.

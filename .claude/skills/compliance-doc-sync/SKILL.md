---
name: compliance-doc-sync
description: Verify the SwiftLoan compliance documentation set (docs/compliance/ Docs 01–10) against the LATEST code on the main branch, report drift, and drive the document updates through Claude with human review. Use when asked to check, refresh, or sync the compliance/ISMS/audit documents, after code merges that touch security/PII/config surfaces (schema, routes, voice, render.yaml, seed, CI), or when preparing for an ISO 27001 / SOC 2 audit. This replaces the old compliance-sync GitHub Actions runner — nothing is auto-committed; Claude proposes changes for review.
---

# Compliance Doc Sync (skill)

Keep the ten compliance documents (`docs/compliance/01..10`) truthful against the
**latest code on `main`**. The old CI runner (`.github/workflows/compliance-sync.yml`)
was removed because auto-committing document edits back to `main` is the wrong
pattern. Instead, **a human runs this skill through Claude**: Claude verifies,
reports drift, and makes the edits, and the human reviews and commits.

## Golden rules
1. **Verify against `main` only.** Always compare the documents to the tip of
   `origin/main`, not the current working branch. Fetch first.
2. **Never auto-commit or push.** Propose edits, show a summary, let the user
   review. Only commit when the user says so, and prefer a feature branch.
3. **Do not overstate.** If a control is still open in the code, the docs must
   say so. Keep the honest posture (findings C1–C14; governance G5–G11).
4. **Preserve conventions:** the ownership block, the `_AUDIT_BRIEF.md` fact base,
   the Markdown → Word (`.docx`) pipeline, and the spreadsheet formats.

## Step 1 — Point at the latest main
```bash
git fetch origin
# Work from main's code for verification (do NOT switch the user's branch without asking).
# Option A (read-only inspect): git worktree add ../_main-check origin/main
# Option B (if already safe to): note the compliance docs may live on a feature
#          branch (e.g. develop) while the CODE to verify is origin/main.
git log --oneline -1 origin/main
```
The **documents** may live on `develop`/a feature branch; the **code of record**
for verification is `origin/main`. Verify the docs (current branch) against the
code on `origin/main`.

## Step 2 — Run the deterministic control checks
The engine `scripts/compliance/compliance_sync.py` runs the C1–C14 + G5–G11
control checks and detects drift in monitored source files. Run it in report mode:
```bash
python3 scripts/compliance/compliance_sync.py            # dry-run: prints status, writes nothing
python3 scripts/compliance/compliance_sync.py --update   # also (re)writes COMPLIANCE-STATUS.md, CSV, manifest, xlsx live-status
```
Read its output:
- The **control table** (Implemented / Open / Unknown) with ISO + SOC 2 tags.
- Any **DRIFT** line — monitored files changed since the last manifest snapshot —
  and the **affected controls**.
- It also appends newly-merged PRs to the SDLC Change Log (Doc 07 xlsx).

The monitored source files and control checks are defined in
`scripts/compliance/compliance_sync.py` (`MONITORED`, `CHECKS`). If the code adds
a new PII field, route, or config surface, extend those first.

## Step 3 — Compare each affected document to the code
For every control whose status **changed** and every monitored file that **drifted**,
open the documents that reference it and check they still match reality. Use the
`file:line` evidence in the control table and in `_AUDIT_BRIEF.md` (§5 concerns,
§9 gaps) as the map. Typical documents per area:
- Data model / PAN / PII → `03-Security-and-Compliance`, `02-Technical-Architecture`, `05-Statement-of-Applicability` (SoA), `06-Evidence-Pack`.
- Auth / secrets / CORS / config → `03`, `02`, `08-ISMS-Manual`, `10-Certification-Readiness`.
- Voice egress / transport → `02`, `03`, `09-by-Design`.
- CI / governance artifacts → `08`, `10`, `07-SDLC`.
- Any new requirement → `01-PRD`.

For each: does the narrative, the status column, the SoA entry, the risk register,
and the test case still reflect the code? If a finding was **remediated** in code,
flip it from Open → Implemented in the docs and update the evidence; if a **new**
risk appeared, add it (assign an ID, ISO/SOC 2 tags, remediation, owner).

## Step 4 — Make the edits (Markdown is the source of truth)
- Edit the **`.md`** files under `docs/compliance/`; keep the ownership block and
  the `_AUDIT_BRIEF.md` consistent (update the brief first if a fact changed).
- Regenerate the **Word** outputs from the changed Markdown (this repo's pipeline
  uses pandoc; embed images via `--resource-path docs/compliance`):
  ```bash
  # per changed doc, e.g.:
  pandoc docs/compliance/03-Security-and-Compliance-Document.md \
    -o docs/compliance/03-Security-and-Compliance-Document.docx \
    --toc --toc-depth=3 --standalone --resource-path docs/compliance
  ```
- For the spreadsheet docs (05 SoA, 06 Evidence Pack, 07 tracker), update via
  their generators or `openpyxl`; the live control-status sheet is refreshed by
  `compliance_sync.py --update`.
- Word-only doc set is the current convention (no PDFs) unless the user asks.

## Step 5 — Report, don't auto-commit
Summarize to the user:
- Controls that changed status (with `file:line` evidence).
- Which of Docs 01–10 you edited and why.
- Anything that needs a human decision (a genuinely new risk, a policy change).
Then **stop** and let the user review. Commit only on request; if you do, use a
feature branch and a clear message — never push document edits straight to `main`.

## What this skill is NOT
- Not a CI job. It does not run on push and does not commit on its own.
- Not a substitute for the actual security remediation (C1–C14) — it keeps the
  *documents* honest about the code; fixing the code is separate work.

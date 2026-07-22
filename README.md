# SwiftLoan — Build Prompts

Extends the existing SwiftLoan app with an activity tracking layer
and a full admin dashboard — without touching any existing code.

---

## What is already built (do not touch)

- `src/` — 29 React Native screens, custom state machine, 110 tests
- `server/` — Node + Express + Prisma + PostgreSQL backend on port 4000
- Existing Prisma models: User, LoanApplication, Offer, Loan, Repayment
- Existing server routes: auth, users, applications, kyc, loans,
  catalog, tools, support

---

## What these prompts build

| Agent | What it builds | Touches |
|---|---|---|
| `swiftloan-backend` | Tracking APIs + admin APIs + new Prisma models + BullMQ jobs | `server/` only (additive) |
| `swiftloan-admin` | Full admin dashboard (Next.js 14) in new `admin/` folder | New `admin/` only |
| `swiftloan-mobile` | Tracking side-effects in `src/api/client.ts` | `client.ts` + `store.ts` only |

---

## Files in this folder

| File | Purpose |
|---|---|
| `CLAUDE.md` | Copy to SwiftLoan project root — preserves existing content, adds progress tracker |
| `backend-prompt.txt` | Extends server/ with tracking + admin APIs |
| `admin-dashboard-prompt.txt` | Builds admin/ dashboard (Next.js 14, port 4001) |
| `mobile-prompt.txt` | Adds tracking to src/api/client.ts only |
| `build-all.sh` | Launches all 3 agents in parallel |
| `resume-all.sh` | Resumes all 3 after credit reset |

---

## Setup

### Step 1 — Copy CLAUDE.md to your project root
```bash
cp CLAUDE.md /path/to/swiftloan/CLAUDE.md
```
This merges the progress tracker into the existing CLAUDE.md.
The existing content is preserved exactly — new sections are appended below a
clear separator.

### Step 2 — Copy prompt files and scripts to project root
```bash
cp *.txt *.sh /path/to/swiftloan/
cd /path/to/swiftloan
chmod +x build-all.sh resume-all.sh
```

### Step 3 — Make sure server/ is running (for the mobile tracking to have an endpoint)
```bash
cd server && npm start
```

### Step 4 — Launch all 3 agents
```bash
./build-all.sh
```

---

## Monitor

```bash
claude agents                        # see all running sessions
claude attach swiftloan-backend      # watch backend in real time
claude attach swiftloan-admin        # watch admin build
claude attach swiftloan-mobile       # watch mobile tracking additions
```

Press `Ctrl+C` or type `/background` to detach without stopping.

---

## After credit reset

```bash
./resume-all.sh
```

Agents read CLAUDE.md, see the progress checkboxes, and continue
from exactly where they stopped.

---

## Ports

| Service | Port |
|---|---|
| Existing server/ API | http://localhost:4000 |
| New admin/ dashboard | http://localhost:4001 |
| Mobile (Metro) | 8081 |

---

## Verify nothing broke in mobile app

After `swiftloan-mobile` agent finishes:
```bash
npm test          # must still show 110 tests passing
npm run typecheck # must pass with 0 errors
npm run lint      # must pass
```

---

## Troubleshooting

**Agent stopped mid-build:**
```bash
claude --resume swiftloan-backend   # or swiftloan-admin / swiftloan-mobile
```

**Check what was built:**
```bash
cat CLAUDE.md   # look at Build progress section
```

**Verify backend extension works:**
```bash
cd server && npm run smoke          # existing 21 checks must still pass
```

**Verify admin dashboard:**
```bash
cd admin && npm run dev             # should start on port 4001
```

# Infrastructure & Deployment Runbook

Written 2026-08-12. Covers both environments as they are actually configured
right now — machine access, env files, DNS, SSL, the deploy pipeline, and how
to make common changes. Secrets are deliberately **not** duplicated into this
file (see [Env files](#env-files-and-how-to-edit-them)) — it stays safe to
commit and share.

## Machines

| | Dev | Prod |
|---|---|---|
| Public IP | `35.154.46.155` | `13.232.60.204` |
| Hostname | `ip-10-10-1-233` | `ip-10-20-1-186` |
| SSH | `ssh ubuntu@35.154.46.155` | `ssh ubuntu@13.232.60.204` |
| GitHub Actions runner dir | `~/actions-runner` | `~/actions-runner-prod` |
| Runner registered name | `ip-10-10-1-233` | `ip-10-20-1-186` |
| Env file | `~/secrets/server.env` | `~/secrets/server.env` (separate file, same path, different box) |
| Repo checkout (used by the runner) | `~/actions-runner/_work/SwiftLoan-Platform/SwiftLoan-Platform` | `~/actions-runner-prod/_work/SwiftLoan-Platform/SwiftLoan-Platform` |

Both boxes run three Docker containers, same ports on each:

| Container | Port | Serves |
|---|---|---|
| `swiftloan-api` | 4000 | `server/` — Express + Prisma + Postgres |
| `swiftloan-admin` | 4001 | `admin/` — Next.js admin dashboard |
| `swiftloan-website` | 4002 | `website-next/` — Next.js marketing site |

nginx on each box reverse-proxies the public domains to these ports and
terminates SSL (Let's Encrypt via Certbot).

## Domains & DNS

DNS is managed at **Namecheap** (nameservers `dns1`/`dns2.registrar-servers.com`),
not Route53. To check a record directly against the authoritative server
(bypasses caching):

```bash
dig @dns1.registrar-servers.com <hostname> A +short
```

| Domain | Points to | Backend | SSL |
|---|---|---|---|
| `dev.swiftloan.ai` | dev box | website:4002 | ✅ Certbot |
| `admindev.swiftloan.ai` | dev box | admin:4001 (office-IP restricted) | ✅ Certbot |
| `dev-api.swiftloan.ai` | dev box | server:4000 | ✅ Certbot |
| `swiftloan.ai` | prod box | website:4002 | ✅ Certbot |
| `admin.swiftloan.ai` | prod box | admin:4001 (office-IP restricted) | ✅ Certbot |
| `api.swiftloan.ai` | prod box | server:4000 | ✅ Certbot |
| `www.swiftloan.ai` | ⚠️ **still the old GitHub Pages site** (`sachintulla.github.io`), NOT migrated | — | GitHub's own cert (unrelated to us) |

**`www.swiftloan.ai` is a known open gap** — it was never repointed when the
bare `swiftloan.ai` domain was migrated to the prod box, so it still serves an
old, separate, unfixed codebase (a different repo,
`sachintulla/swiftloan-website`, deployed via GitHub Pages). To migrate it:
Namecheap → `swiftloan.ai` → Advanced DNS → change the `www` record from a
CNAME (`sachintulla.github.io`) to an `A` record → `13.232.60.204`, then add
`www.swiftloan.ai` to the nginx `server_name` for `swiftloan.ai` on the prod
box and re-run Certbot for it. Whoever currently holds Namecheap access needs
to make the DNS half of this — it wasn't available during this session.

### AWS Security Group (prod)

Prod's EC2 security group did **not** allow inbound traffic on ports 80/443
from the internet by default — this had to be opened manually (EC2 Console →
instance → Security tab → Security group → Edit inbound rules → add HTTP/80
and HTTPS/443 from `0.0.0.0/0`) before Certbot or any external visitor could
reach it. Dev's security group was already open. Nothing else needs to be
opened — the app's own ports (4000/4001/4002) are only proxied through nginx,
never exposed directly, and the database/Docker daemon are not internet-facing.

## Env files and how to edit them

**Both boxes read exactly one file each: `~/secrets/server.env`.** It is
*not* tracked in git, and is *not* GitHub Secrets/Variables — it's a plain
file living only on that box, read by `.github/workflows/deploy.yml` (dev)
and `deploy-prod.yml` (prod) via `source ~/secrets/server.env` /
`--env-file ~/secrets/server.env` / `--build-arg X="$X"`.

To change a value: SSH into the box, edit `~/secrets/server.env` directly
(`nano ~/secrets/server.env` or `sed -i 's|OLD|NEW|' ~/secrets/server.env`),
then redeploy so the new value actually gets picked up — env vars only take
effect on the next container rebuild, not live.

**This file is never pasted into git, Slack, or any document that
persists.** Everything below documents variable *names* and *purpose*, not
their live values — check the file on the box for the actual current value.

### Server vars (unprefixed — read directly by `server/`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (RDS — different DB per environment) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Mobile-app/API auth token signing (generated fresh per box, never shared between dev/prod) |
| `NODE_ENV` | `development` (dev) / `production` (prod) |
| `DEMO_LOGIN` | `true` on dev, `false` on prod |
| `SMS_PROVIDER`, `TWILIO_*` | OTP delivery (Twilio creds currently shared between dev/prod — explicit decision) |
| `AWS_REGION`, `S3_BUCKET_NAME` | Avatar/asset uploads |
| `PORT` | `4000` |
| `ELLO_API_KEY` | Server-side key used by `/api/voice/session` to call Ello's API (shared dev/prod — explicit decision) |
| `ELLO_AGENT_ID` | Workspace-default Ello agent id, used when no role-specific override exists — see `server/src/lib/agents.ts` |
| `ELLO_BASE_URL` | Ello API host override; unset = defaults to `https://api.getello.ai` |
| `PUBLIC_BASE_URL` | ⚠️ **Not currently set on either box.** Used by `server/src/config/downloads.ts` for QR/app-download links; without it, that one feature falls back to a dead `onrender.com` URL. Low priority (doesn't affect auth, voice, or lead capture) but worth fixing before those links are used for real. |

### Next.js build-time vars (baked in at `docker build`, one set per app)

Same variable names, prefixed per app — `ADMIN_NEXT_PUBLIC_*` for `admin/`,
`WEBSITE_NEXT_PUBLIC_*` for `website-next/`:

| Suffix | Purpose |
|---|---|
| `_API_BASE` | Which backend the app's browser code calls — **must be `https://`**, not `http://`, or the browser blocks every API call as mixed content once the page itself is HTTPS. Currently `https://dev-api.swiftloan.ai` (dev) / `https://api.swiftloan.ai` (prod). |
| `_ELLO_API_KEY` | Informational only in the current code — the real session-creation call is brokered server-side (`/api/voice/session`); this browser-facing key is not actually used for auth. |
| `_ELLO_ASSISTANT_ID` | Same — informational, server resolves the real agent id itself. |
| `_ELLO_API_BASE`, `_ELLO_WS_URL` | Fallback values if the browser client is ever changed to talk to Ello directly; currently overridden by whatever the server's `/api/voice/session` response returns. |

These are build-time, not runtime — changing them requires rebuilding that
app's Docker image (see [Making a change](#making-a-change-manually-without-the-pipeline)).

## The deploy pipeline

- Push to `develop` → `.github/workflows/deploy.yml` → should land on the dev
  runner → rebuilds all three containers on the dev box.
- Push to `main` → `.github/workflows/deploy-prod.yml` → should land on the
  prod runner → rebuilds all three containers on the prod box.

### Known issue: the runner "coin-flip"

Both boxes' GitHub Actions runners share the generic `self-hosted` label —
GitHub can't tell them apart, so `runs-on: self-hosted` may route a job to
*either* box regardless of which branch triggered it. A safety step
("Ensure this landed on the dev/prod box") checks `hostname` and aborts
loudly if it's wrong, so a misroute never actually deploys to the wrong
machine — it just fails that run.

**Fix when this happens:** go to the Actions tab → the failed run → **Re-run
failed jobs**. It typically takes 1–3 attempts to land correctly. This is not
yet permanently fixed — see the `TODO` comment at the top of both workflow
files. The real fix (add a unique custom label to each runner via
**Settings → Actions → Runners** — not just checking its name) needs repo
admin/runner permissions that weren't available during this session.

### Making a change manually, without the pipeline

Useful when iterating quickly or when the coin-flip is being annoying. Run
directly on the target box:

```bash
cd ~/actions-runner/_work/SwiftLoan-Platform/SwiftLoan-Platform   # or actions-runner-prod on prod
git pull origin develop   # or main, on prod

# --- server ---
cd server
docker build -t swiftloan-api .
set -a; source ~/secrets/server.env; set +a
docker run --rm --env-file ~/secrets/server.env swiftloan-api npx prisma migrate deploy
docker stop swiftloan-api && docker rm swiftloan-api
docker run -d --name swiftloan-api --restart unless-stopped --env-file ~/secrets/server.env -p 4000:4000 swiftloan-api

# --- admin ---
cd ../admin
docker build \
  --build-arg NEXT_PUBLIC_API_BASE="$ADMIN_NEXT_PUBLIC_API_BASE" \
  --build-arg NEXT_PUBLIC_ELLO_API_KEY="$ADMIN_NEXT_PUBLIC_ELLO_API_KEY" \
  --build-arg NEXT_PUBLIC_ELLO_ASSISTANT_ID="$ADMIN_NEXT_PUBLIC_ELLO_ASSISTANT_ID" \
  --build-arg NEXT_PUBLIC_ELLO_API_BASE="$ADMIN_NEXT_PUBLIC_ELLO_API_BASE" \
  --build-arg NEXT_PUBLIC_ELLO_WS_URL="$ADMIN_NEXT_PUBLIC_ELLO_WS_URL" \
  -t swiftloan-admin .
docker stop swiftloan-admin && docker rm swiftloan-admin
docker run -d --name swiftloan-admin --restart unless-stopped -p 4001:4001 swiftloan-admin

# --- website ---
cd ../website-next
docker build \
  --build-arg NEXT_PUBLIC_API_BASE="$WEBSITE_NEXT_PUBLIC_API_BASE" \
  --build-arg NEXT_PUBLIC_ELLO_API_KEY="$WEBSITE_NEXT_PUBLIC_ELLO_API_KEY" \
  --build-arg NEXT_PUBLIC_ELLO_ASSISTANT_ID="$WEBSITE_NEXT_PUBLIC_ELLO_ASSISTANT_ID" \
  --build-arg NEXT_PUBLIC_ELLO_API_BASE="$WEBSITE_NEXT_PUBLIC_ELLO_API_BASE" \
  --build-arg NEXT_PUBLIC_ELLO_WS_URL="$WEBSITE_NEXT_PUBLIC_ELLO_WS_URL" \
  -t swiftloan-website .
docker stop swiftloan-website && docker rm swiftloan-website
docker run -d --name swiftloan-website --restart unless-stopped -p 4002:4002 swiftloan-website
```

(The pipeline uses `--no-cache` on every build; dropped here for speed on
manual runs since only one file usually changed. Add it back if you've hit a
stale-dependency issue before.)

## SSL (Certbot)

Both boxes use Let's Encrypt via Certbot directly against nginx — no AWS ACM,
no Load Balancer. Certs auto-renew (Certbot installs its own systemd timer).
To add SSL to a new domain:

```bash
sudo certbot --nginx -d <domain> --email <email1,email2,...> --agree-tos --non-interactive
```

Requires port 80 open in the security group for the HTTP-01 challenge (see
[AWS Security Group](#aws-security-group-prod) above if this fails with a
connection timeout).

## Admin dashboard logins

Never seed real environments with `server/prisma/seed.ws4.ts` — that creates
demo admins with a published, shared password, for local dev only.

To create a real admin login on dev or prod:

```bash
cd <server checkout>
set -a; source ~/secrets/server.env; set +a
docker run --rm --env-file ~/secrets/server.env swiftloan-api npx tsx scripts/create-admin.ts \
  --email "you@yourcompany.com" --password "<your own strong password>" \
  --name "Your Name" --role super_admin
```

This hashes the password with bcrypt (same as real login) and forces a
password change on first sign-in. Password policy (enforced both
server-side and, more strictly, client-side — see
`admin/src/lib/password.ts` vs `server/src/lib/adminSecurity.ts`, a known
inconsistency worth reconciling): 12+ characters, upper+lower+digit, and not
a predictable word/sequence.

## Ello voice integration

Which Ello agent a call role uses is resolved in `server/src/lib/agents.ts`,
in this order: dashboard override → `ELLO_AGENT_<ROLE>` env var → the
workspace default (`ELLO_AGENT_ID`). The API key and agent id currently
configured are shared between dev and prod (explicit decision, same as
Twilio). If the voice widget connects but the agent never speaks or
acknowledges tools, that's an Ello-dashboard-side configuration issue for
that specific agent id (e.g. not set to "Native Mode"), not a code or env
problem — confirmed by full request/response logs during this session.

# SwiftLoan — backend ecosystem

Scalable local backend for the SwiftLoan app.
**Node + Express + TypeScript + Prisma + PostgreSQL.**

## Architecture

```
server/
  prisma/schema.prisma   full data model (12 tables) derived from the app flow
  prisma/seed.ts         lender-partner catalog
  src/
    config/env.ts        env loading/validation
    lib/                 prisma client, JWT, crypto (bcrypt, sha256, OTP)
    middleware/          requireAuth, zod validate, central error handler
    modules/*.routes.ts  auth, users, applications, kyc, loans, catalog, tools, support
    utils/               EMI math, reference generator
    app.ts               express app (helmet, cors, rate-limit, routers)
    index.ts             bootstrap + graceful shutdown
    smoke.ts             end-to-end API smoke test (21 checks)
```

**Scalability:** stateless JWT auth (access + rotating refresh tokens), bcrypt
password hashing, Zod request validation, Helmet + CORS + per-route rate limiting,
Prisma connection pooling, DB indexes on hot paths, UUID PKs, audit-log table,
graceful shutdown. Point `DATABASE_URL` at any managed Postgres to scale out; the
process is horizontally scalable (no local state).

## Data model (from the app flow)

`User` · `OtpToken` · `RefreshToken` · `Consent` · `LoanApplication` ·
`LenderPartner` · `Offer` · `KycVerification` · `Loan` · `Repayment` ·
`SupportTicket` · `AuditLog`.

Flow mapping: onboarding/login → `User`/`OtpToken`; application funnel →
`LoanApplication` → `Offer` → (select) → `Loan` + `Repayment[]`; KYC screens →
`KycVerification`; profile → `User` + `Consent`; help → `SupportTicket`.

## Run locally

```sh
cd server
npm install
# Postgres must be running; create the DB once:
createdb swiftloan_db
# apply schema + generate client:
DATABASE_URL="postgresql://<user>@localhost:5432/swiftloan_db?schema=public" \
  npx prisma db push
npm run seed        # lender partners
npm start           # http://localhost:4000
npm run smoke       # end-to-end test against the running server
```

Config lives in `.env` (see `.env.example`).

## API reference

Base URL `http://localhost:4000/api`. Auth = `Authorization: Bearer <accessToken>`.

### Auth (`/auth`)
| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/register` | `{phone, email?, password?, lang?}` | creates user, sends OTP (dev returns `devOtp`) |
| POST | `/otp/request` | `{phone}` | request login OTP |
| POST | `/otp/verify` | `{phone, code}` | **primary login** → `{user, accessToken, refreshToken}` |
| POST | `/login` | `{identifier, password}` | password login |
| POST | `/refresh` | `{refreshToken}` | new access token |
| POST | `/logout` | `{refreshToken}` | revoke |

> Dev OTP is always `123456` (matches the app's demo login).

### Users (`/users`, auth)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me` | current profile |
| PATCH | `/me` | **update user information** (name, dob, gender, pincode, employment, income, PAN…) |
| PATCH | `/me/language` | display language |
| PATCH | `/me/notifications` | notification prefs |
| POST | `/me/consents` | record consent |
| GET | `/me/credit-score` | CIBIL score + factors |
| DELETE | `/me` | right-to-erasure |

### Applications (`/applications`, auth)
`POST /` · `GET /` · `GET /:id` · `PATCH /:id` (details/PAN) ·
`POST /:id/prequalify` (generate offers) · `GET /:id/offers` ·
`POST /:id/offers/:offerId/select` · `POST /:id/handoff` (disburse → creates loan).

### KYC (`/kyc`, auth)
`POST /:method` (`aadhaar|pan|bank|selfie`) · `GET /`.

### Loans (`/loans`, auth)
`GET /` · `GET /:id` (with schedule + progress) · `GET /:id/repayments` ·
`POST /:id/repayments/:rid/pay`.

### Catalog / Tools / Support
`GET /catalog/partners` (public) · `POST /tools/emi` (public EMI calc) ·
`POST /support/tickets` · `GET /support/tickets`.

`GET /health` — liveness probe.

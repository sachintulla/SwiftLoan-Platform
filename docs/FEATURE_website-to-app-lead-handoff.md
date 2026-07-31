# Feature plan: surface website inquiries to the in-app voice agent

Status: **planned, not built**. This doc is the complete design so anyone can
implement it without re-deriving the plan. All file/line references below were
verified against the actual code on 2026-07-30.

## The problem

A visitor fills the website's "check your rate" form (name, phone, email,
city, loan type, amount) and leaves without installing the app. Later, they
install the app and log in with the **same phone number**. Today the app has
no idea this person already inquired — the in-app voice agent starts cold.

## The goal

When that phone number logs in (OTP verified), the in-app voice agent should
know about every prior website inquiry for that number and bring it up
naturally — e.g. *"I see you checked rates for a personal loan on our
website — want to continue with that?"* — instead of starting from zero.

## Decisions already made (don't re-litigate these)

1. **Multiple prior inquiries for the same phone**: don't silently pick one
   (not "most recent wins"). Hand **all** of them to the agent and let it
   *ask the visitor* which one they meant, conversationally.
2. **No staleness window.** A 6-month-old inquiry is surfaced exactly the
   same as a 6-minute-old one. Always query, every login, no time filter.
3. **In-app voice agent only.** No admin-dashboard UI work. A human ops
   person does not need to see this anywhere new.
4. **WhatsApp link on website submit** is a separate, already-planned
   initiative — explicitly out of scope here. Don't touch it.
5. **Every login re-surfaces it** — no "only show this once" suppression.
   The agent may mention prior inquiries on every session for that user,
   not just the first one after signup.

## What already exists (don't rebuild this)

- **`AnonymousLead` model** — `server/prisma/schema.prisma:411-430`. Already
  created on every website form submission (via `POST /api/context/create`,
  `server/src/modules/context.routes.ts`). Fields that matter here: `phone`,
  `productInterest` (loan type), `amount` (paise), `status: LeadStatus`
  (`new|contacted|qualified|converted|lost`), `convertedUserId` (a bare
  `String?`, **not a real FK/relation**, and confirmed via grep that
  **nothing in the codebase currently writes to it** — it's dead weight
  today, but exactly the field this feature finally puts to use).
- **Phone format is already compatible across both sides**, no normalization
  needed: the website form validates `^[6-9]\d{9}$` before creating the
  lead; the app's OTP schema validates `^\d{10}$`; the `User` model stores
  `phone` as a raw 10-digit string, no `+91` prefix, `@unique`
  (`server/prisma/schema.prisma:49`). A direct string equality match works.
- **`ContextSession`** (a *different*, already-built mechanism, token-based
  not phone-based — don't confuse the two) is the existing "continue on the
  app" deep-link flow. It's unrelated to this feature; leave it alone.

## What's new

### 1. Backend — `server/src/modules/auth.routes.ts`

Current code (lines 68–83):

```ts
authRouter.post(
  '/otp/verify',
  validate(z.object({ phone: phoneSchema, code: z.string().length(6) })),
  ah(async (req, res) => {
    const { phone, code } = req.body;
    const otp = await prisma.otpToken.findFirst({
      where: { phone, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.codeHash !== sha256(code)) throw new HttpError(400, 'Invalid or expired OTP');
    await prisma.otpToken.update({ where: { id: otp.id }, data: { consumed: true } });
    const user = await prisma.user.update({ where: { phone }, data: { phoneVerified: true } });
    const tokens = await issueTokens(user.id, user.phone);
    res.json({ user: publicUser(user), ...tokens });
  }),
);
```

Add, right after `user` is resolved and before `res.json(...)`:

```ts
const matchingLeads = await prisma.anonymousLead.findMany({
  where: { phone }, // no status/date filter — decision #2 above
  orderBy: { createdAt: 'asc' },
});
if (matchingLeads.length) {
  await prisma.anonymousLead.updateMany({
    where: { id: { in: matchingLeads.map(l => l.id) } },
    data: { status: 'converted', convertedUserId: user.id },
  });
}
const priorInquiries = matchingLeads.map(l => ({
  productInterest: l.productInterest,
  amount: l.amount,       // paise, same convention as everywhere else
  createdAt: l.createdAt,
}));
res.json({ user: publicUser(user), ...tokens, priorInquiries });
```

Notes for whoever builds this:
- Marking **every** matching lead `converted` (not just "the one they pick")
  is intentional — the choice of which one to continue with is a live
  conversation in the voice agent, not a DB write-back. All of them are now
  correctly associated with this user for data hygiene either way.
- `priorInquiries` is always present in the response, `[]` when there's
  nothing (simpler for the client than an optional field).
- Do the same addition to `/otp/verify`'s test coverage if any exists
  (`server/` test suite) — check `npm run smoke` in `server/` still passes.

### 2. Mobile app — `src/api/client.ts`

`AuthResult` (line 124) needs the new field:

```ts
export interface AuthResult {
  user: Record<string, any>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  priorInquiries: Array<{ productInterest: string | null; amount: number | null; createdAt: string }>;
}
```

`verifyOtp` (line 150) already just returns the server's JSON as `AuthResult`
— no logic change needed there, only the type above.

**Important**: the offline/demo fallback path, `demoAuth()` (line 108),
returns a hand-built `AuthResult` and does **not** hit the real server — it
must also return `priorInquiries: []` (add it to that object) or every
offline-demo login will crash on the new required field.

### 3. Mobile app — `src/state/store.ts`

Add a field next to the existing `contextData` (same pattern, line 80):

```ts
priorInquiries: Array<{ productInterest: string | null; amount: number | null; createdAt: string }>;
```

Default `[]` in `initialState` (near line 106, alongside `contextData: null`).

Set it at the OTP-verify call site — `src/screens/mobile.tsx:42-44`:

```ts
const r = await api.verifyOtp(state.mobileVal, otp.join(''));
set({ authUser: r.user, otpSent: false, priorInquiries: r.priorInquiries });
go('permissions');
```

### 4. Mobile app — feed it to the voice agent

The page-context provider is registered exactly once, here —
`src/state/store.ts:239`:

```ts
agent.registerPageContext(() => buildPageContext(stateRef.current.screen));
```

Change to also spread in `priorInquiries`:

```ts
agent.registerPageContext(() => ({
  ...buildPageContext(stateRef.current.screen),
  priorInquiries: stateRef.current.priorInquiries,
}));
```

No change needed inside `buildPageContext` itself
(`src/voice/actionRegistry.ts:164`) — this keeps the new field additive and
doesn't touch the already-carefully-tuned `page`/`interactionGuide.opening`
greeting mechanism documented there (the one that gates whether the agent
speaks first at all — see the comment at `actionRegistry.ts:169-175`, don't
break it).

### 5. Prompt update (mobile app's assistant, on the Ello dashboard)

Whatever system prompt is currently configured for the mobile app's
assistant (see `prompts/ello-inapp-copilot-prompt.md` if that's the one in
use) needs a new paragraph, e.g.:

> If `priorInquiries` in the page context is non-empty: this person already
> inquired on the SwiftLoan.ai website before installing the app. If there's
> exactly one entry, mention it naturally early in the conversation and offer
> to continue with that loan type/amount instead of starting over. If there
> are multiple entries, briefly list them and ask which one they'd like to
> continue with — don't guess or pick for them.

## API contract summary

**`POST /auth/otp/verify` response** (new field only, rest unchanged):

```json
{
  "user": { "...": "..." },
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 900,
  "priorInquiries": [
    { "productInterest": "Personal Loan", "amount": 50000000, "createdAt": "2026-05-12T10:22:00.000Z" }
  ]
}
```

(`amount` in paise, same convention as the rest of the backend —
₹5,00,000 → `50000000`.)

## Explicitly out of scope (don't do this here)

- WhatsApp link on website submission — separate initiative, planned later.
- Any admin-dashboard change — no new Lead-detail UI, no new column.
- Any staleness/expiry logic on `AnonymousLead` rows.
- Deduping or "only mention once" logic — every login re-surfaces it.
- Touching `ContextSession` / the token-based deep-link flow — unrelated,
  leave as-is.

## Test checklist

1. Submit the website lead form once with phone `9876543210`, loan type
   Personal Loan, amount 500000. Confirm an `AnonymousLead` row exists
   (`status: new`, `convertedUserId: null`).
2. In the app, request + verify OTP for `9876543210`. Confirm the response
   includes `priorInquiries` with that one entry, and the `AnonymousLead` row
   flips to `status: converted`, `convertedUserId` set.
3. Repeat step 1 twice more with different loan types/amounts for the same
   phone number *before* running step 2. Verify all three come back in
   `priorInquiries` and all three get marked converted.
4. Log in with a phone number that never submitted the website form — verify
   `priorInquiries: []` and no crash/behavior change.
5. Test the offline/demo login path (`demoAuth`) still works after adding the
   required field to `AuthResult`.
6. With a live Ello voice session (Native Mode assistant configured with the
   updated prompt), verify the agent actually mentions the prior inquiry/
   inquiries and asks which one when there's more than one — this is a
   prompt-behavior check, not just a data-plumbing check.

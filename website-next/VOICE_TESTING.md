# Voice widget — testing

The website voice assistant (Ruby) is agent **`6a7197ff89c98da763e29b23`** ("Website companion app", role
`websiteCompanion`). The browser holds no Ello key or agent id: the widget calls our API
(`POST /api/voice/session`, role `websiteCompanion`) and the server resolves the agent from the dashboard override,
`ELLO_AGENT_WEBSITE_COMPANION`, or `ELLO_AGENT_ID`. The prompt lives in
[`prompts/ello-website-next-navigator-prompt.md`](../prompts/ello-website-next-navigator-prompt.md) and must be set on
that agent in **Native Mode (Gemini Live)**, or it will talk but never call a tool (the console logs
`no tools-ack after 5s`).

## Run it locally

Launch configs (`.claude/launch.json`): `mock-aurix` (:4010), `server-mock-aurix` (:4000, `SMS_PROVIDER=none`,
`DEV_MASTER_OTP=123456`), `website-next` (:4002). `NEXT_PUBLIC_API_BASE=http://localhost:4000` in `.env.local`.
Open the site, tap Ruby bottom-right, allow the microphone.

## Manual voice script

The full script (21 lines to say, with the expected result for each) is at the bottom of the prompt file.

## Automated check — no microphone needed

Every tool can be called from the browser console. The agent keeps them in a map:

```js
const ag = window.__swiftloanVoice;
const T = (n, a = {}) => ag.tools.get(n).handler(a);   // returns the real result the model would see

await T('read_screen');                                  // heading, step, controls + state, offer cards, table, messages
await T('select_loan_type', { loan_type: 'Business Loan' });
await T('set_loan_amount', { amount: 700000 });          // snaps to ₹5,000; `warning` outside the product range
await T('fill_phone', { phone: '9876543210' });
await T('submit_application');                           // → { awaiting_otp: true }
await T('fill_field', { label: 'Digit 1 of 6', value: '1' });   // → refused (sensitive) — always
ag.pageContextFn();                                      // exactly what the model is told: account, screen, alreadyFilled…
```

Things worth re-checking after a change to a page (these are what broke before):

| Check | Expect |
|---|---|
| `T('fill_phone')` on home | fills the **lead-form** field, not the hero one (`#lead-form [name=mobile]`). |
| `T('set_loan_amount')` | `alreadyFilled.amount` updates (the amount lives behind a Radix slider, set via `window.__swiftloanLead`). |
| `T('set_calculator', {amount:1000000, rate:12, tenure:24})` | returns the **new** EMI (₹47,073), not the old one. |
| `T('navigate_to_page', {page:'profile'})` signed out | `sign_in_required`, and the page really is `/apply`. |
| `T('press_button', {label:'Submit ticket'})` etc. | `needs_confirmation` until `user_confirmed: true`. |
| `T('fill_field', {label:'PAN number', …})` | `sensitive_field` — PAN and OTP digits are never voice-filled. |
| Offers page | one `Select this offer (Lender)` button per card; `screen.cards` carry rate and EMI. |

## Why pages need accessible names

The apply and account pages have no `name`/`id`/`data-*` hooks, so the tools find controls by what a person would call
them (label text, aria-label, placeholder, button text). Keep that true when editing a form: give new inputs a visible
label, pill groups a `label` on `ChipGroup`, sliders and switches an `aria-label`. Unnamed controls are invisible to
the assistant.

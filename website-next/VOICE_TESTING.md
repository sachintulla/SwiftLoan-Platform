# Voice widget — testing

The website voice assistant (Ruby) is agent **`6a7197ff89c98da763e29b23`** ("Website companion app", role
`websiteCompanion`). The browser holds no Ello key or agent id: the widget calls our API
(`POST /api/voice/session`, role `websiteCompanion`) and the server resolves the agent from the dashboard override,
`ELLO_AGENT_WEBSITE_COMPANION`, or `ELLO_AGENT_ID`. The prompt lives in
[`prompts/ello-website-next-navigator-prompt.md`](../prompts/ello-website-next-navigator-prompt.md) (the whole file is the prompt) and must be set on
that agent in **Native Mode (Gemini Live)**, or it will talk but never call a tool (the console logs
`no tools-ack after 5s`).

## Run it locally

Launch configs (`.claude/launch.json`): `mock-aurix` (:4010), `server-mock-aurix` (:4000, `SMS_PROVIDER=none`,
`DEV_MASTER_OTP=123456`), `website-next` (:4002). `NEXT_PUBLIC_API_BASE=http://localhost:4000` in `.env.local`.
Open the site, tap Ruby bottom-right, allow the microphone.

## Manual voice script

The full script (21 lines to say, with the expected result for each) is in [`prompts/ello-website-next-navigator-notes.md`](../prompts/ello-website-next-navigator-notes.md).

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
await T('enter_otp', { code: '123456' });                // local dev master code; waits for the outcome, returns pathAfter/messages
await T('fill_field', { label: 'Verification code', value: '1' });   // → use_enter_otp: the code has exactly one entry path
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
| `T('fill_field', {label:'PAN number', …})` | `sensitive_field` — the PAN is never voice-filled (the OTP is spoken and goes in via `enter_otp`). |
| Offers page | one `Select this offer (Lender)` button per card; `screen.cards` carry rate and EMI. |
| Step 2 (`/apply/step-2`) | `read_screen().missingRequired` lists exactly: First name, Last name, Date of birth, Email, Pincode, Address line 1, City, State, Monthly income — whichever are still empty. Each `fill_field` returns `stillMissing`; a blocked `press_button('Continue')` returns the same list. Optional fields (Address line 2, Company name) never appear. Mandatory is read from the label's red `*` (or a native `required`), so a new mandatory `<Field required>` joins the list with no code change. |
| Step 1 | `missingRequired` = the PAN consent box; `missingForVisitor` = the PAN field (only the visitor enters it). |

## Why pages need accessible names

The apply and account pages have no `name`/`id`/`data-*` hooks, so the tools find controls by what a person would call
them (label text, aria-label, placeholder, button text). Keep that true when editing a form: give new inputs a visible
label, pill groups a `label` on `ChipGroup`, sliders and switches an `aria-label`. Unnamed controls are invisible to
the assistant.

## Checking what the agent is told on a page change (no call needed)

The agent only ever knows what the widget sends. Put a recording socket on it and drive the site; every message below
is what Ello would receive.

```js
const ag = window.__swiftloanVoice;
window.SENT = [];
ag.ws = { readyState: 1, send: (m) => SENT.push(JSON.parse(m)), close() {} };
ag.conversationId = 'test'; ag.status = 'listening';
// ...navigate / press buttons / enter_otp, then:
SENT.map((m) => [m.type, m.page_context.page, m.page_context.account.customerType, m.page_context.screen?.heading]);
```

| Action | Expect |
|---|---|
| Any page change (route, popup, offers arriving, Continue enabling, an error) | one `client-tools-update` with the **new** page, sent after "Loading…" has cleared |
| Scrolling | nothing sent |
| Filling a form field by field | nothing per field; one update when the form completes and Continue enables |
| Page changes while `ag.status = 'speaking'` | held; sent when status returns to `listening` |
| Finding → offers | sent as **urgent** (cuts in) |
| Tool that moves the page (`press_button`, `enter_otp`, `navigate_to_page`) | the update goes out inside the tool call, so the result and the new page are one turn |
| Log out | next update says `signedIn: false` |

The message type is **`client-tools-update`**. The backend rejects `update-context` ("Unknown message type"); sending
that is what used to leave the agent blind after the first page.

## UI sounds and the assistant's on-screen choreography

Ported from the mobile app (`src/feedback/`): same clips, same two switches in `src/config/sounds.ts`, same rules.

- **`UI_SOUNDS_ENABLED`** — master. `false` = no sound at all (the highlight and typing animation still run).
- **`UI_SOUNDS_MANUAL_TEST_MODE`** — shipped `false`: the *visitor's own* clicks, typing, sliders and scrolling are silent;
  sound plays only while the assistant works the page. `true` = every manual interaction plays its cue too, so the whole set
  can be tried by hand without a call.
- What the assistant does for each action: scrolls the control into view (scroll roll) → lights it with a ring (silent) →
  types with key ticks / presses with a dip, ripple and tap / walks sliders with detents → settles. A refused entry plays the
  error cue. Changing page plays the nav cue. Fills the real field through React, so it behaves like keystrokes.
- Clips are shared with the app: edit `scripts/gen-sounds.js`, run it, and it rewrites **both** `src/feedback/soundData.ts` and
  `website-next/src/feedback/soundData.ts`. They load lazily at call start (the mic tap is the gesture browsers require).
- Mic caveat, as on mobile: the mic is open during a call, so keep new sounds short and quiet or they can be transcribed as
  stray visitor turns (the prompt tells Ruby to ignore them).

Check without ears — development builds expose a trace of every cue:

```js
const S = window.__swiftloanSounds;   // { log, state(), setSoundsEnabled(), setManualSoundsEnabled() }
S.log.length = 0;
await T('fill_field', { label: 'First name', value: 'Priya' });
S.log.map((x) => x.name);             // scroll (if it had to move), then one tick per character; no sound for the ring
S.setManualSoundsEnabled(true);       // then click around by hand: every click/typing/scroll now plays its cue
```

| Action | Cues |
|---|---|
| any tool that reaches a control off-screen | `scroll`, then the action's own cue |
| `fill_field` / `fill_phone` / `enter_otp` | one typing tick per character (`tick1–3`), no sound for the ring |
| `select_option`, `select_loan_type`, `set_language` | `select` |
| `set_checkbox` | `toggleOn` / `toggleOff` |
| `press_button` | `tap` (menu links: `nav`) |
| `set_slider`, `set_loan_amount`, `set_calculator` | `slide` per detent |
| `navigate_to_page` | `nav` |
| `scroll_page`, `go_to_section` | `scroll` |
| a refused entry (PAN, bad date, bad number) | `error` |
| a real visitor click, production setting | nothing (with test mode on: `tap` / `select` / `toggle` / `nav`) |

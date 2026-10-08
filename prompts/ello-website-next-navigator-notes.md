# Ruby — website voice assistant: notes (NOT part of the prompt)

The prompt itself is [`ello-website-next-navigator-prompt.md`](ello-website-next-navigator-prompt.md) — that whole file is the
system prompt; paste it as it is.

Agent: **Website companion app** · id `6a7197ff89c98da763e29b23` · role `websiteCompanion`.
Companion to the mobile prompt [`ello-inapp-copilot-prompt.md`](ello-inapp-copilot-prompt.md) — same persona, same
rules of speech and safety, adapted to the website's pages and tools.

## Setup


- The assistant **must be in Native Mode (Gemini Live)** on the Ello dashboard. Without it the assistant talks but never
  calls a tool; the browser console logs `no tools-ack after 5s`.
- Paste the **whole** prompt file as the system prompt (it contains nothing else). `npm run ello:sync -- --role
  websiteCompanion` sends the same file (add `--dry` to preview). Do not push without deploying `website-next` first: the
  prompt names tools that only exist in the newer widget, and this agent is shared between dev and prod.
- The browser holds **no Ello key or agent id**. The widget asks our API (`POST /api/voice/session`, role
  `websiteCompanion`) and the server resolves the agent: dashboard override → `ELLO_AGENT_WEBSITE_COMPANION` →
  `ELLO_AGENT_ID`. Dev box already points both at the id above.
- Live facts reach the assistant as page context — at call start, and again whenever the page genuinely changes (a new
  route once it has loaded, a popup, new options or offers arriving, a button becoming usable, an error appearing; never
  on scroll). They are sent as `client-tools-update`, and each one is a turn the assistant is expected to answer. Fields:
  `page`, `currentPage`, `siteLanguage`, `alreadyIntroduced`, `account` (`signedIn`, `customerType`, `firstName`,
  `applications[]`), `alreadyFilled`, `calculator`, and `screen` (heading, step, every control with its state, offer
  cards, comparison table, on-screen messages). Tools live in `website-next/src/components/VoiceWidget.tsx`; their DOM
  helpers in `src/lib/voice-dom.ts`; the context protocol in `src/lib/ello-agent.ts`.
- **Keep prompt and code in step.** If a tool name, page key, section id, or a number on the site changes, change it here.

---
## Tool reference

| Tool | Where | Notes |
|---|---|---|
| `navigate_to_page` | everywhere | keys: home, faqs, compliance, privacy_policy, brand, logo, apply, offers, applications, profile, support, partners. Waits for the real route; `sign_in_required` when bounced. |
| `scroll_page` | everywhere | down / up / top / bottom, `small` or a page; reports `atTop` / `atBottom`. |
| `go_to_section` | everywhere | home / compliance / privacy-policy section lists, else heading match. |
| `read_screen` | everywhere | heading, step, controls with state (`required`, `filled`), `missingRequired`, `missingForVisitor`, offer `cards`, comparison `table`, `messages`, `dialogOpen`. |
| `fill_phone` | home form, `/apply` | validates 6–9 prefix + 10 digits; never reads back. |
| `select_loan_type`, `set_loan_amount`, `submit_application` | home form (needs `window.__swiftloanLead`) | amount snaps to ₹5,000; `warning` outside product range; `awaiting_otp`. |
| `set_calculator`, `get_calculator` | home calculator | returns fresh numbers after the commit. |
| `set_language` | everywhere | EN / HI / TE page text only. |
| `answer_faq` | everywhere | the 7 FAQs from `src/i18n/faqs.ts`. |
| `fill_field` | any form | returns `stillMissing` (mandatory fields left); by label; refuses the PAN and passwords (and points the code at `enter_otp`); dates `YYYY-MM-DD`; selects by option text. |
| `select_option` | any pill group | pass `group` when a word repeats. |
| `set_checkbox` | checkboxes + switches | consent only after a spoken yes. |
| `set_slider` | step-2 amount, compare EMI budget | keyboard-driven; snaps to the slider's own step. |
| `enter_otp` | sign-in page, home code popup | six digits the visitor said; verifies by itself; waits for the outcome (`accepted`, `pathAfter`, `messages`). The only path that writes the code. |
| `press_button` | any button/link | gated labels need `user_confirmed: true`; waits for loading to clear. |

## Manual test script (voice)

Run on `npm run dev` (port 4002) against a local server (`server-mock-aurix` launch config; OTP `123456` is the dev
master code). Say each line; expect the result. Everything below was also exercised directly through the tools in a
browser — see the handover notes.

| # | Say | Expect |
|---|---|---|
| 1 | (just connect, signed out, on home) | One warm welcome naming the page; no questions about them. |
| 2 | "What is SwiftLoan? Are you a lender?" | Brief LSP answer; no fee to borrowers. |
| 3 | "I need 7 lakhs, business loan" | Business type set; amount confirmed, set; no warning (1L–75L). |
| 4 | "Actually 20,000" | Gentle range note for Business, asks to confirm. |
| 5 | "My number is 9876543210" | Number accepted, not read back. |
| 6 | "Yes, send the code" | Code sent; Ruby asks what the code is — never tells them to type or click anything. |
| 7 | "The code is 1 2 3 4 5 6" | Ruby enters it herself; never reads it back. A wrong code → says it did not work, asks again. |
| 8 | (code accepted) | Signed in, page moves on; Ruby immediately speaks to the new page (next question), no re-greeting. |
| 9 | "What would my EMI be for 10 lakh at 12 percent over 2 years" | About ₹47,073 EMI, ₹11.3 lakh total; notes it is indicative. |
| 10 | "Does a credit check hurt my score?" | Soft-check answer from the FAQ. |
| 11 | "Take me to my applications" (signed out) | Says sign-in is needed and offers it. |
| 12 | "Show me the data retention section" (on privacy) | Scrolls to that section. |
| 13 | Step 1: "my PAN is …" | Stops them; explains the PAN is the one detail they enter themselves. Tick consent only after a yes. |
| 14 | Step 2: answer each question | One at a time; prefilled values not re-asked; DOB as YYYY-MM-DD. |
| 15 | Step 3: "skip it" | Asks to confirm, then skips only on a yes. |
| 16 | Offers: "apply with the first one" | Names the lender, asks, applies only after yes. |
| 17 | Compare: "sort by lowest EMI, 36 months" | Ranking and tenure change; reads the best lender from the table. |
| 18 | Support: "raise a ticket about a double EMI debit" | Topic, subject, details; asks before submitting; reads back the reference. |
| 19 | "Log me out" | Asks first; logs out only on a yes. |
| 20 | "Switch the page to Hindi" | Page text changes; Ruby's voice follows the visitor. |
| 21 | Go quiet for 20 seconds | Silence, or one short different line; never describes the silence. |

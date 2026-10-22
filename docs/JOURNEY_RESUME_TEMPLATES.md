# Install-link reminders: message templates to register

Two new templates are needed so the reminder can carry the personal install link (`<base>/dl?ref=<token>`).
The templates we have today cannot: the registered SMS text has no link slot, and the approved WhatsApp
`marketing_check_rate` has a fixed `https://www.swiftloan.ai` link and only a name variable.

The code already supports both (`server/src/lib/installReminder.ts`); nothing to change once these are approved.

## 1. SMS (DLT, through Vox)

Register in the Vox / DLT portal. Same sender ID (`PTSLA`), type (Service) and entity suffix as the template we already use
(`stages`, ID 1277178738168111452, which has two `{#alphanumeric#}` variables: name and step).

**Template text to register** (name, step, link: three variables; the type of each variable is DLT's own, so use whatever
placeholder the portal shows for "alphanumeric" and for "URL"; the existing template uses `{#alphanumeric#}`):

```
Dear {#alphanumeric#} , your SwiftLoan loan application is incomplete at {#alphanumeric#}. Please open the SwiftLoan app to continue where you left off :{#url#}. Team SwiftLoan
-PurpleTalk IPL
```

- **Link variable length.** The link is about 40 characters (`https://api.swiftloan.ai/dl?ref=AB12CD34`). Many operators
  cap a variable at 30. Ask Vox for a URL-type variable that allows 45+ characters, or use a short domain
  (for example `https://swiftloan.ai/d/AB12CD34`, which needs a small server change).
- Ask Vox whether the link's domain has to be whitelisted on the DLT side.
- A full stop straight after the link can become part of the tapped link on some phones; consider ending the sentence differently.

**Then save in Admin → Configs → Voxvalley** (the text must match the approved one exactly, line break included):

| Setting | Value |
|---|---|
| `installSmsTemplateId` | the template ID DLT gives you |
| `installSmsBody` | the same text with `{name}`, `{step}` and `{link}` in place of the three variables |
| `installStepLabels` (optional) | rename the steps, e.g. `{"pan_done":"Pan verification"}`; defaults: otp_only = "Mobile verification", pan_done = "Pan verification", application_started = "Application" |

`{name}` is the first name from the PAN check (the whole name if it fits 30 characters, else its first word), or `Customer`
when unknown. `{step}` is where the visitor stopped. `{link}` is the personal link and is required.

## 2. WhatsApp (through Vox, approved by Meta)

Create in the Vox portal (WhatsApp → Templates → Create Template) or with `POST /api/v1/whatsapp/templates`.

| Field | Value |
|---|---|
| Name | `install_app_resume` |
| Language | English (`en`) |
| Category | MARKETING (Meta usually re-classifies "come back and install" messages as marketing, so submit it as marketing) |

**Body**

```
Hi {{1}}, you started your loan application on SwiftLoan but didn't finish. Pick up where you left off in our app: {{2}}

It takes about 3 minutes.
```

**Footer:** `SwiftLoan`

**Sample values (Meta requires them):** `{{1}}` = `Priya`, `{{2}}` = `https://api.swiftloan.ai/dl?ref=AB12CD34`

Notes
- Meta does not allow a variable at the very start or very end of the body, which is why the closing sentence is there.
- The body variable carries the whole link. A URL button with a dynamic suffix is the cleaner Meta pattern, but the sender
  only fills body variables today; switching to a button needs a small code change.

**Then save in Admin → Configs → Voxvalley:**

| Setting | Value |
|---|---|
| `installWhatsapp` | `{"template":"install_app_resume","language":"en","placeholders":["{name}","{link}"]}` |

`{name}` is the first name from the PAN check, or `there` when there is none.

### 2b. WhatsApp with the step named (`install_app_resume_step`)

Submitted 22 Oct 2026, Marketing, English, three variables: `{{1}}` name, `{{2}}` step, `{{3}}` link.
Body: "Hi {{1}}, your SwiftLoan loan application is incomplete at {{2}}. Please open the SwiftLoan app to continue where you left off: {{3}}"
followed by "It takes about 3 minutes." Footer "SwiftLoan". Once Meta approves it, switch the setting:

| Setting | Value |
|---|---|
| `installWhatsapp` | `{"template":"install_app_resume_step","language":"en","placeholders":["{name}","{step}","{link}"]}` |

## 3. Switch sending on

Only after both are approved and saved:

- `INSTALL_REMINDER_SEND=true` on the server (until then the job only logs what it would send).
- `PUBLIC_BASE_URL` = the public https host of the API (the link is built from it).
- `IOS_STORE_URL` (already a TestFlight link locally) and `ANDROID_STORE_URL` for the real listings.
- Optional but recommended, to see real WhatsApp delivery: `WHATSAPP_WEBHOOK_KEY`, and register
  `https://<host>/api/webhooks/whatsapp?key=<key>` with Vox (status events). Vox's own portal log stays on SUBMITTED even
  for messages that arrive, so the admin Messages page is the only place real statuses show up.

## 4. Local test before the templates exist (this Mac only)

Run the whole journey without the new templates: see "Local phone test" at the end of `CLAUDE.md`. The link is opened by hand in Safari on the phone; no message has to carry it.

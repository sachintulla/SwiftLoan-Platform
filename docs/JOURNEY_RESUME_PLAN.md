# Website drop-off recovery and app resume: plan for approval

Prepared by: Charan · Date: 19 Oct 2026 · Status: **draft, waiting for manager confirmation. No code has been changed.**

Related: the team's "SwiftLoan User Journeys" doc (stand-up of 19 Oct). This plan covers its J3, J4 and J5 and the parts of J1 and J6 that they depend on. It shows where my brief and that doc differ, so those points can be settled before building.

---

## 1. What we are building

A visitor who starts a loan application on the website and stops should not be lost.

1. **Track** where they stopped on the website, and save it.
2. **Send** them the app link by SMS and WhatsApp on a fixed schedule, with a reference ID in the link so we know who it is for.
3. **Recognise** them when they open the app, and offer to continue where they left off.
4. **Resume** the application at the right step, with the voice agent guiding if they want.

---

## 2. The journey

### On the website
- Order today: phone, then OTP, then **step 1 (PAN details)**, then step 2 (basic details), then more details, offers and the lender.
- After 5 minutes with no activity, the visitor is saved as **dropped off at step X**.
  - `otp_only`: verified the OTP, never did PAN.
  - `pan_done`: finished step 1 (PAN).

### The link
- Format: `…/dl?ref=<reference ID>`. The server records the click and sends the visitor to the store or TestFlight.
- For now this points to the **TestFlight placeholder**. Only a setting changes when the store listings are live.

### First open of the app
1. The app matches the install to the visitor through the reference ID.
2. A pop-up shows: *"You left off on the website. Shall we continue?"*
   - **Okay, continue**: the login screen opens with the mobile number pre-filled. The user ticks consent, taps Continue and enters the OTP.
   - **Take help from agent**: the agent greets by name (if we know it from the PAN check, otherwise a generic greeting), says the number is already filled, and **asks before ticking the consent box**. It taps Continue and the user gives the OTP.
3. After the OTP:
   - `pan_done`: go straight to **step 2** (basic details). The PAN stays on the server and is never sent to the phone.
   - `otp_only`: go to Home. The agent asks: *"You already have an account on the website. Shall we start your application here?"*
4. No match (for example an install from the store without the link): the user logs in normally. After the OTP we look the visitor up by phone number and offer the same resume.

---

## 3. Reminder schedule

Seven days, every day. Each reminder is an **SMS, then a WhatsApp 30 minutes later**. We stop as soon as the person installs or logs in to the app.

| # | When (from the start point) | Channel |
|---|---|---|
| 1 | Start | SMS |
| 2 | +30 min | WhatsApp |
| 3 | +4 h | SMS |
| 4 | +4 h 30 min | WhatsApp |
| 5 | +8 h | SMS |
| 6 | +8 h 30 min | WhatsApp |
| 7-20 | Day 1, 2, 3, 4, 5, 6, 7 (same time as the start) | SMS, then WhatsApp +30 min each day |

**That is 20 messages in 7 days.** Any message that falls outside calling hours (09:00 to 21:00 IST) moves to the next allowed time.

**Stop conditions:** the app install is matched, the user logs in to the app, the user finishes the application, the user is on the do-not-contact list or opts out, or 7 days have passed.

---

## 4. Decisions needed from the manager

| # | Decision | My recommendation |
|---|---|---|
| D1 | **When does the schedule start?** (a) 5 minutes after the visitor's last activity, as in my brief, or (b) the moment the OTP is verified, as in the team doc ("every number entered gets the app link, even if they keep applying"). | **(b)**, because it matches what was agreed at the stand-up. The 5-minute idle rule is then used to save the "dropped off at step X" status. |
| D2 | **20 messages in 7 days: is that acceptable?** Plus quiet hours, and a lifetime cap if you want one. | Keep the schedule above. Add a cap only if the compliance team asks. |
| D3 | **Reminder call (J5 in the team doc).** It is not in my brief. Do we include it, and how many calls? | Not in the first release. Add one call per drop-off, within calling hours, after the message schedule works. |
| D4 | **First open: pop-up first, or the agent speaks immediately?** The doc has the agent opening directly. My brief has the two-button pop-up. | Pop-up first, because it gives a way to continue without voice. The agent speaks only if the user chooses it. |
| D5 | **One agent with extra conditions, or a separate agent for visitors with context?** Open question in the doc. | One agent, plus a "journey context" block (name and last step). It avoids a second agent to maintain. |
| D6 | **Which website details travel to the app?** | Phone, first name (from the PAN check) and last step only. The PAN stays server-side. |
| D7 | **Website J1 changes** (thank-you screen and "Do you want to apply here?"). Not in my brief. | Treat as a separate item. It needs English, Hindi and Telugu copy. |
| D8 | After login, **skip the app's permissions and "about you" screens** when resuming at step 2? | Yes, because step 2 collects the same details. |
| D9 | If a visitor **returns to the website** during the schedule, cancel it and start a new one when they go idle again? | Yes. |
| D10 | **Existing 30-minute "signed in but never started an application" SMS** will also fire for these visitors. | Suppress it for anyone with an active reminder. |
| D11 | **Pre-fill the full mobile number** in the app. It is returned only for an exact install match (Play referrer or clipboard), never for a same-IP guess. | Yes. |
| D12 | **Lender OTP as "journey complete" (J6).** I need to confirm the app and website record that moment. | I will check and report. It would be a stop condition. |

---

## 5. Blockers and dependencies

| Item | Status | Owner |
|---|---|---|
| **WhatsApp send** | Provider returns 405, also after the IP change. No live WhatsApp message has been verified. | Veerendra with the provider. Charan to check the sender name and repost the error. |
| **WhatsApp template** with a link variable | Needed, must be approved | To be assigned |
| **SMS template with a link variable** | Today's SMS text is a fixed registered template with no slot for a link. A new one must be registered. | To be assigned |
| **Hosted database change** | Needs a new table. `prisma:push` is blocked until the hosted `DATABASE_URL` is available. I will write the migration by hand. | Whoever owns the hosted DB |
| **TestFlight link** | Placeholder for now | Sachin or release owner |
| **Agent prompt change** | The current prompt says "no name before login". I will edit the file locally, and it must be pasted into Ello by hand. | Charan |

Until SMS and WhatsApp are ready, the job runs in **log-only mode**. It records what it would send and sends nothing.

---

## 6. Build phases

| Phase | What | Needs |
|---|---|---|
| 1 | Website activity ping, "PAN done" event, first name saved, new reminder table, schedule logic with unit tests, job in log-only mode | Hosted DB migration |
| 2 | Install claim returns the resume details (exact matches only), pop-up, pre-filled login, post-OTP routing to step 2 or Home, agent context | Phase 1 |
| 3 | Switch on real SMS and WhatsApp | New templates, WhatsApp fix |
| 4 | Admin dashboard column for journey status and reminder progress | Phase 1 |

Each change will be checked on **both the iOS simulator and the Redmi**.

---

## 7. How we will test

- Unit tests for the schedule: offsets, quiet hours, stop conditions, no double sends.
- Website: verify OTP, stop at PAN, wait 5 minutes, check the saved status.
- Link: open it on iOS (TestFlight) and Android, check the reference ID is read and the number is pre-filled.
- App: with and without a match, "Okay, continue" and "Take help from agent", `pan_done` lands on step 2 and `otp_only` lands on Home.
- Reminders: install mid-schedule and check that everything stops.
- End to end: the team doc's own checklist, up to the lender OTP.

---

## 8. Risks

- **20 messages in a week** may annoy users or breach spam rules. Quiet hours, the stop rules and the unsubscribe check reduce this.
- **iOS install matching** depends on a clipboard token, and iOS shows a paste prompt. The phone-number lookup after login is the fallback.
- **WhatsApp** may stay blocked. SMS alone still works.
- **Consent:** the website's OTP step should tell visitors they may get follow-up SMS and WhatsApp messages. Compliance should confirm the wording.
- **No opt-out handling for replies (STOP)** exists yet.

---

## 9. Sign-off

| Decision | Approved / Changed | Name | Date |
|---|---|---|---|
| D1 to D12 as recommended above | | | |
| Changes or notes | | | |

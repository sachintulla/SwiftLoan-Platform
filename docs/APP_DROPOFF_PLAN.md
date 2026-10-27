# Drop-off messages for website and app: plan for approval

Prepared: 27 Oct 2026 · Status: **approved 27 Oct 2026. Phase 1 built (log-only, nothing sent).** See section 11 for what changed from this plan.
Related: `docs/JOURNEY_STEPS_TO_TRACK.md` (the step list), `docs/JOURNEY_RESUME_PLAN.md` (the website reminders already built).

---

## 1. What we are building

When a person stops partway through the loan journey, whether on the **website** or in the **app**, we record exactly where
they stopped and send a WhatsApp (SMS as the fallback) that says where they dropped and what to do next.

- Same statuses and same messages for both channels.
- **The only difference is the app link.** A person who is not in the app yet gets the app download link in the message.
  A person who is already in the app gets no link, just "open the app".

## 2. What already exists (so we reuse it, not rebuild it)

| Piece | Status |
|---|---|
| Website drop-off reminders (`installReminder.ts`) | Built. Tracks "dropped at step X" for website visitors and sends the app link on a schedule. |
| "You applied with <lender>" messages (`lenderNudge.ts`) | Built. Template awaiting approval. |
| Stuck-stage rules (`stallRules.ts`) | Built. One SMS or WhatsApp per step after 30 minutes, app only, with no record of the drop itself. |
| Step events (`JourneyEvent`) and the person's current step (`Customer.currentStage`) | Saved for the app. The website saves only some of them. |
| Delivery tracking, Admin Timings, test-number list, quiet hours | Built and reusable. |

What's **missing**: nothing records "this app user dropped at step X, and these messages went out", and the website and app use different step names.

## 3. The statuses (agreed flow)

| # | When | Status saved | Notes |
|---|---|---|---|
| 1 | OTP verified, on the home dashboard | `otp_verified` | exists |
| 2 | Step 1 done: PAN verified, details fetched; now on step 2 | `pan_verified` | new standard key |
| 3 | Step 2 done: all details entered; moving to step 3 | `application_filled` | new standard key |
| 4 | Step 3, the skip or continue choice | **nothing saved** | by design |
| 5a | Offers fetched, **none** | `rejected` **with a reason** (for example "number already registered") | the reason comes from the lender result already stored on the application |
| 5b | Offers fetched, **some** | `offers_received` | |
| 6 | Offers received, none applied | `offers_not_applied` | derived after a wait |
| 7 | Applied to an offer | `applied` | the lender sequence takes over |

A **technical failure** while fetching offers is not "rejected": it is saved as `failed` and retried. It never triggers the
"sorry, no offers" message.

## 4. The messages

| Status the person stops at | Message (meaning) | Link? |
|---|---|---|
| `pan_verified` or `application_filled` | "You left your application at <step>. Continue where you left off." | website: **yes**, app: no |
| `rejected` (no offers) | "Sorry, we couldn't get offers yet. Don't worry, one of our team will call you and follow up." | no |
| `offers_not_applied` | "You have offers waiting. Please try applying to one." | website: **yes**, app: no |
| `applied` | "You applied with <lender>. To check the status, log in to the app." | website: **yes**, app: no |

**Link rule:** include the app link if the person is **not in the app yet** (the existing "already in the app" check),
whichever page they dropped from. That gives the agreed result: website drop gets the link, app drop does not. It also
covers someone who starts on the website, installs, and later stops in the app.

**"Applied" wording:** lenders do not report status back to us, so we say only what is true ("you applied with <lender>")
and point to the app. We never write "in progress", "under review" or "approved".

### Templates to register (WhatsApp needs Meta approval; SMS needs registration with the regulator)

| # | Template | Variants |
|---|---|---|
| 1 | Continue your application | with link, without link |
| 2 | No offers, team will call you | one |
| 3 | You have offers, please apply | with link, without link |
| 4 | You applied with <lender>, check status in the app | with link, without link |

That is **7 WhatsApp templates** and the matching **7 SMS templates**. Texts will go in `docs/JOURNEY_RESUME_TEMPLATES.md`.

## 5. How it is built (centralized)

- **One step registry** on the server: key, label, "moved on" event. Adding a step is one entry. No change to individual screens.
- **One new table** (`AppDropoff`, in the style of `JourneyReminder`): the person, where they dropped, when we noticed, the
  schedule progress and a history of each message with its result. One active run per person.
- **One job** (every minute) that arms rows from recent journey events, stops them, and sends. It reuses the existing schedule
  engine, quiet hours (9:00 to 21:00 IST), minimum gap between messages, test-number list and delivery tracking.
- **Admin Timings** gets: send switch (default **off**), delay before a drop counts (default 30 minutes), schedule, test list.
  Everything editable with no deploy.
- **Website changes:** it must report the same step keys (PAN verified, application filled, offers outcome). Small server-side
  writes, no page redesign.
- **No app change** is needed for the statuses; they come from events the server already receives or can record itself.

**Default cadence (lean, as the compliance notes ask):** first message 30 minutes after the drop, then SMS after 1 day, then one
last WhatsApp after 3 days. Edit in Admin Timings.

**Stops on:** the person moves to the next step (a fresh run starts for the new step), applies to a lender (the lender
sequence takes over), disbursed or rejected by a lender, or do-not-contact. A website run and an app run for the same phone
never overlap, and the existing stuck-stage SMS rules for these steps are switched off once this is live.

## 6. The "our team will call you" promise

Message 2 promises a call. **Someone must actually call.** Proposed: every `rejected` status creates a row in an Admin
follow-up list (name, phone, reason, time) and, if wanted, feeds the existing callback system. The message is not switched on
until the follow-up process is agreed.

## 7. Build phases

| Phase | What | Needs |
|---|---|---|
| 1 | Step registry, new standard keys, website reports the same keys, new table, schedule rules with unit tests, job in **log-only** mode | Hosted-database migration |
| 2 | Message texts registered; real sends limited to the test-number list | Templates approved, WhatsApp delivery fixed |
| 3 | Admin view (drop point, message history), follow-up list for rejected, retire the overlapping stall SMS rules | Phase 1 |
| 4 | Local fake-stall test and integration tests, then `develop` only | none |

## 8. Blockers and risks

- **WhatsApp delivery:** Vox's API reports Success but nothing arrives; messages sent from the Vox portal do arrive. SMS works.
  The code works with any provider, but live WhatsApp waits on Vox.
- **Templates:** 7 + 7 to write, register and approve. Link variables may be limited to about 30 characters on SMS.
- **Hosted database:** needs `prisma migrate deploy`.
- **Opt-out and DND:** STOP replies and the do-not-call scrub are still not built, and are needed before a wide rollout.
- **Message volume:** kept low on purpose (see the cadence above) for DPDP and TRAI compliance.

## 9. Assumptions I made (please confirm or change)

1. Step 1 on the website is PAN verification.
2. A rejected person gets the generic "sorry" message. The reason is shown in the admin only, not to the customer.
3. "Offers not applied" is sent after 30 minutes with no apply.
4. The "no offers" message has no link.
5. Failed-to-fetch is retried and not treated as a rejection.

## 10. Sign-off

| Decision | Approved / Changed | Name | Date |
|---|---|---|---|
| Sections 3 to 6 and the assumptions in 9 | | | |

## 11. Phase 1 build notes (27 Oct 2026)

Built and tested (13 job checks + 21 rule tests; the project's journey suite still passes 155/155). Nothing is sent: `dropoff.sendEnabled` is off.

**One change from the plan, for the better.** The plan said the website must report new `pan_verified` / `application_filled` events. While building I found
every status can be read straight from tables both channels already write (PAN on file, the application and its status, offers, lender applications), so
**no website or app change was needed** and the two channels cannot disagree. The "events" in section 3 are therefore derived statuses, not new journey
events. (`failed` is kept apart from `rejected`, as planned.)

Also: the website install reminder already sends a "continue" message with the link to website visitors, so the new sequence stands down for any phone
that has an active website reminder or "you applied" sequence. Its new value is the offers outcomes (no offers, got offers but not applied) for both
channels, and the "continue" message for app users.

**Still to do:** phase 2 (templates + real sends on the test list), phase 3 (admin view, follow-up list for rejected, retire the overlapping stall SMS
rules), and hosted-DB migration. Details in `CLAUDE.md`.

## 12. "No offers" follow-up call (27 Oct 2026)

Built the call that the "no offers" message promises. It reuses the existing Ello `leadCallback` agent and dialler (no new agent), the master call switch and the call
test-number list. Own switch `dropoff.noOffersCallEnabled` (off by default: it only records "would call"). One call per person, 45 minutes after they got no offers, in calling hours.
The agent is told `already_registered` or `no_match` (never the lender's wording). Checked end to end against a fake Ello server (`dropoff-call-check.mts`, 18 checks).
**Before switching on:** paste prompt branch G into Ello, set the call test-number list, then reword the WhatsApp message to say the SwiftLoan assistant will call.

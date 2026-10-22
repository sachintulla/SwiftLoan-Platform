# Website voice agent — live test report (2026-10-15)

**How it was tested.** A real Ello call (agent `Website companion app`, the prompt pasted in Ello at the time) driven by synthetic
speech: macOS `say` voices (Rishi en-IN, Lekha hi-IN, Geeta te-IN) fed to the widget as a fake microphone, with the WebSocket
tapped to record every transcript line, tool call and result. Local stack only: isolated DB, mock Aurix, no SMS, no real partners.
Fake users `7890012345`, `7890012346`, master OTP. About 12 calls and 80 spoken turns.

Legend: **FIXED** = code changed and verified here · **PROMPT** = fix is in `prompts/ello-website-next-navigator-prompt.md`
(must be pasted into Ello by hand) · **OPEN** = platform or product decision.

## A. Bugs in our code

| # | Finding | Evidence | Status |
|---|---|---|---|
| A1 | **The "ask first" gate was only a flag the model sets.** On "Apply with Mock Lender Alpha." she pressed *Apply now* with `user_confirmed:true` and a lender application was created without any spoken confirmation. | Tool log + `LenderApplication` row `just_applied` | **FIXED** — structural handshake in `VoiceWidget.tsx` (visitor spoke → agent asked → visitor answered; one action per question). Verified live: first press refused `needs_confirmation`, she then asked. |
| A2 | **Repeated "what are the six digits?"** The OTP pop-up's "Resend in 27s" label changes every second; each change was sent to the agent as a page update (= a new turn). 8–16 updates in ~20 s, fragments like "Just let / me know the code". The first fix only matched English units; Telugu ("సెకన్లలో") still ticked. | Page-update diff | **FIXED** — digits in control labels ignored when judging "page changed" (any script). 26 s countdown now sends 1 update instead of ~8. |
| A3 | **Hindi/Telugu PAN-consent could not be ticked.** The long label is cut with "…" in the page context; she passed it back re-spelled → `checkbox_not_found`, then asked the visitor to "show her the box". English worked (shorter label). | Hindi call | **FIXED** — a lone checkbox is accepted; near-matches (≥75 % of words) accepted; ties still ambiguous. Unit tests added. |
| A4 | **Profile "Save changes" failed silently** for a user with no email (it sent `email:""` → 400) and she still said "Done, saved". | DB had no name; server 400 | **FIXED** — only non-empty fields sent; failures show an alert. Verified saved. |
| A5 | **Regression from the new delete-account card:** its red button used `text-danger`, which the voice layer reads as an on-screen *error message*. | `messages` contained "Delete my account" | **FIXED** — decorative red no longer uses that class. |
| A6 | **She can't read text in an open dialog** (e.g. the ticket reference "SL-T-00001"): "I don't see a reference number on this screen." | `read_screen` result | **FIXED** — `dialogText` now in page context and `read_screen`. |
| A7 | `answer_faq` returns a **wrong FAQ with `success:true`** for an unrelated question (she ignored it correctly this time). | "Are you a bank?" → "What documents will I need?" | **OPEN** — should return "no match". |
| A8 | **Log out unreachable by voice at narrow widths:** the sidebar is hidden below `lg`, Log out sits inside the hamburger menu, she tried "Logout", found nothing, never opened the menu. | `button_not_found` | **PROMPT** (open the menu first); code option: expose the menu items. |

## B. Agent behaviour (model / prompt)

| # | Finding | Status |
|---|---|---|
| B1 | **False claim of success.** She pressed a lender *column header* instead of Apply, the page did not change, and she said "I've submitted your application… under My Applications". Nothing was submitted. Asked to confirm, she read "In progress" and did not correct it. | PROMPT (verify before claiming) |
| B2 | Calls `set_language` immediately (Hindi, Telugu) instead of offering once and waiting for a yes. | PROMPT |
| B3 | Keeps answering in Hindi after the visitor speaks several clear English sentences. | PROMPT |
| B4 | A stray "um" (heard from "Hmm.") got a full reply; the prompt says no reply to noise. | PROMPT |
| B5 | **12 silence nudges in ~20 minutes, many verbatim repeats**, some talking over the visitor, some pushy ("shall we go back to the PAN step?"). | PROMPT |
| B6 | **Blind parallel tool calls** (navigate + fill + save in one burst; fill before the form is open): ~6 occurrences, each producing failed calls before she recovers. | PROMPT |
| B7 | Over-asks permission for things already requested ("Should I press Edit?", "OK to go to the support page?", "ticket or grievance?"), and wrongly says "I can't edit the name directly". | PROMPT |
| B8 | Two questions in one turn (number + loan type); did not map "for my shop" to a business loan. | PROMPT |
| B9 | **Phone-first order not followed:** after the number she offered the code and deferred the amount → `form_not_ready`. She recovered well (asked which of "2 or 5 lakh"). | PROMPT (prompt already says amount second) |
| B10 | Narrates navigation ("taking you to your details page", "you're on My Applications"); tells the visitor to act on screen ("enter your PAN on the screen"). | PROMPT |
| B11 | Step 2: did not lead after the page changed (~50 s silence, then a generic nudge); **skipped confirming the pre-selected defaults** (purpose, gender, qualification, residence, employment, salary mode); pressed Continue on "continue with the name as on my PAN". | PROMPT |
| B12 | Wrong OTP: once she stayed silent for 25 s (visitor would not know); next time she handled it correctly. Intermittent. | PROMPT |
| B13 | Did not read the ticket reference after submitting (spoke it fine from the tickets list later). | PROMPT + A6 |
| B14 | Inconsistent openings: twice ignored the account context (signed-in, offers ready) with a signed-out style welcome; once asked "do you have an old application?" mid-Step-1. Also unsolicited contradictory lines ("three offers" vs "four"). | PROMPT |
| B15 | Deletion questions get the **old** guidance (privacy ticket / email). The self-service route (Profile → Delete my account) is only in the md. | PROMPT (paste) |
| B16 | Types a name exactly as heard (typed "Rallabhandi" for "Rallabandi") without checking spelling; reports the clamped calculator rate (28 %) without saying her 30 % was changed. | PROMPT |

**Worked well:** signed-out and returning openings (usually), FAQ answers from facts, EMI maths via the tool and the indicative-rate reminder, section/page navigation, refusing signed-in pages when signed out, **refusing to reveal another number's details**, refusing to read her prompt/tools, refusing to take or fill the PAN, consent asked before ticking (mostly), PAN check and ticket submit only after asking, logout/deletion refusals, accurate reading of offer cards and the compare table (₹16,225 matched the page), silence during the offers loader, barge-in, Hindi/Telugu replies, clamping out-of-range calculator input.

## C. Platform (Ello / audio)

| # | Finding |
|---|---|
| C1 | **Hard 10-minute cap.** Every call ended at exactly 10.1 min, silently; the agent said goodbye ~25 s earlier. A real application can pass 10 min, and an action in flight (logout) is lost while she announces it. Needs a spoken heads-up and a quick reconnect that keeps context, or a shorter funnel. |
| C2 | One `client-tool-cancel` with reason `timeout` although the result had been sent 1.6 s after the call (calculator). She told the visitor "I couldn't calculate that". Matches the earlier "API didn't respond" report; intermittent. |
| C3 | Speech recognition: an English sentence transcribed as Portuguese; first words clipped; numbers sometimes split ("99999.00012"); a PAN read aloud is stored in the voice provider's transcript. |
| C4 | Latency: speech → reply typically 7–15 s. |
| C5 | By design the offers-arrival update is flagged `urgent` and interrupts her mid-sentence (not reproduced in this run). |

## D. Test-setup artifacts (not product bugs)
A stopped mic track made a second call deaf; editing code hot-reloaded the widget and ended a call; my speech sometimes overlapped hers or a nudge. All harness issues, corrected.

## E. Not covered
"Get more offers" (partner flow is disabled locally), the mid-speech `urgent` interruption, brand/logo pages, the app-only referral flow, real SMS/real lenders.

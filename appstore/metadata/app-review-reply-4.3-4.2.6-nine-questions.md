# App Review reply — 4.3 / 4.2.6 (the nine-question version)

Reply in App Store Connect → Resolution Center. Apple says: if you believe the app already meets
4.3(a)/(b) and 4.2.6, **reply instead of resubmitting**.

Everything below is taken from the code/repo except the **[CONFIRM]** items — those are facts only
you can verify. Do NOT send with any [CONFIRM] left in. Don't invent beta feedback or app history:
Apple cross-checks the developer account.

---

Hi App Review team,

Thank you for the detailed review. We believe SwiftLoan meets 4.3 and 4.2.6, and we answer your
questions below.

**1. What the app does and the problem it solves**
SwiftLoan is a loan-comparison and referral app for personal loans in India. SwiftLoan does not
lend money. A user enters their details once (mobile OTP sign-in, basic profile, PAN, income);
we run a soft eligibility check with our lending partners (no hard credit pull, no score impact)
and show the resulting offers side by side — interest rate, processing fee, GST, total repayable
and EMI — ranked by true total cost. The user picks one and is handed off to that RBI-regulated
partner, who makes the credit decision and disburses. Problem solved: in India a borrower
otherwise re-enters the same KYC/income form in app after app and compares headline rates that
hide fees. The app also has a voice assistant ("Ruby") that guides the journey and fills forms
by voice in English, Hindi and Telugu, plus an EMI calculator, repayment tracking, credit-score
view, in-app grievance redressal, and full account/data deletion.

**2. Intended user**
Salaried and self-employed borrowers in India, 21+, who need a personal loan — especially
first-time or tier-2/3 borrowers who are more comfortable in Hindi or Telugu than English, or who
find long typed forms hard. [CONFIRM: add any specific segment/targeting data you have.]

**3. The gap we address**
(a) One soft check fans out to several regulated partners through live integrations, instead of
repeating the form per lender. (b) Offers are compared by total cost, not teaser rate.
(c) The whole journey — not just the marketing text — runs in English, Hindi and Telugu, and can
be completed hands-free by voice. Most loan apps are English-only, single-lender, and form-driven.

**4. Beta testing**
We distributed pre-release builds through TestFlight and internal Android builds before
submission. [CONFIRM: number of testers/dates, and 2–3 REAL feedback items that changed the
build. Candidates visible in our history, only if they genuinely came from testers: the partner
(Yubi) WebView loader that could hang was fixed so it can never stay up indefinitely; offers now
show "time ago" timestamps and indicative amounts; "no offer" results now show our own copy
rather than lender wording.]

**5. Standalone or part of a suite**
Standalone. [CONFIRM: say whether any other app is published under this developer account. The
earlier reply said an older similar app was removed — state that only if true, and name it.]

**6. Could it be an IAP/feature of another app on the account?**
No. [CONFIRM with Q5: if there is no other app, say "There is no other app on our account to
consolidate it into."]

**7. Shared code/assets with other apps on our account**
[CONFIRM: "None" if true. Note the same company also runs the swiftloan.ai website and a backend
that this app talks to — shared API, not shared binary code.]

**8. Shared codebase/SDK/content with third-party apps**
Only standard third-party SDKs: React Native, the Upshot analytics/engagement SDK, and our voice
platform integration (Ello) for the assistant. No white-label or third-party app codebase; the
screens, flows, comparison logic and backend are our own. [CONFIRM: ownership/relationship with
Ello if asked — it is the voice-agent platform, not another consumer app.]

**9. Built for a client/third party? (4.2.6)**
No. SwiftLoan is our own brand and product, operated by Purple Talk India Private Limited, which
owns this developer account. It is custom-built (React Native app + our own Node/PostgreSQL
backend), not from a template or app-generation service, and not submitted on anyone's behalf.

**Testing the app.** Sign-in uses the demo number and OTP in App Review Information. That
account is a sandbox: it returns sample offers and no real money moves.

Privacy policy: https://swiftloan.ai/privacy-policy

Thank you — happy to provide anything further.

# DRAFT — Privacy Policy wording for the Upshot analytics / engagement processor

> **Status: draft for review by your compliance owner / legal counsel. Not legal advice.**
> Nothing here is live. The in-app Privacy Policy (`src/screens/privacy.tsx`, `src/i18n/strings.ts`)
> currently says data is shared with a Lending Partner only when the user chooses to apply, and
> does not mention Upshot or any analytics / engagement tool.

## Why this is needed

The app and website send usage events and a limited profile to **Upshot (Brandmobile / goupshot.com)**,
a third-party engagement platform. Under the DPDP Act 2023 and the RBI Digital Lending Guidelines,
sharing with a processor for a new purpose should be disclosed in the privacy notice and covered by
the user's consent, with a way to withdraw it.

## What is shared today (no policy change needed beyond disclosure)

| Category | Examples |
|---|---|
| Account identifiers | Mobile number, SwiftLoan user ID, name and email (once entered), platform (Android/iOS), language |
| App usage | Screens viewed, steps completed (language chosen, OTP requested/verified, PAN verified, offers received, offer selected, application submitted, loan disbursed) |
| Offer facts | Number of offers, best rate, highest amount, lender names, tenure of the selected offer |
| Device | Device model, OS, push-notification opt-in |

## What is NOT shared (keep it that way unless the policy is updated)

PAN number, date of birth, gender, address, masked Aadhaar, bureau/credit score and report data,
bank details, and any other KYC document data.

## Suggested wording (English)

> **Analytics and personalised messages.** To understand how the app is used and to send you
> helpful reminders and updates, we share limited information with our service provider **Upshot**
> (a data processor acting on our instructions). This includes your mobile number, name, email,
> device details, the screens you use and the steps you complete in the app (for example, that your
> PAN was verified or that offers were found), and general details of the offers shown to you such
> as lender names and rates. **We do not share your PAN number, date of birth, address, Aadhaar
> details or credit score/report with Upshot.** Upshot stores this data on servers in India
> *(confirm the region with the vendor)* and may not use it for its own purposes.
> You can withdraw consent to analytics and marketing messages at any time from
> **Profile → Notifications**, or by contacting our Grievance Officer at *[address]*.

## If you decide to also share PAN-derived details (not recommended by default)

Only share the minimum needed for a specific campaign, never the raw values. For example:

- send **state** or **city** (not the address lines or pincode),
- send an **age band** (e.g. 25–34) instead of date of birth,
- never send the PAN, Aadhaar (even masked), or credit score.

This needs: updated notice text naming each category, an explicit consent line on the consent
screen (separate from the lending-partner consent), a DPA with the vendor, and an entry in the
data-flow / record-of-processing documents (`docs/compliance`, Docs 02–03, 06).

## Open items for compliance

1. Confirm Upshot's data-residency region and sub-processors; sign the DPA.
2. Add a separate, optional consent toggle for marketing/engagement (analytics should not be bundled
   with the lending-partner consent).
3. Confirm retention period and deletion on account closure (`upshotLogout` / `disableUser` exists
   in the app; confirm it also triggers deletion in Upshot).
4. Translate the final wording to Hindi and Telugu (`src/i18n/strings.ts` currently falls back to
   English for Telugu).
5. Update the compliance documents (Docs 02, 03, 05, 06) to list Upshot as a processor.

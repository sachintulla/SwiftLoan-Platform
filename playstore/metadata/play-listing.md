# Google Play — SwiftLoan listing (`ai.swiftloan.app`)

All copy is within Google Play's limits. **[confirm]** = needs a business/legal decision.

---

## Store settings

| Field | Value |
|---|---|
| **App name** (≤30) | `SwiftLoan: Compare Loans` (24) |
| **Package name** | `ai.swiftloan.app` |
| **Default language** | English (India) — `en-IN` |
| **App or game** | App |
| **Free or paid** | Free |
| **Category** | Finance |
| **Tags** | Personal loans, Comparison |
| **Contact email** | `support@swiftloan.ai` **[confirm]** |
| **Contact website** | `https://swiftloan.ai` |
| **Privacy Policy URL** | `https://swiftloan.ai/privacypolicy` **[must be live before submit]** |

## Short description (≤80 chars)
```
Compare real loan offers from RBI-regulated partners — a soft check, in minutes.
```
(79 chars)

## Full description (≤4000 chars)
```
SwiftLoan helps you discover, compare, and apply for loans from RBI-regulated banks and NBFCs — all from your phone, in the language you're most comfortable with.

SwiftLoan is a loan-comparison and referral platform, not a lender. Loans are provided by our regulated Lending Partners, who make all credit decisions.

WHY SWIFTLOAN

• Check eligibility in minutes — answer a few questions and see where you stand, with no branch visits.
• Compare partner offers — transparent offers from 15+ regulated partners, ranked by what actually costs you the least.
• A soft check, not a hard one — seeing your eligibility does not affect your credit score.
• Your data, your consent — nothing is shared with any lending partner until you explicitly choose to apply.
• In your language — use SwiftLoan in English, हिन्दी, or తెలుగు.
• Talk, don't type — an optional voice assistant can guide you through the whole journey, hands-free.

HOW IT WORKS

1. Tell us what you need — loan amount, tenure, and a few basic details.
2. We run a soft eligibility check and pull comparable offers from our partners.
3. Compare interest, EMI, tenure, and total cost side by side.
4. Choose an offer and continue securely to that lending partner to complete your application.
5. Track your applications and active loans, with EMI reminders, in one place.

BUILT FOR TRUST

• We collect only what's necessary (data minimization).
• We never store your full Aadhaar, Aadhaar image, or a biometric selfie.
• OTPs are stored only in hashed form.
• Aligned with the DPDP Act and RBI's Digital Lending Guidelines.

SwiftLoan is a technology platform and Lending Service Provider (LSP) operating a Digital Lending App. Loan approval, interest rates, and disbursal are determined solely by the RBI-regulated Lending Partner. Terms and eligibility vary by partner. Loans are subject to the partner's approval; this app does not guarantee any loan, amount, or rate.

Questions? Reach us any time from inside the app or at support@swiftloan.ai.
```

---

## Graphics (already generated in `playstore/`)
| Asset | Spec | File |
|---|---|---|
| App icon | 512×512 PNG | `graphics/play-icon-512.png` |
| Feature graphic | 1024×500 PNG | `graphics/play-feature-graphic-1024x500.png` |
| Phone screenshots | 1320×2640 (2:1), 6 up to 8 | `screenshots/phone/*.png` |

> Note: the phone screenshots are the iOS captures cropped to Play's 2:1 limit. They
> represent the same UI; for a fully native look you can later swap in Android-device
> captures. Google accepts these as-is.

---

## Data safety form (Play Console → App content → Data safety)

Declare (mirrors the app's actual collection):

**Data collected & linked to the user**
- Personal info: Name, Email address, Phone number, Address (PIN code)
- Financial info: Other financial info (income, employment, loan amount/tenure/purpose)
- Financial info: Government/other ID — PAN, last 4 of Aadhaar/bank (NOT full Aadhaar/biometric)
- App activity: Product interaction (analytics)
- App info & performance: Crash logs, Diagnostics (if enabled)
- Audio: Voice recordings — only if the optional voice assistant is used **[confirm vendor retention]**

**Security practices**
- Data is encrypted in transit (HTTPS/TLS): Yes
- Users can request data deletion: Yes (in-app / support@swiftloan.ai) **[confirm]**

**Data shared with third parties:** Lending Partners, only after the user explicitly
chooses to apply (share user-initiated).

## Content rating (Play Console → App content → Content rating)
Complete the IARC questionnaire. Finance app with no objectionable content → expected
**Rated for 3+ / Everyone**, but the questionnaire result governs. **[confirm by completing]**

## Financial-features declaration (Play Console → App content)
Play requires a **Personal loan app declaration** for lending apps in India:
- Country: India
- You are a **loan aggregator / facilitator**, not a direct lender.
- You'll need to provide: the RBI-registered lending partners' names, and supporting
  docs / website proof. **[you must complete this — Google reviews it manually]**

## Target audience & ads
- Target age: 18+
- Contains ads: No **[confirm]**
- In-app purchases: No

## Release
- First release track: **Internal testing** → Closed → **Production** (recommended path).
- versionCode: 4 (bump if a higher code already exists on this package — it's new, so 4 is fine).

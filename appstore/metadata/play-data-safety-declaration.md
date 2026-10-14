# Google Play — Data Safety declaration

Fill this into Play Console → App content → **Data safety**. It is built to match the
live privacy policy (https://swiftloan.ai/privacy-policy) section-for-section, because
Play's #1 rejection reason here is the form and the policy disagreeing.

Why the app was rejected: the form said nothing about data leaving the device, but the
app **does** transmit personal data off-device — both to our own backend and, when the
user chooses an offer, to the Lending Partner. That makes it both **collected** and
**shared**. The declaration below says so.

Key distinction Play cares about:
- **Collected** = sent off the device to us / our processors.
- **Shared** = transferred to a *third party that uses it for their own purposes*.
  Lending Partners independently assess and price the loan → that is **sharing**.
  Upshot (analytics/engagement) and the voice-AI vendor act on our instructions as
  processors → **collected, not shared**.

---

## Top-level questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (TLS — policy §10) |
| Do you provide a way for users to request that their data be deleted? | **Yes** (in-app account deletion + grievance@swiftloan.ai — policy §9, §11) |

---

## Data types — collected / shared / purpose

Purposes used below (all map to Play's list): **App functionality**, **Account management**,
**Fraud prevention / security / compliance**, **Analytics**, **Personalization**,
**Developer communications** (service messages), **Marketing** (only where the user opted in).

### Personal info
| Data type | Collected | Shared | Required | Purposes | Shared with |
|---|---|---|---|---|---|
| Name | Yes | **Yes** | Required | App functionality, Account mgmt, Fraud/compliance | Lending Partners |
| Email address | Yes | **Yes** | Optional | Account mgmt, Developer comms, Marketing (opt-in) | Lending Partners, Upshot (collected only) |
| Phone number | Yes | **Yes** | Required | Account mgmt (OTP), App functionality, Fraud/compliance | Lending Partners |
| Address | Yes | **Yes** | Required | App functionality, Fraud/compliance | Lending Partners |
| Other info — **PAN, DOB, last-4 Aadhaar, last-4 bank a/c** | Yes | **Yes** | Required | App functionality, Fraud/compliance | Lending Partners |

> Play has no "government ID" category in Data Safety — PAN / Aadhaar-last-4 go under
> **Personal info → Other info**. Full Aadhaar number, Aadhaar image, and biometric
> selfie are **not** collected (policy §4.1, §10) — do not declare them.
> Address = PIN code / residential address (policy §4.1).

### Financial info
| Data type | Collected | Shared | Required | Purposes | Shared with |
|---|---|---|---|---|---|
| Other financial info — **income, employer, loan amount / tenure / purpose** | Yes | **Yes** | Required | App functionality (eligibility & offers), Fraud/compliance | Lending Partners |

> Do **not** tick *User payment info* or *Purchase history* — the app takes no payment.
> **Credit score:** the bureau enquiry is run by the Lending Partner, not SwiftLoan
> (policy §4.5, §8). **[confirm]** whether the app itself stores/transmits a displayed
> score (the credit-score screen). If it fetches/stores one → add *Financial info →
> Credit score*, Collected = Yes, Shared = No. If it only deep-links out → leave unticked.

### Photos and videos
| Data type | Collected | Shared | Required | Purposes | Notes |
|---|---|---|---|---|---|
| Photos | **[confirm]** | No | Optional | App functionality | Profile photo / KYC capture (CAMERA). **[confirm]** whether the image is uploaded off-device; if it never leaves the phone, declare Collected = No. |

### Audio
| Data type | Collected | Shared | Required | Purposes | Notes |
|---|---|---|---|---|---|
| Voice or sound recordings | Yes | No | Optional | App functionality (voice assistant "Ruby") | Consent-based; processed by a contracted voice-AI vendor (processor → not "shared"). Tick **"processed ephemerally"** only if the vendor does not retain audio — **[confirm retention]**. |

### App activity
| Data type | Collected | Shared | Required | Purposes |
|---|---|---|---|---|
| App interactions (screens viewed, steps completed, onboarding progress) | Yes | No | Optional | Analytics, App functionality, Personalization |

> Collected via Upshot (processor). Not "shared" — Upshot may not use it for its own
> purposes (policy §8). Upshot receives mobile, name, email, user ID, device details,
> in-app activity; **not** PAN/DOB/address/Aadhaar/credit score.

### Device or other identifiers
| Data type | Collected | Shared | Required | Purposes |
|---|---|---|---|---|
| Device or other IDs | Yes | No | Required | App functionality, Analytics, Developer comms (push) |

> User ID + device details + push/notification identifier (FCM) → Upshot & FCM
> (processors). Not shared for third-party use.

### NOT collected — leave entirely unticked
- **Location** (approximate or precise) — removed from the app; the stray
  `ACCESS_FINE_LOCATION` permission has now been removed from the manifest so the APK
  matches this. The policy declares no location collection.
- Health & fitness, Messages (SMS/email content), Contacts, Calendar, Web browsing
  history, Financial → payment info / purchase history, Audio → music files, Files & docs.

---

## Consistency checklist before you submit
- [ ] Privacy policy URL in Play Console = `https://swiftloan.ai/privacy-policy` (live).
- [ ] Every "Shared = Yes" row is reflected by policy §7 & §8 (Lending Partners) — it is.
- [ ] No permission in the manifest implies data you didn't declare. **Location permission
      removed** (this change). RECORD_AUDIO → Audio (declared). CAMERA → Photos (confirm).
      POST_NOTIFICATIONS / FCM → Device IDs (declared).
- [ ] Resolve the three **[confirm]** items above (credit score, profile/KYC photo upload,
      voice-audio retention) before final submit.
- [ ] Rebuild the AAB/APK after the manifest change so the uploaded artifact has no
      location permission, then re-check the **merged** manifest
      (`build/outputs/logs/manifest-merger-release-report.txt`) in case a dependency
      re-adds FINE_LOCATION — if it does, strip it with `tools:node="remove"`.

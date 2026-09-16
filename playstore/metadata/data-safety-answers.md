# Play Console — Data safety answer sheet (SwiftLoan `ai.swiftloan.app`)

Paste these answers into **App content → Data safety**. Based on the app's actual
collection (see the live Privacy Policy). Items marked **[confirm]** — verify against
your analytics/vendor setup before final submit.

## Section 1 — Overview (the three gate questions)
| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** (in-app / `support@swiftloan.ai`) |

## Section 2 — Data types (for each: Collected = Yes; Shared only where noted)

For every type below, unless stated otherwise:
- **Collected:** Yes · **Shared:** No · **Processing:** Not ephemeral ·
- **Required or optional:** Required (except where marked Optional) ·
- **Purposes:** App functionality, Account management (+ Analytics where noted)

### Personal info
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Name | Yes | **Yes → Lending Partner** | Required | App functionality, Account management |
| Email address | Yes | No | Optional | App functionality, Account management |
| Phone number | Yes | **Yes → Lending Partner** | Required | App functionality, Account management |
| Address (PIN code / city) | Yes | **Yes → Lending Partner** | Required | App functionality |
| Other info (DOB) | Yes | **Yes → Lending Partner** | Required | App functionality |

### Financial info
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| User payment info | No | — | — | — |
| Purchase history | No | — | — | — |
| Credit score | **No** (not collected/shown by the app) | — | — | — |
| Other financial info (income, employment, loan amount/tenure/purpose) | Yes | **Yes → Lending Partner** | Required | App functionality |

> Sharing note: financial + identity data is shared with a Lending Partner **only after
> the user explicitly chooses to apply** — i.e. user-initiated. Declare sharing = Yes.

### Personal identifiers (Financial → "Other" / Personal → "Other IDs")
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| PAN (government ID) | Yes | **Yes → Lending Partner** | Required | App functionality, Fraud prevention |
| Last 4 of Aadhaar / bank (partial IDs) | Yes | **Yes → Lending Partner** | Required | App functionality |
> Full Aadhaar number, Aadhaar image, and biometric selfie are **NOT** collected.

### App activity
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| App interactions (product interaction) | Yes | No | Required | Analytics, App functionality |
| In-app search history | No | — | — | — |

### App info and performance
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Crash logs | Yes | No | Optional | Analytics, App functionality |
| Diagnostics | Yes | No | Optional | Analytics **[confirm if enabled]** |

### Device or other identifiers
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Device or other IDs (user ID / device id) | Yes | No | Required | App functionality, Fraud prevention |

### Audio
| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Voice or sound recordings ("Ruby" assistant) | Yes | **Yes → voice-AI processor (sub-processor)** | **Optional** | App functionality |
> Only if the user turns on the optional voice assistant. **[confirm retention with the voice vendor]**

## Section 3 — Security practices (checkboxes)
- ☑ Data is encrypted in transit
- ☑ Users can request that data be deleted
- ☐ (Optional) Committed to Play Families Policy — N/A (18+ app)
- ☑ Independent security review — **[only tick if you actually have one]**

## Data NOT collected (leave unchecked)
Location, Contacts, Calendar, Photos/videos, Files/docs, Web browsing history,
Health & fitness, SMS/call logs, Payment/purchase info, Credit score.

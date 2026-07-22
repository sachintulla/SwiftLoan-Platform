# SwiftLoan — Use Cases & Test Matrix

Every use case below has a corresponding automated test (Jest + React Native
Testing Library). IDs map to `describe`/`it` blocks in `__tests__/`.

## A. Core logic

| ID | Use case | Expectation |
|----|----------|-------------|
| UC-L1 | Indian currency formatting | `inr(1500000)` → `"15,00,000"`, `inr(45000)` → `"45,000"`, `inr(999)` → `"999"` |
| UC-L2 | Rupee helper | `rupee(25000)` → `"₹25,000"` |
| UC-L3 | Inter weight → family map | `interFamily(800)`→`Inter-ExtraBold`, `700`→`Inter-Bold`, `400`→`Inter-Regular` |
| UC-L4 | EMI amortisation formula | For P=150000, n=24, rate=16% → monthly EMI ≈ ₹7,342 (mid of range) |
| UC-L5 | EMI range spread | emi range = ±(0.92–1.08); interest ±(0.85–1.15); payable ±(0.95–1.05) |

## B. Navigation state machine (`store` reducer + `prevMap`)

| ID | Use case | Expectation |
|----|----------|-------------|
| UC-N1 | Initial screen | store starts on `splash` |
| UC-N2 | `go(x)` sets screen | dispatching go changes `screen` to x |
| UC-N3 | Back-stack (prevMap) | `basic`→`home`, `basicpan`→`basic`, `offers`→`basicpan`, `handoff`→`offers`, `aadhaar`→`kyc`, `creditscore`→`repay`, `language`→`splash`, `aboutyou`→`permissions` |
| UC-N4 | Unknown parent defaults home | screen with no prevMap entry (e.g. `home`) → back = `home` |
| UC-N5 | `set(patch)` merges state | partial patch updates only given keys |
| UC-N6 | `reset` returns to splash | clears state, screen=`splash` |

## C. Internationalisation

| ID | Use case | Expectation |
|----|----------|-------------|
| UC-I1 | English strings | `strings('en').getStarted` === `"Get Started"` |
| UC-I2 | Hindi strings differ | `strings('hi').greeting` !== `strings('en').greeting` |
| UC-I3 | Unknown lang falls back to en | `strings('te')` === `strings('en')` |
| UC-I4 | Parity of keys | every key in `en` exists in `hi` |

## D. Screen rendering (smoke) — no crash + key content

| ID | Screen | Key assertion |
|----|--------|---------------|
| UC-S1 | splash | renders `SwiftLoan` wordmark |
| UC-S2 | language | shows `English`, `हिन्दी`, `తెలుగు`, `Hinglish`, `Tenglish` |
| UC-S3 | intro | `Loans made simple, in your language.` |
| UC-S4 | mobile | `Enter your mobile number` |
| UC-S5 | permissions | `Permissions`, `Allow permissions` |
| UC-S6 | aboutyou | `About you` |
| UC-S7 | home | `Browse loan types` |
| UC-S8 | loans | `My Loans` |
| UC-S9 | fare | EMI calculator renders (`Your monthly EMI`) |
| UC-S10 | basic | `Tell us about yourself`, `Step 1 of 4` |
| UC-S11 | basicpan | `Verify your PAN`, `Step 2 of 4` |
| UC-S12 | finding | `Finding your personalised offers…` |
| UC-S13 | offers | `Review Your Offers`, `BlueChip Finance` |
| UC-S14 | handoff | `Secure Handoff`, `Slide to confirm handoff` |
| UC-S15 | kyc | `Complete verification` |
| UC-S16 | aadhaar | `Aadhaar Verification` |
| UC-S17 | panv | `PAN Verification` |
| UC-S18 | bankv | `Bank Verification` |
| UC-S19 | selfie | `Live Selfie` |
| UC-S20 | status | `Business Expansion Loan` |
| UC-S21 | disbursed | `Funds on the way!` |
| UC-S22 | repay | `Repayment Overview` |
| UC-S23 | creditscore | `Credit Score`, `750` |
| UC-S24 | profile | `Account Settings` |
| UC-S25 | help | `How can we help you today?` |

## E. Interaction / flow behaviour

| ID | Use case | Expectation |
|----|----------|-------------|
| UC-F1 | Router renders active screen | Router shows component for `state.screen`, placeholder otherwise |
| UC-F2 | Language selection enables Continue | selecting a language sets `selectedLang`; Continue label becomes `Continue with <lang>` |
| UC-F3 | English/Hindi selection sets lang | selecting English → lang `en`; Hindi → lang `hi` |
| UC-F4 | Mobile Send OTP gating | disabled until 10 digits + terms accepted |
| UC-F5 | Every registered route mounts | rendering each of the 26 routes throws no error |

## F. Non-functional

| ID | Use case | Expectation |
|----|----------|-------------|
| UC-X1 | TypeScript compiles | `tsc --noEmit` exits 0 |
| UC-X2 | No screen import is missing | `SCREENS` registry has an entry for every reachable route |

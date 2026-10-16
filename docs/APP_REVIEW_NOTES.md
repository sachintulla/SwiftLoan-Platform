# SwiftLoan — App Review Notes

For Apple App Store Review and Google Play Review.

| | |
|---|---|
| App | SwiftLoan |
| iOS bundle ID | `ai.swiftloan.app` |
| Android package | `ai.swiftloan.app` |
| Version | 1.1.9 (iOS build 59, Android version code 25) |
| Operated by | Purple Talk India Private Limited |
| Website | https://swiftloan.ai |

SwiftLoan is a loan marketplace. A user enters their details, sees personalised offers from our lending partners, and
applies for the one they choose. **SwiftLoan does not lend money itself.**

---

## 1. Demo account (sign-in required)

Sign-in is by mobile number and a one-time password (OTP). Reviewers cannot receive an SMS, so we have set up a demo
number that accepts a fixed code. **No SMS is sent to this number.**

| | |
|---|---|
| **Mobile number** | `9000000001` |
| **OTP** | `362832` |

This code works for the demo number only. It is not accepted for any other number.

The demo account runs in a sandbox: it uses sample data and does not contact any lender, credit bureau or
verification partner. The offers it shows are labelled **Sample Lender 1 / 2 / 3** and are for review only.

## 2. How to sign in

1. Open the app and choose a language.
2. Tap **Continue with mobile number** and enter the demo mobile number above.
3. Enter the OTP above on the code screen.
4. You are signed in.

## 3. Suggested walkthrough

1. **Apply:** enter a loan amount and tenure, then your basic details.
2. **PAN:** enter the test PAN `ABCPE1234Z`. The app shows it as verified and pre-fills the sample details
   (Demo Reviewer, Bengaluru). **Please do not enter real personal data.**
3. **Offers:** the app searches for matching lenders and shows three sample offers with the interest rate, tenure,
   processing fee and EMI.
4. **Select an offer** to continue. The app creates the sample loan and its repayment schedule.
5. **Loans / Repay:** open **Loans** in the bottom bar to see your applications and repayment schedule.
6. **Profile:** open **Profile** in the bottom bar to view and edit your details, change the language, and manage notifications.

## 4. Permissions and why we ask

| Permission | Why |
|---|---|
| Microphone | Used only by the optional voice assistant, which lets a user navigate the app and fill forms by voice. The app works fully without it. |
| Camera / photos | Used for a profile photo and for capturing a PAN card image. Neither is required to browse the app. |
| Notifications | Application and repayment updates. Optional. |

The app does not access contacts, SMS or location.

## 5. Account deletion

**Profile → Delete account.** This permanently removes the account and its data. The same option is available on
https://swiftloan.ai/account.

## 6. Loan disclosures

Our partner lenders are `[LENDER / NBFC NAMES AND RBI REGISTRATION DETAILS]`. The interest rate range, tenure and an
EMI example are shown before a user applies. Our privacy policy is at `[PRIVACY POLICY URL]`.

## 7. Contact

For any problem signing in or reviewing the app, contact `[SUPPORT EMAIL / PHONE]`. We will respond promptly.

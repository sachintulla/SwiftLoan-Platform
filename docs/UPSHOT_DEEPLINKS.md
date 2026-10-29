# Upshot notifications — inbox and deep links

What a push campaign must carry so that **tapping it opens the right screen**, and how the bell
(Notifications screen) lists every push the user was sent.

## What the app does

- **Bell → Notifications.** The bell on Home opens a Notifications screen listing every push Upshot saved
  for the user (Upshot keeps 90 days). Unread items are highlighted, the bell shows an unread count, and
  tapping an item marks it read and — if it carries a link — opens that screen.
  Code: `src/screens/notifications.tsx`, `src/analytics/upshot.ts` (`fetchUpshotInbox`, `getUpshotUnreadCount`,
  `markUpshotNotificationRead`).
- **Tap a push → screen.** When the user taps a push (app closed, in the background, or open), the app reads
  the campaign's key-value pairs and navigates. Code: `subscribeUpshotLinks` in `src/analytics/upshot.ts`,
  the handler in `src/state/store.ts`, the parsing in `src/analytics/upshotLinks.ts`.
- **`swiftloan://<screen>` links** (SMS, browser, another app) go through the same handler.
  `swiftloan://onboard?token=…` is the separate website-to-app handoff and is untouched.

## The key-value pairs

Add these in the push campaign's **key-value pairs** section (Upshot's deep-link / custom data area).
Three keys on every campaign:

| Key | Value | Purpose |
|---|---|---|
| `screen` | a screen name from the table below | **where the tap goes** (preferred) |
| `deeplink` | `swiftloan://<screen>` | the same destination as a link (used only if `screen` is absent) |
| `event` | the Upshot event that triggers the campaign | reporting / filtering only; the app ignores it |

Any extra pair you add (for example `campaign=diwali`) is kept but does not change navigation.

### Per event

Use the row for the event that triggers the campaign.

| Event that triggers the campaign | `screen` | `deeplink` | Lands on |
|---|---|---|---|
| `swiftloan_otp_not_verified` | `mobile` | `swiftloan://mobile` | Login (enter number / OTP) |
| `swiftloan_install_not_registered` | `mobile` | `swiftloan://mobile` | Login |
| `swiftloan_eligibility_incomplete` | `basicpan` | `swiftloan://basicpan` | PAN verification (start of the application) |
| `offers_got` | `offers` | `swiftloan://offers` | My Offers |
| `offer_viewed` | `offers` | `swiftloan://offers` | My Offers |
| `swiftloan_offer_not_selected` | `offers` | `swiftloan://offers` | My Offers |
| `application_submitted` | `status` | `swiftloan://status` | Application status |
| `swiftloan_kyc_incomplete` | `loans` | `swiftloan://loans` | My Loans |
| `loan_disbursed` | `disbursed` | `swiftloan://disbursed` | Disbursal details |
| repayment / EMI reminder campaigns | `repay` | `swiftloan://repay` | Repayments |
| `swiftloan_lead_no_install` | `home` | `swiftloan://home` | Home |
| `swiftloan_journey_nudge` (generic nudge) | `home` | `swiftloan://home` | Home |
| any other server push rule `swiftloan_<step>_push[_app\|_website]` | pick from the screens below | matching link | – |

Example, for `swiftloan_offer_not_selected`:

```
screen   = offers
deeplink = swiftloan://offers
event    = swiftloan_offer_not_selected
```

### Screens a notification may open

| `screen` value | Opens | Needs login |
|---|---|---|
| `home` | Home | yes |
| `offers` (also `myoffers`, `fare`) | My Offers | yes |
| `compare` | Compare offers | yes |
| `loans` (also `myloans`) | My Loans | yes |
| `basicpan` (also `apply`) | PAN verification / start an application | yes |
| `status` | Application status | yes |
| `disbursed` | Loan disbursed | yes |
| `repay` (also `emi`, `repayments`) | Repayments | yes |
| `profile` | Profile | yes |
| `referral` | Refer a friend | yes |
| `notifications` (also `inbox`) | The Notifications screen | yes |
| `calculator` | EMI calculator | no |
| `help` | Help & Support | no |
| `mobile` | Login | no |

Anything else is ignored (the app just opens normally): unknown names, and mid-flow screens that depend on
saved state (`lenderweb`, `handoff`, `finding`, …). The list is `LINKABLE_SCREENS` in
`src/analytics/upshotLinks.ts`.

### Signed-out users and cold starts

- A target that needs login, tapped by a signed-out user, opens **Login**; once they sign in they land on
  Home and are then taken to the target.
- A tap that **launches** the app waits for the splash / privacy gate, then opens the target once the user is
  on Home signed in.

## Setting up a campaign in Upshot

1. Create the push campaign as usual and pick the trigger event.
2. Add the key-value pairs from the table (`screen`, `deeplink`, `event`).
3. Turn on whatever the campaign form calls **save to inbox / notification center** so the push appears in
   the bell. Without it the push is delivered but not listed in the Notifications screen.
4. Test on a device (see below).

## Testing

1. Install a build, sign in, and send a test campaign with `screen=offers`.
2. **App closed:** tap the push → the app opens on My Offers.
3. **App open / backgrounded:** same.
4. Open the bell: the push is listed, unread; tapping it marks it read and opens My Offers.
5. From a phone browser or `adb`: `adb shell am start -a android.intent.action.VIEW -d "swiftloan://repay"`.

## Known limits

- **iOS, external links:** the `swiftloan` scheme is registered in `Info.plist` and `AppDelegate.swift`
  forwards `application(_:open:options:)` to React Native by posting the `RCTOpenURLNotification` that
  `RCTLinkingManager` listens for (no React header needed in Swift). **Written without an Xcode build — verify
  on a device/TestFlight build:** open `swiftloan://repay` from Safari or a note and confirm the app lands on
  Repayments, both when it was running and when it was closed.
- **Payload shape:** Upshot does not document where a campaign's key-value pairs appear in the tap payload, so
  the parser searches the whole payload (nested objects, JSON inside strings, `[{key, value}]` lists). If a
  device test shows a tap that does not navigate, log the payload (`[upshot] link ->` in debug builds) and
  adjust `extractLinkTarget`.
- **Inbox fields:** the list reads `title`/`message` (falling back to `etitle`/`emsg`), `read`, `image_url`
  and the link from `appData`; the response has no timestamp, so none is shown.
- The Notifications screen text is English only for now (the other screens use the translated string table).

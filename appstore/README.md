# App Store submission kit — SwiftLoan

Everything needed to submit SwiftLoan (`ai.swiftloan.app`, v1.1.6 build 7) to the
App Store. Generated for iPhone (the app is iPhone-only: `TARGETED_DEVICE_FAMILY = 1`).

```
appstore/
├── icon/
│   └── AppStore-icon-1024.png      # 1024×1024, sRGB, no alpha — the marketing icon
├── screenshots/
│   └── iphone-6.9/                 # 1320×2868 — the only required iPhone size today
│       └── 01..NN-*.png
└── metadata/
    └── app-store-listing.md        # name, subtitle, description, keywords, privacy label…
```

## What Apple requires (and what's here)

| Requirement | Status |
|---|---|
| App icon 1024×1024, no alpha, sRGB | ✅ `icon/AppStore-icon-1024.png` |
| In-app icon set (all sizes) | ✅ already in `ios/SwiftLoan/Images.xcassets/AppIcon.appiconset` |
| iPhone 6.9" screenshots (1320×2868), 1–10 | ✅ `screenshots/iphone-6.9/` |
| iPhone 6.5" / 5.5" screenshots | Not required — App Store Connect scales the 6.9" set down |
| iPad screenshots | Not applicable (iPhone-only app) |
| Listing text, keywords, URLs | ✅ `metadata/app-store-listing.md` |
| App Privacy nutrition label | ✅ documented in the metadata file |
| Export compliance answer | ✅ documented (HTTPS-only, exempt) |

> Screenshots are captured from a **Release** build on an iPhone 16 Pro Max
> simulator (native 1320×2868), so they are pixel-exact for the 6.9" slot. You can
> upload just this one size; App Store Connect no longer needs the smaller sizes.

## How to submit (App Store Connect web UI — no extra tooling needed)

1. **Upload the binary.** Archive in Xcode (Product ▸ Archive, "Any iOS Device"),
   then Distribute App ▸ App Store Connect ▸ Upload. (Or use Transporter with an
   exported `.ipa`.) This is the one step that needs your Apple credentials.
2. In **App Store Connect ▸ My Apps ▸ SwiftLoan**, create the 1.1.6 version if it
   doesn't exist.
3. **Media:** drag `icon/AppStore-icon-1024.png` into App Icon, and the files from
   `screenshots/iphone-6.9/` into the 6.9" iPhone slot (in order).
4. **Text:** copy each field from `metadata/app-store-listing.md`.
5. **App Privacy / Age rating / Export compliance:** answer per the metadata file.
6. Attach the uploaded build, fill **App Review Information** (demo login is in the
   metadata file), and **Submit for Review**.

## Direct (automated) submission

Fully automated submission is **not wired on this machine** — there's no App Store
Connect API key and no fastlane installed, and I can't enter Apple credentials for
you. If you want me to automate it, place an App Store Connect API key at
`~/.appstoreconnect/private_keys/AuthKey_XXXX.p8` and give me the **Key ID** and
**Issuer ID**; then I can:
  - upload the build with `xcrun altool`/Transporter, and
  - push metadata + screenshots and submit via `fastlane deliver`.
The actual "Submit for Review" is an irreversible public action, so I'll confirm
with you before firing it.

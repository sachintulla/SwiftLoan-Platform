# Building the two SwiftLoan APKs (Windows)

Two standalone APK variants are produced from one codebase, differing by the
`CONTEXT_ENABLED` flag in `src/config/build.ts`:

- **generic** (`CONTEXT_ENABLED = false`) — neutral onboarding, ignores install links.
- **context** (`CONTEXT_ENABLED = true`) — resumes the journey from a
  `swiftloan://onboard?token=…` deep link (WS3 context-aware install).

## Windows build constraints (why it's done this way)

- **260-char path limit** breaks the native C++ codegen unless built through a
  short path → we build gradle through a `subst X:` drive (see
  [[swiftloan-android-build]] memory).
- **Metro can't bundle through the `subst` drive** (drive-mismatched SHA-1), and
  native can't compile from the real deep path. So we **pre-bundle the JS from the
  real `C:\` path**, drop it in `android/app/src/main/assets`, then build via `X:`
  (which skips JS bundling for `assembleDebug`). The APK ships standalone (bundle
  packaged, no Metro needed).
- These are **debug-signed** builds (installable, self-contained). A production
  release build is best done on CI/Linux/macOS where the `subst` workaround isn't
  needed.

## Steps (per variant)

```powershell
# 0. map the short drive once
subst X: C:\Users\veerendra.bhimireddy\Swiftloan_Webdashboard\SwiftLoan-Platform

# 1. set the variant in src/config/build.ts  (CONTEXT_ENABLED true|false)

# 2. pre-bundle the JS from the REAL path (Metro works here)
cd C:\Users\veerendra.bhimireddy\Swiftloan_Webdashboard\SwiftLoan-Platform
npx react-native bundle --platform android --dev false --entry-file index.js `
  --bundle-output android/app/src/main/assets/index.android.bundle `
  --assets-dest android/app/src/main/res

# 3. build the APK through the short drive
cd X:\android
.\gradlew.bat assembleDebug

# 4. collect the artifact
copy X:\android\app\build\outputs\apk\debug\app-debug.apk `
  C:\...\SwiftLoan-Platform\dist\swiftloan-<variant>.apk
```

Then upload both to the public release:

```bash
gh release create v1 --repo veerendrabhimireddy/swiftloan-apks \
  dist/swiftloan-context.apk dist/swiftloan-generic.apk
```

The backend download manifest (`server/src/config/downloads.ts`) points at those
release asset URLs; override with `APK_GENERIC_URL` / `APK_CONTEXT_URL` env vars.

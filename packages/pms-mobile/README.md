# Plix PMS: Android shell

Standalone Capacitor project that wraps the live PMS at `https://theplixgoa.com/pms/login`.
Application ID `com.plix.pms`, independent of the Plix Partner app (`com.plix.partner`):
separate project, keystore and Play listing.

The app loads the live site (`server.url` in `capacitor.config.ts`); `www/` is only a placeholder
the Capacitor CLI requires. Web changes to `/pms` go live without a new app release.

## One-time setup

```bash
cd packages/pms-mobile
npm install
```

Requires JDK 17+ and the Android SDK (`ANDROID_HOME`, e.g. `~/Library/Android/sdk`).

## 1. Sync assets and config

```bash
cd packages/pms-mobile
npm run icons          # only after changing public/pms-icon.svg: regenerates mipmaps and splash
npx cap sync android   # copies capacitor.config.ts and plugins into the native project
```

## 2. Open in Android Studio, or build from the terminal

```bash
npx cap open android                 # Android Studio

cd android
./gradlew assembleDebug              # debug APK  -> app/build/outputs/apk/debug/
./gradlew bundleRelease              # Play Store bundle -> app/build/outputs/bundle/release/app-release.aab
```

## Release signing (before uploading to Play)

1. Create a **new** upload key for this app (do not reuse the Partner app's key):
   ```bash
   keytool -genkeypair -v -keystore android/plix-pms-upload.jks -alias plix-pms-upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. `cp android/keystore.properties.example android/keystore.properties` and fill it in.
   Both the `.jks` and `keystore.properties` are gitignored. Back the key up somewhere safe:
   losing it blocks future updates unless Play App Signing recovery is set up.
3. `cd android && ./gradlew bundleRelease` now produces a signed `.aab`.

Without `keystore.properties`, `bundleRelease` still builds, but the bundle is **unsigned** and Play will reject it.

## Before each release

Raise `versionCode` (must increase every upload) and `versionName` in `android/app/build.gradle`.

## Known limitation

Android's WebView does not implement `window.print()`, so "Print / Save PDF" on Stay Vouchers and Tax
Invoices does nothing inside the app (it works in a normal browser). Share to WhatsApp, Call and
Maps links work. Printing needs a native print bridge if you want it in-app.

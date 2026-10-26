# LiANN HUB Android app

A Trusted Web Activity (the same kind as PolyFlow's Android app) that opens the live hub at https://app.lwliann.com in its own window. It contains no copy of the site: a hub deploy reaches the app at once. It works on Android phones and tablets (Android 7.0 or newer, with Chrome).

Package `com.lwliann.hub`, version 0.1.0 (code 1). Generated from the PolyFlow project with the Bubblewrap layout; the Gradle wrapper, minimum SDK 24 and the androidbrowserhelper library are kept as they were.

## Build
The "HUB Android app" workflow builds it in the cloud (it needs no Android tools on any PC). Run it by hand from the Actions tab, or it runs when files here change. It always makes `LiANN-HUB-Android-<version>-debug.apk`, signed with a throwaway debug key, for testing on a phone. Nothing is published.

## Release (owner)
A file you can put on Google Play, or share, needs your own signing key. Make a keystore on your PC (keep it and its passwords out of the repository and out of chat), then add four repository secrets: `HUB_ANDROID_KEYSTORE_B64` (the keystore, base64), `HUB_ANDROID_KEYSTORE_PASSWORD`, `HUB_ANDROID_KEY_ALIAS` and `HUB_ANDROID_KEY_PASSWORD`. With them present the workflow also makes a signed release APK and an App Bundle, and prints the certificate's SHA-256 fingerprint in the run summary.

## Full-screen mode needs one more file
Android only hides the browser address bar (full-screen "trusted" mode) when https://app.lwliann.com/.well-known/assetlinks.json names this package and the signing certificate's SHA-256 fingerprint. Until then the app still works, but shows a thin Chrome address bar. When you have the release fingerprint, add it to that file in this repo (a hub deploy publishes it). A debug build never matches, because its key is different on every run.

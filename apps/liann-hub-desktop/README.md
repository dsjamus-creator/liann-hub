# LiANN HUB desktop installers

This is a small desktop window for the live HUB at <https://app.lwliann.com/>. It does not copy account data or bundle an offline version of the site. Email-code sign-in works within the window. Links to other secure sites open in the normal browser.

## Build

From this directory, run `npm ci`, `npm test`, and then `npm run dist:win` on Windows or `npm run dist:mac -- --x64 --arm64` on macOS. The installers appear in `dist/`. The repository's **HUB desktop installers** GitHub Action builds both platforms and keeps the files as private workflow artifacts for 30 days.

The Windows `.exe` and Mac `.dmg` from this first build are unsigned. Before public distribution, sign the Windows installer and sign and notarize both Mac builds with the owner's publishing credentials. The desktop app requires an internet connection to use the live HUB.

The icon uses the LiANN lettering from `icons/canonical-logo.png`, copied from the approved Learning with LiANN brand assets. To regenerate the Windows and Mac icon formats, run `python icons/make-icons.py` with Pillow installed.

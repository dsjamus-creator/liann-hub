# PhrasePath note import sources

**Status recorded: 19 November 2026**

This note records which note-source integrations are available, planned, or blocked by platform limits.

## Google Drive

The per-user Google Drive folder and batch import are implemented on the open draft pull requests [liann-hub #91](https://github.com/dsjamus-creator/liann-hub/pull/91) and [lwl-backend #235](https://github.com/dsjamus-creator/lwl-backend/pull/235). Each LWL account saves its own selected folder. Before this can go live, both changes need deployment, Google Picker and Drive APIs need enabling, the web OAuth client must authorize the app origin and `drive.file`, and the backend needs a restricted Picker API key.

## Microsoft OneDrive

**Planned; not implemented yet.** Use Microsoft's OneDrive File Picker v8 for a user's own OneDrive, then send selected files through the same PhrasePath batch importer. Authentication needs a Microsoft app registration and delegated read permission. OneDrive personal and work/school accounts have different authority and picker token requirements, so the connection must be configured for the intended account types before implementation is enabled. No Microsoft tokens should be stored by the notes backend.

## Apple Notes: available file import

The PhrasePath web importer accepts Apple Notes exports such as Markdown and PDF, including multiple files selected through the device's file picker. On supported iPhone and iPad versions, the user can export a note as Markdown or PDF, save it in Files, then select the saved file in PhrasePath. Markdown is the better choice for editable text; PDF preserves a visual copy.

## Apple Notes: unresolved today

- Apple does not provide a public Notes API for PhrasePath to enumerate, read, edit, or background-sync a user's Notes account.
- Direct account linking and automatic import of all Apple Notes cannot be implemented through Apple's supported Notes APIs.
- The current PhrasePath repositories contain no native iOS/iPadOS app target. A **PhrasePath Share Extension** therefore cannot be added to the hosted website alone. It needs an installable native app or companion app, signed and distributed for Apple devices.
- Once a native app exists, a Share Extension can receive a note that the user explicitly exports/shares. It still will not grant background access to the entire Notes account.
- Bulk export of all notes, automatic folder/tag/checklist/attachment round-tripping, and preservation of Apple Notes collaboration state remain unavailable through the current web integration. Files exported by the user can be batch imported; export fidelity depends on the chosen format. Apple notes that PDF export of a note containing a multipage PDF or scan may include only the first page of that embedded document.

## Next implementation steps

1. Deploy the paired Google Drive changes after the Google Cloud settings are ready.
2. Add OneDrive Picker v8 after the Microsoft app registration and account audience are settled.
3. Scope an installable PhrasePath iOS app and Share Extension separately. Until then, retain Apple Notes export-to-Files batch import.

## References

- [Apple: Export or print notes on iPhone](https://support.apple.com/en-mide/guide/iphone/iphdf551cfa2/ios)
- [Apple Developer Forums: Apple Notes API](https://developer.apple.com/forums/thread/813810) — Apple Developer Technical Support confirms there is no Notes API and that AppleScript is Mac-only.
- [Apple: Share extensions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html)
- [Microsoft: OneDrive File Picker v8](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/)

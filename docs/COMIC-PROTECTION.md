# Comic page protection

What stops the comic pages being saved or copied, and what does not. Nothing can stop a screenshot of something shown on a screen; these measures make casual saving hard, keep the files off the public internet, and mark every copy. The comic links stay public: anyone can read without signing in.

## What is in place

| Measure | How |
|---|---|
| No image menu | Page images take no clicks (`pointer-events: none`), so long-press / right-click offer no "Download / Copy / Share image". The reader also blocks the context menu, dragging, text selection, copy, and Ctrl/Cmd + S / P / C. Printing the page prints nothing. |
| Pages are not public files | The pages live in the **private `liann-reader` bucket**, read only by the hub's Worker (`worker/index.js`). The hub's page addresses are `/comic/<episode>/<page>.webp`. |
| Public link, no sign-in | A shared comic link (`https://app.lwliann.com/#read/ep1a`) opens the comic for anyone, signed in or not. The reader asks the Worker (`POST /comic/sign`) for links; a signed-in user's links are tied to their account (checked with Supabase), everyone else's to a hash of their address. The rest of the hub still needs a sign-in, and closing a shared comic leads to it. |
| Links expire | A link is signed (HMAC-SHA256) for one page and expires after 30 minutes. A copied link stops working; the reader quietly fetches new ones while it is open. The signing key is made fresh at every deploy and lives only in the Worker. |
| Images only, from the hub only | The Worker serves a page only to an `<img>` or WebGL texture on app.lwliann.com (`Sec-Fetch-Dest: image`, same origin). "Open image in new tab", another site embedding it, or pasting the link into the address bar all get 403. |
| Slowed bulk copying | Per reader (account, or address): 120 sign requests and 1,500 page images per 10 minutes (a classroom can share one address). The counters sit in the Worker's memory, so this is a brake on scripts, not an exact limit. |
| Marked copies | A faint tiled mark covers the whole reader, so a screenshot carries it: the signed-in address, or a viewing code ("Learning with LiANN · 0125B90F") for a visitor who is not signed in. A code cannot be traced to a person, so it deters rather than identifies. |
| Reader-size files | The reader files are 1067 × 1600 px WebP. The print-resolution files stay in Drive and are never served. |

## Where the files live

The reader files are in a **separate private bucket, `liann-reader`**, which has no public address (r2.dev is off and it has no custom domain). Only the hub's Worker can read it, through its R2 binding, so no firewall rule is needed.

The old public page copies that were under `comics/ep-01/` in the `liann-downloads` bucket were deleted on 2026-10-18 after the Worker went live. Only the two Read-card covers (`cover-a.webp`, `cover-b.webp`) remain there, and they are meant to be public. A copy cached at Cloudflare's edge can linger for up to 4 hours after a delete.

To add another episode: upload its pages to `liann-reader` under `reader/<episode>/<page>.webp`, list them in `data/comics.json` as `comic/<episode>/<page>.webp`, and keep only the cover thumbnails in the public bucket.

## The deploy token

`wrangler deploy` now also binds the R2 bucket. If the Deploy hub run fails with a permissions error naming R2 (the Worker is bound to `liann-reader`), add **Workers R2 Storage: Edit** to the token stored as the `CLOUDFLARE_API_TOKEN` repository secret.

## Not covered (by design or by nature)

- Screenshots and screen recordings.
- A signed-in reader pulling the page responses out of the browser's developer tools within the 30 minutes. This is the hardest thing to prevent on any website.
- The **Issue One PDF** download on the Read page is a separate, deliberate full copy. To be decided separately.

## Files

- `worker/index.js`: sign-in check, signed links, headers, limits. Runs only for `/comic/*`; every other address is the static site as before.
- `src/pages.js`: the hub's page signer and the watermark.
- `tests/protect.test.mjs`: Worker and signer tests; the smoke test checks the reader end to end.

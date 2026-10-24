# Comic page protection

What stops the comic pages being saved or copied, and what does not. Nothing can stop a screenshot of something shown on a screen; these measures make casual saving hard, keep the files off the public internet, and mark every copy. Reading requires a LiANN account.

## What is in place

| Measure | How |
|---|---|
| No image menu | Page images take no clicks (`pointer-events: none`), so long-press / right-click offer no "Download / Copy / Share image". The reader also blocks the context menu, dragging, text selection, copy, and Ctrl/Cmd + S / P / C. Printing the page prints nothing. |
| Pages are not public files | The pages live in the **private `liann-reader` bucket**, read only by the hub's Worker (`worker/index.js`). The hub's page addresses are `/comic/<episode>/<page>.webp`. |
| Account required | A shared comic link (`https://app.lwliann.com/#read/ep1a`) opens the sign-in screen. After sign-in the reader asks the Worker (`POST /comic/sign`) for links using the LiANN access token. An invalid token or an unavailable identity service fails closed. |
| Links and reader cookie expire | A link is signed (HMAC-SHA256) for one page and expires after 30 minutes. The Worker also issues a short-lived, signed, HttpOnly, Secure, SameSite reader cookie tied to that account. A copied link without the cookie cannot load a page. Sign-out clears the cookie. The reader refreshes links while open. The signing key lives in the Worker secret. |
| Images only, from the hub only | The Worker serves a page only to an `<img>` or WebGL texture on app.lwliann.com (`Sec-Fetch-Dest: image`, same origin). "Open image in new tab", another site embedding it, or pasting the link into the address bar all get 403. |
| Slowed bulk copying | Per account: 120 sign requests and 1,500 page images per 10 minutes. The counters sit in the Worker's memory, so this is a brake on scripts, not an exact limit. |
| Marked copies | A faint tiled mark covers the whole reader, so a screenshot carries the signed-in address. |
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
- A reader with an account can still capture page responses from the browser. The account cookie limits link sharing but does not provide digital rights management.
- The old **Issue One PDF** URL was previously public. A Cloudflare rule now blocks its direct delivery (verified HTTP 403 on 24 October 2026). Reintroducing a PDF requires account-aware delivery from private storage.

## Files

- `worker/index.js`: sign-in check, signed links, headers, limits. Runs only for `/comic/*`; every other address is the static site as before.
- `src/pages.js`: the hub's page signer and the watermark.
- `tests/protect.test.mjs`: Worker and signer tests; the smoke test checks the reader end to end.

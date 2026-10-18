# Comic page protection

What stops the comic pages being saved or copied, and what does not. Nothing can stop a screenshot of something shown on a screen; these measures make casual saving hard, keep the files off the public internet, and mark any copy with the reader it came from.

## What is in place

| Measure | How |
|---|---|
| No image menu | Page images take no clicks (`pointer-events: none`), so long-press / right-click offer no "Download / Copy / Share image". The reader also blocks the context menu, dragging, text selection, copy, and Ctrl/Cmd + S / P / C. Printing the page prints nothing. |
| Pages are not public files | The pages live in the **private** `reader/` folder of the `liann-downloads` bucket, read only by the hub's Worker (`worker/index.js`). The hub's page addresses are `/comic/<episode>/<page>.webp`. |
| Sign-in required | The reader asks the Worker (`POST /comic/sign`) for links. The Worker checks the visitor's Supabase token with Supabase itself, so only signed-in LiANN users get links. |
| Links expire | A link is signed (HMAC-SHA256) for one page and expires after 30 minutes. A copied link stops working; the reader quietly fetches new ones while it is open. The signing key is made fresh at every deploy and lives only in the Worker. |
| Images only, from the hub only | The Worker serves a page only to an `<img>` or WebGL texture on app.lwliann.com (`Sec-Fetch-Dest: image`, same origin). "Open image in new tab", another site embedding it, or pasting the link into the address bar all get 403. |
| Slowed bulk copying | Per user: 30 sign requests and 400 page images per 10 minutes. The counters sit in the Worker's memory, so this is a brake on scripts, not an exact limit. |
| Traceable copies | A faint tiled mark with the signed-in address covers the whole reader, so a screenshot shows who opened it. |
| Reader-size files | The reader files are 1067 × 1600 px WebP. The print-resolution files stay in Drive and are never served. |

## Two one-time steps in the Cloudflare dashboard (owner)

The reader files were uploaded to `reader/ep-01/` in the same bucket that serves downloads.lwliann.com, so until step 1 is done they are publicly reachable at `https://downloads.lwliann.com/reader/ep-01/000.webp`.

1. **Block `/reader/` on the downloads domain.** Cloudflare → lwliann.com → Security → WAF → Custom rules → Create rule:
   - Expression (edit as expression): `(http.host eq "downloads.lwliann.com" and starts_with(http.request.uri.path, "/reader/"))`
   - Action: **Block**.

   The Worker reads the bucket through its R2 binding, which a WAF rule does not affect. Check: `https://downloads.lwliann.com/reader/ep-01/000.webp` should say it is blocked, and the comic should still open in the hub.
2. **After the hub deploy, remove the old public copies** of the pages (`comics/ep-01/000.webp` … `022.webp`, `cover-a-page.webp`, `cover-b-page.webp`). Keep `comics/ep-01/cover-a.webp` and `cover-b.webp`: they are the covers on the Read cards and stay public. Claude can delete them on request.

## The deploy token

`wrangler deploy` now also binds the R2 bucket. If the Deploy hub run fails with a permissions error naming R2, add **Workers R2 Storage: Edit** to the token stored as the `CLOUDFLARE_API_TOKEN` repository secret.

## Not covered (by design or by nature)

- Screenshots and screen recordings.
- A signed-in reader pulling the page responses out of the browser's developer tools within the 30 minutes. This is the hardest thing to prevent on any website.
- The **Issue One PDF** download on the Read page is a separate, deliberate full copy. To be decided separately.

## Files

- `worker/index.js`: sign-in check, signed links, headers, limits. Runs only for `/comic/*`; every other address is the static site as before.
- `src/pages.js`: the hub's page signer and the watermark.
- `tests/protect.test.mjs`: Worker and signer tests; the smoke test checks the reader end to end.

# Rotten

## Function

Rotten keps the Google Chrome history clean.

### What "keep" and "delete" in the learned rules means

- **Scope defaults to the whole host, but is editable.** The popup's Keep/Delete buttons for a pending host are paired with a "Scope" field, pre-filled with the path of the last-seen visit, that you can edit or clear before resolving. Clearing it (or leaving it blank) applies "keep"/"delete" to the *whole domain*; narrowing it to a path prefix scopes the rule to just that prefix. The View Rules page shows `(whole domain)` in the path-prefix column for host-wide rules.
- **"Delete" doesn't stop the write, it removes it right after.** Chrome always records a visit first; Rotten only finds out afterward (`onVisited` fires post-write). So "delete" means: written, then immediately removed by Rotten, every single time that host is visited again — not "never saved" in the strictest sense.
- **"Keep" just means Rotten does nothing.** The entry Chrome already wrote simply stays as-is.

## Rules

### Hard rules (always on, never asked about — checked in this order, first match wins)

1. **Bookmarked** — any URL that's also in Chrome Bookmarks (exact match) gets deleted.
2. **Cloudflare interstitial** — title is exactly `"Just a moment..."` **and** the URL contains `__cf_chl`.
3. **Auth keyword** — URL contains `login`, `oauth`, `auth`, `signin`, or `sign-in` as an exact word (regex `\b...\b`, case-insensitive) — `authentication`/`authuser` don't trigger it, a real `/login`, `/auth/`, `?oauth=`, `/signin`, or `/sign-in` does.
4. **Search results** — `duckduckgo.com/?q=...` or `google.com/search?q=...`. Bare homepages are unaffected.
5. **YouTube/Google Docs duplicate merge** — extracts the `v=` video-id (YouTube `/watch` pages) or the `/d/<doc id>/` segment (`docs.google.com` presentation/document/spreadsheets). First time a given id is seen, it's kept; any later visit with the same id is deleted immediately. No history scan — each tracking-param variant (`list=`, `index=`, `sttick=`, `slide=`, `pli=`, ...) is its own distinct URL, so this just remembers "have I seen this id before" going forward.
6. **Whole-domain noise** — every path deleted, no exceptions: `accounts.google.com`, `calendar.google.com`, `chat.google.com`, `mail.google.com`, `meet.google.com`.
7. **Bare-homepage noise** — only the bare homepage is deleted, anything with a path is untouched: `drive.google.com`.
8. **GitHub path rules** (`github.com` only):
   - Delete: `/search...`, `/login`, `/sessions...`, `/settings/...`, and (for any `owner/repo/<category>/...` URL) `edit`, `compare`, `tree`, `invitations`
   - Delete: bare org/user profile (`github.com/<name>`, exactly 1 path segment)
   - Keep: bare repo (`github.com/<owner>/<repo>`, exactly 2 segments) — kept by default, deleted only if bookmarked (rule 1 handles that)
   - Keep: `blob`, `issues`, `pull` — not filtered further by specific-item vs. bare tab-listing; real data reviewed never produced a bare `/issues` or `/pull` hit to test that distinction
9. **LinkedIn allowlist** (`linkedin.com`/`www.linkedin.com` only) — keep only:
   - Contact pages: `/in/<slug>`, excluding the owner's own profile (`brock-walters-247a2990`, hardcoded — **update if the vanity URL ever changes**)
   - Individual posts: `/feed/update/urn:li:activity:...`
   - Company posts-listings: any path containing both `/company/` and `/posts`
   - Everything else on the domain is deleted (feed, search, network browsing, the OAuth/2FA chain, own profile, saved posts). The `/posts/<slug>-activity-<id>` permalink shape mentioned in the old PROTOCOL.md was never actually observed in real data, so it's not implemented — only `/feed/update/urn:li:activity:...` is.

Anything not matched by a hard rule falls through to learned rules, then the discovery queue.

### Learned rules (the discovery queue)

- First visit to a new host → added to `pending`, a notification fires immediately (title = host, buttons: Keep / Delete future visits). Repeat visits to the same still-pending host just increment a counter, no repeat notification.
- Resolving it via the notification buttons records a host-wide rule: `{ host, pathPrefix: null, action, createdAt }`. Resolving via the popup's Keep/Delete uses the editable Scope field instead, so `pathPrefix` is whatever's in that field at the time (or `null` if left blank) — most-specific `pathPrefix` wins, host-only is the fallback.
- "Skip for now" just removes it from the queue without learning anything — it'll resurface next visit.

### No retroactive deletion, anywhere

Nothing the extension does ever reaches backward into history that existed before the decision was made — not the hard rules (they only ever evaluate a visit at the moment `onVisited` fires), and not resolving a discovery-queue entry (recording a rule only affects visits from that point forward; the visit that triggered the prompt, and anything else already in history for that host, is left untouched). This was a deliberate later correction — an earlier version swept and deleted existing history for a host the moment you said "delete," and that behavior was removed.

### Mechanics

- **Storage** (`chrome.storage.local`): `rules` (learned host/path rules), `pending` (discovery queue), `notificationMap` (live notification id → host, for the button-click handler), `canonical` (YouTube/Google Docs id → first-seen URL).
- **Badge**: toolbar badge shows the pending-queue count.
- **View Rules page** (`options.html`): shows the hard rules (static, not editable) and the learned rules (removable).
- **No audit log / no undo**: deletions are immediate and permanent. There's currently no record of what got deleted or when, unlike the old bash script's backup-before-write approach.
- **Not implemented**: the generic "keep only the first visit, drop later re-visits to the exact same URL" trim (the old script's Rule 9) — it would require scanning existing history, which conflicts with "no retroactive deletion." Only YouTube/Google Docs get duplicate-merging, and only prospectively.

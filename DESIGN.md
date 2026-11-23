# Rotten design

Restored from the original `chrome-extension/PROTOCOL.md` (commit `87af085`, deleted in `06c2945`), rewritten to describe what the code does as of 1.3.14. Lines marked **DRIFT** differ from the original design. Each needs a decision: keep or revert.

## Purpose

Keep the Google Chrome history clean by deleting noise visits as they happen.

## Principles

- **Delete means remove right after.** Chrome writes the visit first; Rotten removes it when `history.onVisited` fires.
- **Allow means do nothing.** The visit Chrome wrote stays.
- **No retroactive deletion.** Rules only act on visits from the moment they exist. Nothing reaches back into older history.
  - **DRIFT (1.3.12):** bookmarking a page deletes the visit that was just made, after the fact.

## Order of evaluation (per visit)

1. Rotten's own pages (`chrome-extension://<own id>/`): delete. **DRIFT (1.3.6)**
2. Non-http(s) URLs: ignore entirely.
3. Built-in rules, first match wins (below).
4. Bookmarked (exact URL match): delete. **DRIFT:** originally checked first; now after the built-in rules. Only changes which reason is logged.
5. Duplicate merge (YouTube, Google Docs, Google Drive).
6. Learned rules.
7. Otherwise: discovery queue.

## Built-in rules

All delete. Checked in this order:

1. **Cloudflare interstitial:** title is exactly `Just a moment...` and URL contains `__cf_chl`.
2. **Auth keyword:** URL (decoded once) contains, as a whole word, `login`, `oauth`, `oauth2`, `authorize`, `auth`, `signin`, `sign-in`, `sign-on`, or `sso`. `authorize` followed by `.<letter>` (e.g. `authorize.net`) doesn't count. Every URL on `idmsa.apple.com` counts. **DRIFT (1.3.6 to 1.3.10):** original list was `login`, `oauth`, `auth`, `signin`, `sign-in`.
3. **Search results:** URL contains `duckduckgo.com/?q=` or `google.com/search?q=`.
4. **Google service domains:** every URL on `accounts.google.com`, `calendar.google.com`, `chat.google.com`, `mail.google.com`, `meet.google.com`.
5. **Drive bare homepage:** `drive.google.com` with path empty or `/` only.
6. **GitHub** (`github.com` only):
   - Delete: first path segment `search`, `login`, `sessions`, `settings`.
   - Delete: `owner/repo/<edit|compare|tree>/...`.
   - Keep: everything else, including bare profiles, bare repos, `blob`, `issues`, `pull`, invitations.
   - **DRIFT (1.1.0):** originally also deleted bare profiles and `invitations`.
7. **LinkedIn** (`linkedin.com`, `www.linkedin.com`): keep `/in/*`, `/feed/update/urn:li:activity:*`, and paths containing both `/company/` and `/posts`. Delete everything else.
   - **DRIFT (1.3.2):** originally your own `/in/` profile was also deleted (hardcoded). Now kept; a learned deny rule stands in for it.

## Duplicate merge

First visit to a given id is kept; later visits with the same id are deleted. Ids are remembered in storage, no history scan.

- YouTube: `/watch?v=<id>` on `youtube.com`, `www.youtube.com`.
- Google Docs: `docs.google.com/<document|spreadsheets|presentation>/d/<id>/`.
- Google Drive: `/file/d/<id>`, `/drive/[u/N/]folders/<id>`, `/open?id=<id>`. **DRIFT (1.1.0):** Drive added.

## Learned rules

A rule is `{ host, scope, action, createdAt }`, action `allow` or `deny`.

- **Host:** exact hostname match. `example.com` and `www.example.com` are different hosts.
- **Scope:** `null` means the whole host. Otherwise the scope matches if it appears anywhere in the URL, decoded once. The longest matching scope wins; a whole-host rule is the fallback.
  - **DRIFT (1.3.2):** originally `pathPrefix`, matched with "path starts with."
- If a host has only scoped rules and none match, the visit goes to the discovery queue.

## Discovery queue

- First visit to an unknown host: added to `pending`, and one notification fires.
- Later visits to a pending host only increment its count.
- **Notification:** Allow or Deny saves a whole-host rule. Clicking the body opens View Rules. Closing it leaves the host pending.
- **Popup:** Allow or Deny saves a rule using the Scope field, which starts blank. Blank means whole host. (Before 1.3.15 it was pre-filled with the path of the latest visit.) Skip removes the host from pending without saving a rule; it comes back on the next visit.
- Saving a rule for a host removes that host from pending.
- Bookmarking a URL removes its whole host from pending and clears its notifications, without saving a rule.
- Toolbar badge shows the number of pending hosts.

## View Rules page

Built-in rule descriptions, allow and deny lists with Remove, an Add a rule form (host or full URL, scope, action), and the log file picker. The host field is normalized to a bare hostname; input that doesn't parse as a host saves nothing.

## On install, update, and startup

Rule hosts are normalized the same way, exact duplicates are dropped, and the leftover `ownLinkedInSlug` key is removed. Safe to repeat.

## Deletion log (DRIFT, 1.3.11)

Originally there was no log. Now every deletion is queued in storage with URL, title, reason, and time. Queue keeps the newest 2,000 entries. While View Rules is open with a connected file, entries are appended to that file as JSON Lines.

## Storage (`chrome.storage.local`)

`rules`, `pending`, `notificationMap`, `canonical`, `logQueue`.

## Known problems (from the 2026-11-23 review)

1. Popup Deny pre-filled a narrow scope, so the host came back to pending on any other path. 12 denied hosts were back in pending. **Fixed in 1.3.15 for new rules.** The 51 existing scoped rules are unchanged.
2. A scope of `/` matches every URL, so it acts as a whole-host rule. Same under the original prefix design.
3. ~~Add a rule stored the host verbatim; `example.1password.com/` could never match.~~ **Fixed in 1.3.15.**
4. ~~Revisiting the exact first-seen URL of a YouTube video, Doc, or Drive item deleted it.~~ **Fixed in 1.3.15.** YouTube visits are still all deleted by the learned rule `www.youtube.com /` (see 2).
5. With no log file connected, the log silently drops entries past 2,000.
6. `notificationMap` keeps entries for notifications that are gone (140 found). Cause not verified.
7. The built-in rule descriptions in `options.js` and `README.md` don't list all auth keywords.
8. ~~Stale storage key `ownLinkedInSlug`.~~ **Removed in 1.3.15.**
9. Every subdomain is its own pending host, so no single decision covers a family of hosts.

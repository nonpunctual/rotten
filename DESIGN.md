# Rotten 3.0

Design approved for the 3.0 build: 2026-11-23 22:36 EST.

## Problem

Chrome history should be a record you can search later to find pages again. It's buried under two kinds of rot:

1. **Repeats:** the same pages visited over and over. A dashboard opened 2,384 times becomes thousands of entries that drown out everything else.
2. **Noise:** pages with no value as a record: Google Apps (Mail, Calendar, Docs, Drive), sign-in steps, search results, feeds and notifications, browser-check screens, and pages you've already bookmarked.

## Goals

- **Remove duplicate entries from Chrome's History UI, keeping the oldest.** To do this, never delete the URL (`deleteUrl`) and never re-add it (`addUrl`).
- **No per-site decisions, prompts, or queues.**
- **Duplicates page:** a list of hosts sorted by number of duplicates. Click a host to see its pages, each with its visit count. One button deletes all of that host's duplicates (e.g. thousands of entries). Visited every so often, typically before running the backup. Repeats pile up until then; no duplicate is deleted automatically. Before deleting, it shows the count and asks to confirm (Claude's call).
- **Rules page:**
  - Shows every rule, built-in and added, and adds rules. Every rule can be edited or removed.
  - Built-in rules are ordinary rules, no different from rules the user adds.
  - Rules are delete only; there are no keep or allow rules.
  - Like a bookmark, a rule deletes every matching entry (`deleteUrl`): existing history when the rule is made, and later visits as they happen. Before saving, it shows how many existing entries it will delete and asks to confirm (Claude's call).
- **Making rules:**
  - Claude drafts the starting rule set from the user's history and data; the user approves it. Built-in rules are generic and live in the code; personal rules never go in the repo. The user adds them on the Rules page, which accepts a pasted list: one rule per line, written like a URL without the scheme (e.g. `github.com/search`, `*.linkedin.com`) (Claude's call).
  - From any entry on the Duplicates page: make a delete rule, prefilled with its host and path, editable before saving.
  - Clicking the toolbar icon on any web page opens a rule form for that page: host and path prefilled, editable, saved as a delete rule. The same popup links to the Duplicates, Rules, and Deleted pages.
- **Bookmarks:** bookmarking a page deletes its history (`bookmarks.onCreated`), and later visits to it are deleted. Exact URL match. Uses `deleteUrl`.
- **First run:** the built-in rules and existing bookmarks each delete their matching history once. Rotten shows the counts and asks once before deleting (Claude's call).
- **Rotten's own pages** are always deleted from history (`deleteUrl`).
- Apart from Rotten's own pages, only `http` and `https` URLs are touched; `chrome://`, `file://`, and other extensions' pages are left alone.
- **Deletion log:** every deletion except Rotten's own pages is recorded inside the extension: URL, time, and why (duplicate, rule, or bookmark). A Deleted view shows it, with an export button. Nothing is dropped.
- Every code change is checked against a copy of real Chrome history before release.
- The History database is never written to directly.

## Constraints

- **New codebase,** written from scratch, not a refactor.
- **New extension ID** from a new signing key, created once for 3.0, empty storage. Keep `rotten.pem` backed up (it's gitignored); a different key means a different ID. No data or settings carried over from 1.x.
- **Backup:** `archive.chrome.history.sh` copies each Chrome profile's History and upserts one row per URL per day into a separate `chrome.history.archive.db`. Rows already archived are never removed.
- **Icon:** `icon128.png`, never changes.
- **Plain JavaScript,** no build step, no installed tooling. Tests run outside Chrome, in macOS's built-in JavaScript engine (`jsc`) and `sqlite3`. `jsc` lacks Chrome's URL parser, so the tests use a substitute, checked once against Chrome's.
- Chrome keeps 90 days of history; the backup keeps older history.

## Release

- The user's own install: the unpacked extension loaded from `extension/`.
- GitHub release: `repack.sh` (signed `.crx`, `updates.xml`, configuration profile) and `/Users/Shared/scripty-legacy/build.pkg.sh` (signed, notarized `.pkg`), attached to the release.
- Future: Chrome Web Store.

## URLs vs. visits

- The History database stores **URLs** (one row per address, `urls` table) and **visits** (one row per time a URL was opened, `visits` table). Each entry in Chrome's History UI is a visit.
- **Deleting a URL deletes all its visits.** `history.deleteUrl` "Removes all occurrences of the given URL from the history." (Chrome docs)
- **Chrome's History UI can delete a single visit.** The URL and its other visits remain. (Observed in the UI.)
- **The extension API has no delete-by-visit-ID.** `history.deleteRange` removes every visit in a time range, and "Pages will not be removed from the history unless all visits fall within the range." A range around one visit's time should delete only that visit.

## Duplicates

- **Base URL:** scheme, host, and path. The fragment and all query parameters are dropped, except parameters that identify the page (e.g. `youtube.com` `/watch?v`, `news.ycombinator.com` `/item?id`). Two URLs with the same base URL are duplicates. The identifying parameters are a short list in the code, not rules (Claude's call).
- **Whole history:** `history.search` defaults to the last 24 hours and 100 results, so it's called with `startTime: 0` and a `maxResults` large enough for every URL.
- **Method:** group URLs by base URL; `history.getVisits` on each; keep the oldest visit in the group; `history.deleteRange` removes each other visit (Claude's call).

## Rules

**Host pattern**
- `example.com`: exactly that host.
- `*.example.com`: every subdomain and `example.com` itself.

**Path pattern**
- No path: the whole host.
- `/login`: whole segments from the start. Matches `/login`, `/login/x`. Not `/loginhelp`, not `/docs/login`.
- `/`: the homepage only (path empty or `/`).
- `*` as a segment matches any one segment: `/*/*/edit` matches `/owner/repo/edit/...`.
- `?q` after a path: the URL also has a query parameter `q`. Example: `/?q` on `duckduckgo.com`.
- Matching is case-insensitive and works on the percent-decoded path.

## Built-in rules

No Google Apps entries in history at all: they're most of the junk.

| Host | Path |
|---|---|
| `idmsa.apple.com` | |
| `accounts.google.com`, `calendar.google.com`, `chat.google.com`, `docs.google.com`, `drive.google.com`, `mail.google.com`, `meet.google.com` | |
| `contacts.google.com`, `keep.google.com` (Claude's call: other Google Apps) | |
| `www.google.com`, `google.com` | `/search` |
| `duckduckgo.com` | `/?q`, `/y.js` (ad clicks) |
| `github.com` | `/search`, `/sessions`, `/settings`, `/*/*/edit`, `/*/*/compare` |
| `*.linkedin.com` | |

Each row with several hosts or paths is several rules. Built-in rules are saved to storage on install; a removed built-in rule stays removed (Claude's call).

**Auth words:** a URL is deleted when its host or path contains, as a whole word (as `grep -w` defines a word: letters, digits, and `_`), `login`, `logout`, `oauth`, `oauth2`, `authorize`, `auth`, `signin`, `sign-in`, `sign-on`, or `sso` (a regex). Covers hostnames like `sso.example.com`. Its word list is editable like any rule (Claude's call).

## Build tasks

- Update `repack.sh` for `extension/` and the new key; create the `updates.xml`, `rotten-policy.mobileconfig`, and `distribution.xml` it and `build.pkg.sh` need.
- Check the rules against a copy of current history. Found so far: GitHub repo settings (`/<owner>/<repo>/settings/...`, 61 visits) aren't matched by `/settings`. Bring anything found to the user before changing a rule.
- Test `history.deleteRange` deleting a single visit: how narrow the time window can be, and whether other visits in the same window (e.g. redirects) go too. Duplicate removal depends on it; if it fails, stop and decide with the user before building duplicate removal.
- Find whether `history.search` caps results (the docs give no maximum). If it does, page through history by date.
- Find whether the log fits in extension storage without dropping entries. If not, use Chrome's larger storage option.
- Time a one-click delete of thousands of visits. If it's slow, run it in batches with a progress bar.
- Confirm the unpacked build gets the same ID as the signed one. If not, put the key in the manifest.

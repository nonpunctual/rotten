# Chrome Web Store — Listing Draft

## Overview

What's still needed for a Chrome Web Store submission:

- Register a Chrome Web Store developer account — one-time $5 registration fee via Google account, separate from the Apple dev setup you already have. (Can't be done on your behalf — needs your Google account and payment.)
- Publish the privacy policy at a stable public URL (draft content is ready in `privacy-policy.md`; needs hosting, e.g. GitHub Pages).
- Replace the placeholder screenshots in `screenshots/cws/` with real full-resolution captures — the current ones are old README images padded to size, not ideal for the listing.
- Decide: keep the self-hosted `.crx`/`updates.xml`/`.pkg` flow running in parallel for your own machines, or fold everything into Store-only distribution once it's live? Leaning toward keeping both — Store for easy install by anyone, direct `.pkg` for your own faster iteration without waiting on review.

## Single purpose (required field in Developer Dashboard)

Rotten keeps Chrome's browsing history clean by automatically deleting noisy, duplicate, or transient entries (auth redirects, search-result pages, tracking-parameter duplicates, etc.) as they're written, using built-in and user-editable rules.

## Category

Productivity (alt: Tools)

## Short description (max 132 characters)

Keeps your Chrome history clean by auto-deleting auth redirects, search noise, and duplicate visits — with editable allow/deny rules.

(131 chars)

## Detailed description

Rotten is a Google Chrome extension that keeps your browsing history from becoming rotten.

- It deletes noisy or duplicate site visits as they're written: auth flows, search results, tracking-parameter duplicates, Cloudflare interstitials, and more.
- It learns. When it sees a site or URL pattern it hasn't seen before, it prompts you with a standard desktop notification to allow or deny that pattern — scoped to the whole domain, or narrowed to any text in the URL (a path, a query parameter, etc.). More specific rules win over broader ones.
- Built-in rules already handle common sources of history clutter: login/auth keyword URLs, bookmarked links, Google/DuckDuckGo search results, Cloudflare "Just a moment..." interstitials, GitHub's transient pages, Google Docs/Drive re-visits, Google's account/calendar/chat/mail/meet domains, LinkedIn's feed/search/login pages, and repeat YouTube video visits.
- All rules are visible and editable from the extension's options page — nothing is a black box.

Rotten does everything locally. It never sends your browsing history, bookmarks, or rules anywhere — there's no server, no analytics, no telemetry. See the Privacy Policy for details.

Source, full rule documentation, and issue tracker: https://github.com/nonpunctual/rotten

## Permission justifications (Developer Dashboard requires one per permission)

| Permission | Justification |
|---|---|
| `history` | Core function: Rotten reads newly-written history entries and deletes the ones that match a deny rule (or lack a matching allow rule after being flagged), and needs read access to check for existing entries before pruning. |
| `bookmarks` | Used only to check whether a visited URL exactly matches an existing bookmark, so bookmarked pages are never deleted from history. |
| `notifications` | Used to prompt the user with an allow/deny decision the first time a new site or URL pattern is seen. |
| `storage` | Used to persist the user's allow/deny rules and preferences locally (`chrome.storage.local`); no data leaves the device. |

## Privacy policy URL

TBD — needs to be published at a stable public URL before submission (e.g. GitHub Pages). Draft content: `webstore-assets/privacy-policy.md`.

## Screenshots

Real captures now in `webstore-assets/screenshots/cws/`, current as of 1.3.14: `00-built-in-rules.png`, `01-ui.png` (popup with a live pending queue), `02-rules.png` (learned rules, incl. the add-rule form and Scope column), `03-notification.png`. Content is accurate, but none are submission-ready yet: Chrome Web Store requires exactly 1280x800 or 640x400, full bleed, no padding (per developer.chrome.com/docs/webstore/images). Current files are raw window-crop dimensions (e.g. 1602x1162, 818x1216, 720x296) and need resizing/cropping before upload.

## Open items before submission

- [ ] Register Chrome Web Store developer account ($5 one-time fee)
- [ ] Publish privacy policy at a public URL
- [ ] Replace placeholder screenshots with real full-resolution captures
- [x] Add `author` / `homepage_url` to `chrome-extension/manifest.json`
- [ ] Decide: keep self-hosted `.crx`/`.pkg` distribution alongside the Store listing, or Store-only

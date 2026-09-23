# Rotten — Privacy Policy

_Last updated: 2026-08-20_

Rotten is a Google Chrome extension that removes noisy or duplicate entries from your local browsing history as they're written, and lets you approve or deny that behavior per site.

## What Rotten does with your data

- Rotten reads and deletes entries from your **local Chrome history** (`chrome.history` API) in order to remove auth-flow redirects, duplicate search-result pages, tracking-parameter duplicates, and similar noise, based on built-in and user-defined rules.
- Rotten reads your **bookmarks** (`chrome.bookmarks` API) only to check whether a visited URL exactly matches an existing bookmark, so bookmarked pages are never deleted from history.
- Rotten shows **desktop notifications** (`chrome.notifications` API) to ask whether to allow or deny history entries from a site/pattern it hasn't seen before.
- Rotten stores your allow/deny rules and preferences using `chrome.storage` (**local storage only**).

## What Rotten does not do

- Rotten does not transmit any browsing history, bookmarks, or rules to any server. There is no backend, no analytics, and no telemetry of any kind.
- Rotten does not share, sell, or otherwise disclose your data to any third party, because it never leaves your device.
- Rotten does not use your data for any purpose other than the history-cleanup behavior described above.

## Data retention

All data (history-matching rules, preferences) is stored locally via `chrome.storage.local` and is removed automatically if you uninstall the extension.

## Contact

Questions about this policy: [GitHub repo](https://github.com/nonpunctual/rotten) — open an issue.

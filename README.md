# Rotten

<img src="extension/icon128.png" width="128" height="128" alt="Rotten icon">

## Description

Rotten is a Google Chrome extension that keeps your browsing history from becoming rotten.

- **Duplicates:** 1-click deletion of repeat page visits in Chrome history. The earliest visit is kept.
- **Noise:** Delete entries that match saved rules. Later visits will not make new history entries.
- **Bookmarks:** Bookmark a page. Later visits will not make new history entries. (Uses exact URL match.)

Rotten also includes `archive.chrome.history.sh`: a standalone script that backs up your Chrome history to a local SQLite database. Archived rows are never removed so your history survives past Chrome's 90-day retention window.

```sh
./archive.chrome.history.sh --dry-run   # preview
./archive.chrome.history.sh
```

## Screenshots

<img src="docs/popup.png" width="391" alt="Popup"><br>

---

<img src="docs/duplicates.png" width="484" alt="Duplicates page"><br>

---

<img src="docs/rules.png" width="570" alt="Rules page">

## Install

### From source

Load the unpacked extension in Google Chrome (requires Developer mode):

```sh
git clone https://github.com/nonpunctual/rotten.git
```

Then `chrome://extensions` → enable Developer mode → Load unpacked → select `extension/`. The manifest's `key` gives it the same extension ID as the signed build: `gkpmaolnlabpdfodjaidehjialicanlh`. After changing the code, reload it from its card on `chrome://extensions`.

### Package

The `.pkg` on the [latest release](https://github.com/nonpunctual/rotten/releases/latest) page is signed and notarized. It installs the signed `.crx`, `updates.xml`, and `rotten-policy.mobileconfig` to **`/Library/Application Support/Rotten`**.

The package only places files. To install the extension, open `rotten-policy.mobileconfig` and approve the profile in System Settings. The profile force-installs Rotten through Chrome policy (`ExtensionInstallForcelist`), so Developer mode isn't needed.

### Build

```sh
./repack.sh <version>
```

`repack.sh` sets the version in `extension/manifest.json`, packs `extension/` into `rotten-<version>.crx` signed with `rotten.pem`, writes `updates.xml` and `rotten-policy.mobileconfig` with the extension ID, and stages all three in `payload/Library/Application Support/Rotten/`. It needs Google Chrome in `/Applications` (or set `CHROME_BIN`).

`rotten.pem` isn't in the repo. Without it, `repack.sh` makes a new key, which means a new extension ID. Remove `key` from `extension/manifest.json` first, or `repack.sh` stops because the two IDs differ.

## Quick Start

Installing Rotten opens the first-run page. Existing history is matched by the built-in rules and your bookmarks. One click of the **Delete** button deletes matches. After install, rules and bookmarks also delete new visits as they occur.

### Rotten popup

Click Rotten's extension icon while on any web page to make a rule for it. Saving the rule deletes the matching history you already have, and matching visits from then on. Before it deletes anything, Rotten shows how much and asks you to confirm.

### Duplicates

Lists the sites you've visited repeatedly, most repeats first. Click a site to see its pages and their visit counts; **Make rule** opens the Rules page with that page filled in. **Delete duplicates** counts every visit to the site, asks you to confirm, and deletes every visit to each page except the oldest. Nothing is deleted automatically.

### Rules

"Built-in" rules are active examples included when Rotten is installed. All rules can be edited or removed. Add your own!

| Rule | Deletes |
| --- | --- |
| Apple sign-in | Every page on `idmsa.apple.com`. |
| Google Apps | Every page on `accounts`, `calendar`, `chat`, `contacts`, `docs`, `drive`, `keep`, `mail`, and `meet.google.com`. |
| Google search | `google.com/search` and `www.google.com/search`. |
| DuckDuckGo | Searches (`duckduckgo.com/?q`) and ad clicks (`duckduckgo.com/y.js`). |
| GitHub | `github.com/search`, `/sessions`, `/settings`, and a repo's edit and compare pages (`github.com/*/*/edit`, `github.com/*/*/compare`). |
| LinkedIn | Every page on `linkedin.com` and its subdomains (`*.linkedin.com`). |
| Authentication strings | Any URL whose host or path contains `login`, `logout`, `oauth`, `oauth2`, `authorize`, `auth`, `signin`, `sign-in`, `sign-on`, or `sso` as a whole word (as `grep -w` defines one: letters, digits, and `_` are word characters).|

# Rotten

<img width="1280" height="640" alt="social-preview" src="https://github.com/user-attachments/assets/245eebec-a406-4a46-bd48-b99b43d9d252" />

## Description

Rotten is a Google Chrome extension that keeps your browsing history from becoming rotten.

- Rotten deletes noisy / duplicate site visits as they're written (auth flows, search results, tracking-param duplicates, Cloudflare interstitials, and more).
- It also learns:
  - Rotten prompts the user with standard Desktop Notifications to allow or deny anything from a site it hasn't seen before.
  - URL scope is editable: a rule can cover the whole domain, or be narrowed to any text matched anywhere in the URL (a path, a query parameter value, and so on).
  - If a domain (or a broader scope on it) already has a deny rule, add an allow rule with a more specific scope (a path, a query parameter, any matched text). 
    - More specific scope wins, regardless of existing rules.
- Allow or deny rules can also be added manually.

Built-in rules:

| Rule | Matches |
| --- | --- |
| Authorization / login keywords | URLs containing exact matches for the words "auth", "idmsa" (Apple), "login", "oauth", "signin", "sign-in", and "sso" are deleted from the browser history. |
| Bookmarked links | Any URL that exactly matches a bookmarked URL is deleted from the browser history. |
| Browser search results | URLs for searches on google.com or duckduckgo.com are deleted from the browser history. |
| Cloudflare redirection | Any page titled exactly "Just a moment..." whose URL also contains `__cf_chl` (Cloudflare's temporary "checking your browser" screen, not the real page underneath it) is deleted from the browser history. |
| GitHub | Search results, login/session pages, settings pages, and (within a repo) the edit, compare, and tree pages are deleted from the browser history. Everything else (bare profile pages, bare repo pages, file views, issues, pull requests, and invitations) is kept. |
| Google Docs & Drive | The first visit to a given Google Doc, Sheet, Slide, or Drive file/folder is kept; any later visits to the same item (even if the URLs have different tracking parameters) are deleted from the browser history. |
| Google service domains | Every URL on "accounts.google.com", "calendar.google.com", "chat.google.com", "mail.google.com", or "meet.google.com" is deleted from the browser history. URLs containing "drive.google.com" are treated differently - only the bare top-level homepage is deleted. Real links on "drive.google.com" are kept. |
| LinkedIn | Profile page visits and post links (including company posts) are kept. All other URLs (feed, search, network browsing, and login pages) are deleted from the browser history. |
| YouTube | The first visit to a given YouTube video is kept. Later visits to the same video (even if the URLs have different tracking parameters) are deleted from the browser history. |

Rotten also includes `archive_chrome_history.sh`: a standalone script that archives the Google Chrome history into a day-partitioned SQLite database separate from the history database in the app which allows your browsing history to survive past Chrome's 90-day retention window.

## Screenshots

<img width="221" height="46" alt="ext" src="https://github.com/user-attachments/assets/e8e7da9f-81a1-477f-a7b0-52fbc0b04b8c" /><br>

<img width="376" height="159" alt="notification" src="https://github.com/user-attachments/assets/b664882b-f653-4d2a-8676-ad099ca498ef" /><br>

<img width="371" height="189" alt="ui" src="https://github.com/user-attachments/assets/ca220fb4-74ba-4a80-afa6-a2129a93d68b" /><br>

<img width="695" height="325" alt="rules" src="https://github.com/user-attachments/assets/818acda3-b2b8-4546-92d1-5f774f683e06" />

## Install

The easiest way to install Rotten is by downloading & double-clicking the `.pkg` from the [latest release](https://github.com/nonpunctual/rotten/releases/latest) page.

The `.pkg` installs the signed `.crx`, `updates.xml`, and `rotten-policy.mobileconfig` to **`/Library/Application Support/Rotten`**. 

### From source

To build your own version, load the unpacked extension in Google Chrome (requires Developer Mode):

```sh
git clone https://github.com/nonpunctual/rotten.git
```

Then `chrome://extensions` → enable Developer Mode → Load unpacked → select `chrome-extension/`.

### Running without Developer Mode, from source

The `rotten-policy.mobileconfig` Configuration Profile force-installs the extension via Chrome enterprise policy so it can run with Developer Mode off. To use, install the profile (System Settings → Profiles) & restart Chrome. After editing the extension, you can repack and bump the version with:

```sh
./repack.sh <version>
```

The `repack.sh` handles extension build automation. It will reuse the `rotten.pem` file for extension signing to keep the id stable. If the key is missing, the script will generate a new `.pem` file.

Notes:

1. To reload the extension to pick up the current code:
- Go to `chrome://extensions`
- Find the unpacked extension
- Click the reload icon (circular arrow) on its card

2. To clear stale/conflicting storage:
- On that same card, click "service worker"
- In that console, type "allow pasting"
- Run: `chrome.storage.local.clear().then(() => console.log("cleared"))`
- Verify it's empty: `chrome.storage.local.get(null, console.log)`
  - result should be `{}`

# Rotten 3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No subagents (the user's choice). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Rotten 3.0, a Chrome extension that removes duplicate History entries (keeping the oldest), deletes noise by rule, and deletes history for bookmarked pages.

**Architecture:** Manifest V3 extension in `extension/`. Pure logic (URL parsing, rule matching, duplicate grouping) lives in ES modules in `extension/lib/`, shared by the service worker, the pages, and the `jsc` tests. Chrome-only glue (history, bookmarks, storage, IndexedDB) stays thin and is checked by hand in Chrome.

**Tech Stack:** Plain JavaScript ES modules; Chrome `history`, `bookmarks`, `storage`, `tabs` APIs; IndexedDB; macOS `jsc` and `sqlite3`; shell scripts.

**Spec:** `/Users/Shared/rotten/DESIGN.md`. Read it first; this plan argues from it.

## How to work this plan

- Five phases, one per session. Each phase ends with the user's review. Commit only after the user approves the phase. Never push, except release-process steps 9 to 11 after the user's go-ahead (Task 17).
- No subagents. A new session reads DESIGN.md, this plan, and `git log`, then continues at the first unchecked step.
- Steps marked **(user)** are done by the user in Chrome. Claude gives the exact clicks and the expected result, then waits.
- `jsc` = `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`. Run all tests from the project root: `$jsc -m tests/run.js`. Exit 0 = all pass; any failure throws (exit 3).
- Lab profile (throwaway): `open -na "Google Chrome" --args --user-data-dir=/private/tmp/rotten-lab-profile`, then load `extension/` unpacked (chrome://extensions, Developer mode, Load unpacked). No deletions are tested in the real profile before Phase 5.
- From Task 7 on, every phase review also runs `tests/history-check.sh` (Task 7) and compares its summary to the previous run.

## Global Constraints

- Plain JavaScript, no build step, no installed tooling. Tests run in `jsc` and `sqlite3`.
- Duplicates: never `history.deleteUrl`, never `history.addUrl`. (The Task 3 lab uses `addUrl` only to create test visits in the throwaway profile.)
- The History database is never written to. Real-history checks run on a copy in `/private/tmp`.
- Apart from Rotten's own pages, only `http` and `https` URLs are touched.
- Personal data (hostnames, history, bookmarks) never goes in the repo. Test fixtures are synthetic.
- New extension ID from a new signing key; `rotten.pem` stays gitignored and the user backs it up.
- Icon `icon128.png`, unchanged.
- Modules in `extension/lib/` that tests import touch no `chrome`, `indexedDB`, or DOM globals at load time.
- Shell scripts follow `~/.claude/rules/shell-scripts.md`. JS uses 4-space indent.
- Code from the 1.x repo only as allowed by `.claude/rules/old-repo.md`.

## Review Focus

1. Odd URLs (ports, IP hosts, uppercase hosts, bad percent-escapes, `chrome://`, `about:blank`): `parseUrl` never throws, unusable input returns `null`, and `null` never matches a rule. (Tasks 2, 4)
2. Default ports: `https://x.com:443/` parses with port `""`, as Chrome's `URL` does. (Tasks 2, 3)
3. Pasted rules with junk (blank lines, `https://` prefixes, trailing `/`, uppercase): cleaned or reported, never saved wrong. (Task 9)
4. A duplicate group whose oldest visit is on a different URL variant from most of its visits: only the single oldest visit in the group survives. (Task 13)
5. Fragment-only and identifying-parameter variants: `page#a` and `page#b` are duplicates; `watch?v=a` and `watch?v=b` are not. (Task 13)

---

## Phase 1: Foundation and lab

### Task 1: Scaffold and test harness

**Files:** Create `extension/manifest.json`, `extension/background.js` (empty), `tests/assert.js`, `tests/run.js`. Move `icon128.png` to `extension/icon128.png`.

**Interfaces:** Produces `eq(actual, expected, name)` and `done()` from `tests/assert.js`. `eq` compares with `JSON.stringify` and prints `ok <name>` or `FAIL <name>` with both values. `done()` prints the totals and throws `Error("<n> failed")` if any failed.

- [x] Step 1: `manifest.json`: `manifest_version` 3, `name` "Rotten", `version` "3.0.0", `permissions` ["history", "bookmarks", "storage"], `background` {"service_worker": "background.js", "type": "module"}, `icons` {"128": "icon128.png"}.
- [x] Step 2: `tests/run.js` imports each test file by name (jsc can't glob), then calls `done()`. Start with one test: `eq(1, 1, "harness")`.
- [x] Step 3: Run `$jsc -m tests/run.js`. Expected `ok harness`, exit 0. Change to `eq(1, 2, ...)`: expected exit 3. Revert.
- [x] Step 4 (user): load `extension/` unpacked in the lab profile. Expected: the card shows no errors (the module service worker loads). Then open chrome://policy in the lab profile (Chrome is enrolled in mandatory cloud management, which applies to every profile): unpacked extensions must be allowed and no other extension force-installed. If not, stop and decide with the user, since lab results would be confounded.

### Task 2: URL parser

**Files:** Create `extension/lib/url.js`, `tests/url.test.js`.

**Interfaces:** Produces `parseUrl(url: string) -> {scheme, host, port, path, params: [name, value][], fragment} | null`, `decodePath(path: string) -> string`, `isWeb(parsed) -> boolean`.

- [x] Step 1: Write the tests:

```js
eq(parseUrl("https://WWW.Example.com:8443/A/b?x=1&y#frag"),
    {scheme: "https", host: "www.example.com", port: "8443", path: "/A/b",
        params: [["x", "1"], ["y", ""]], fragment: "frag"}, "full");
eq(parseUrl("https://example.com").path, "/", "empty path is /");
eq(parseUrl("https://x.com:443/").port, "", "default https port dropped");
eq(parseUrl("http://x.com:80/").port, "", "default http port dropped");
eq(parseUrl("http://127.0.0.1:3000/a").host, "127.0.0.1", "ip host");
eq(parseUrl("chrome://history/").scheme, "chrome", "chrome scheme");
eq(parseUrl("not a url"), null, "garbage");
eq(isWeb(parseUrl("about:blank")), false, "about is not web");
eq(decodePath("/sign%2Din"), "/sign-in", "decode");
eq(decodePath("/bad%E0%A4%A"), "/bad%E0%A4%A", "bad escape kept");
```

- [x] Step 2: Run; expect failures (module missing).
- [x] Step 3: Implement. Scheme and host lowercased; ports 80/443 dropped for http/https; empty http(s) path becomes `/`; params split on `&`, then on the first `=`, values left raw; `decodePath` returns its input unchanged if `decodeURIComponent` throws.
- [x] Step 4: Run; all `ok`.

### Task 3: Lab page (DESIGN Build tasks)

**Files:** Create `extension/lab.html`, `extension/lab.js`, `tests/fixtures/urls.json` (about 50 synthetic tricky URLs: ports, IPs, IDN, encodings, fragments, empty params), `tests/export-urls.sh`. Lab files are deleted in Task 16.

Each lab button prints JSON results on the page. The user pastes them back, and Claude records them under **Lab results** at the end of this plan.

- [x] Step 1: `tests/export-urls.sh` copies `~/Library/Application Support/Google/Chrome/Default/History` into a `mktemp -d` directory under `/private/tmp`, writes `urls.json` (every `urls.url`) there with `sqlite3 -json`, and prints the path. The original is only read.
- [x] Step 2: **Parser check**: the user picks a `urls.json` (fixture or export). For each URL, compare `parseUrl` with Chrome's `new URL()` on scheme, host, port, path, params, and fragment. Print the mismatch count and the first 20. Pass = 0. Otherwise fix `parseUrl`, add a Task 2 test per mismatch, and repeat.
- [x] Step 3: **deleteRange single visit**: `addUrl` URL A three times, with URL B once between them, 50 ms apart; `getVisits(A)`. For the middle visit at time `t`, try the windows `[t, t]`, `[floor(t), ceil(t)]`, and `[t - 1, t + 1]`, each on fresh visits. Report the visits left for A and B, and what `history.search({text: "", startTime: t - 1, endTime: t + 1})` returns. Pass = A loses exactly 1, B loses 0, URL A remains.
- [x] Step 4: **Search cap**: `addUrl` 5,000 distinct URLs; `search({text: "", startTime: 0, maxResults: 1000000})`; report the count. Pass = all 5,000 returned.
- [x] Step 5: **Bulk timing**: `addUrl` one URL 3,000 times; time `getVisits` plus 2,999 `deleteRange` calls with the Step 3 window. Report the seconds.
- [x] Step 6: **Log capacity**: write 200,000 entries to an IndexedDB database `rotten-lab`; report `navigator.storage.estimate()` before and after, and any error.
- [x] Step 7 (user): run every button in the lab profile and paste the results. Apply DESIGN's fallbacks: Step 3 fails → STOP and decide with the user before building duplicate removal; Step 4 caps → page by date in `searchAll`; Step 5 over 30 s → batches with a progress bar in Task 14; Step 6 errors → add the `unlimitedStorage` permission.

**Phase 1 review (user), then commit.**

## Phase 2: Background behaviors

### Task 4: Rules and matching

**Files:** Create `extension/lib/rules.js`, `extension/lib/builtins.js`, `tests/rules.test.js`.

**Interfaces:**
- Consumes `parseUrl`, `decodePath`, `isWeb`.
- Produces: a rule is `{id, builtIn, host, path}` (pattern) or `{id, builtIn, words}` (auth words). `parseRule(line) -> {host, path} | null`; `formatRule({host, path}) -> string`; `matchRule(rule, parsed) -> boolean` (both kinds; `false` for `null`); `firstMatch(rules, parsed) -> rule | null`; `matchingItems(rules, items: {url}[]) -> items`; `BUILT_IN_RULES: string[]`; `AUTH_WORDS: string[]`; `defaultRules() -> rule[]` (ids `builtin:<text>` and `builtin:auth`).
- `BUILT_IN_RULES`, copied from DESIGN: `idmsa.apple.com`, `accounts.google.com`, `calendar.google.com`, `chat.google.com`, `docs.google.com`, `drive.google.com`, `mail.google.com`, `meet.google.com`, `contacts.google.com`, `keep.google.com`, `www.google.com/search`, `google.com/search`, `duckduckgo.com/?q`, `duckduckgo.com/y.js`, `github.com/search`, `github.com/sessions`, `github.com/settings`, `github.com/*/*/edit`, `github.com/*/*/compare`, `*.linkedin.com`.
- `AUTH_WORDS`: `login`, `logout`, `oauth`, `oauth2`, `authorize`, `auth`, `signin`, `sign-in`, `sign-on`, `sso`.

- [x] Step 1: Write the tests:

```js
const r = (t) => ({id: t, builtIn: false, ...parseRule(t)});
const p = parseUrl;
eq(matchRule(r("github.com/search"), p("https://github.com/search?q=x")), true, "segment prefix");
eq(matchRule(r("github.com/search"), p("https://github.com/searchx")), false, "whole segment");
eq(matchRule(r("github.com/*/*/edit"), p("https://github.com/o/r/edit/main/a")), true, "star");
eq(matchRule(r("github.com/*/*/edit"), p("https://github.com/o/r/blob/x")), false, "star miss");
eq(matchRule(r("drive.google.com/"), p("https://drive.google.com/")), true, "homepage");
eq(matchRule(r("drive.google.com/"), p("https://drive.google.com/file/d/1")), false, "homepage only");
eq(matchRule(r("duckduckgo.com/?q"), p("https://duckduckgo.com/?q=a")), true, "param");
eq(matchRule(r("duckduckgo.com/?q"), p("https://duckduckgo.com/")), false, "param missing");
eq(matchRule(r("*.linkedin.com"), p("https://linkedin.com/feed")), true, "wildcard bare");
eq(matchRule(r("*.linkedin.com"), p("https://www.linkedin.com/in/x")), true, "wildcard sub");
eq(matchRule(r("*.linkedin.com"), p("https://notlinkedin.com/")), false, "wildcard boundary");
eq(matchRule(r("x.com/Login"), p("https://X.com/LOGIN/a")), true, "case-insensitive");
eq(matchRule(r("x.com/sign-in"), p("https://x.com/sign%2Din")), true, "decoded path");
eq(matchRule(r("localhost"), p("http://localhost:3000/a")), true, "port ignored");
eq(matchRule(r("x.com"), null), false, "null never matches");
const auth = defaultRules().find((x) => x.words);
eq(matchRule(auth, p("https://sso.example.com/")), true, "auth host");
eq(matchRule(auth, p("https://x.com/oauth2/authorize")), true, "auth path");
eq(matchRule(auth, p("https://x.com/logout")), true, "logout");
eq(matchRule(auth, p("https://x.com/authentication")), false, "whole word only");
eq(matchRule(auth, p("https://x.com/?next=login")), false, "query ignored");
eq(parseRule("https://GitHub.com/search/"), {host: "github.com", path: "/search"}, "clean");
eq(parseRule("example.com/"), {host: "example.com", path: "/"}, "homepage kept");
eq(parseRule("   "), null, "blank");
eq(parseRule("not a host!"), null, "invalid");
eq(formatRule(parseRule("duckduckgo.com/?q")), "duckduckgo.com/?q", "round trip");
eq(defaultRules().length, BUILT_IN_RULES.length + 1, "built-ins plus auth");
```

- [x] Step 2: Run; expect failures.
- [x] Step 3: Implement per DESIGN's Rules section. Auth words match as whole words, as `grep -w` defines them (letters of any script, digits, and `_` are word characters; anything else is a boundary), in the host or the decoded path, case-insensitive. Changed 2026-11-24 from "boundary = not `[a-z0-9]`" by the user's decision: `sso` was matching Okta's `macos_platform_sso` admin pages.
- [x] Step 4: Run; all `ok`.

### Task 5: Log and settings storage

**Files:** Create `extension/lib/log.js`, `extension/lib/store.js`, `tests/log.test.js`.

**Interfaces:**
- `logEntry(url, reason, time) -> {url, reason, time}`; `reason` is `"duplicate"`, `"rule"`, or `"bookmark"`, anything else throws.
- `appendLog(entries) -> Promise`, `readLog(limit, beforeId = null) -> Promise<{id, url, reason, time}[]>` (newest first; pages by the log key, since bulk deletes log many entries in one ms), `exportLog() -> Promise<string>` (JSON Lines, oldest first). IndexedDB database `rotten`, version 1, store `log` (auto-increment key), index `time`.
- `store.js`: `getRules()`, `saveRules(rules)`, `getFirstRunDone()`, `setFirstRunDone()` on `chrome.storage.local` keys `rules` and `firstRunDone`.

- [x] Step 1: Tests: `eq(logEntry("https://a.com/", "rule", 5), {url: "https://a.com/", reason: "rule", time: 5}, "entry")`; a `"nope"` reason throws.
- [x] Step 2: Run; expect failures. Step 3: implement. Step 4: run; all `ok`.

### Task 6: History glue

**Files:** Create `extension/lib/history.js`. Chrome-only; no `jsc` tests. Checked in Tasks 8 and 14.

**Interfaces:** `searchAll() -> Promise<HistoryItem[]>` (one call or paged by date, per Lab results); `deleteUrls(urls: string[], reason) -> Promise<number>` (`deleteUrl` each, then one `appendLog`); `deleteVisits(visits: {url, visitTime}[], reason, onProgress?) -> Promise<{deleted, skipped}>` (`deleteRange` with the Lab results window; skips a visit when another URL has a visit in that window, if the lab showed that's detectable; batches per Lab results; logs only what it deleted); `bookmarkedUrls() -> Promise<Set<string>>` (flattens `bookmarks.getTree`).

- [x] Step 1: Implement. Step 2: Claude reviews it against the Lab results and DESIGN.

### Task 7: Real-history check script

**Files:** Create `tests/history-check.sh`, `tests/history-check.js`.

- [x] Step 1: The script copies History and Bookmarks into a `mktemp -d` directory under `/private/tmp`, exports `{url, title, visits}` with `sqlite3 -json` and the bookmark URLs with `jq`, then runs `$jsc -m tests/history-check.js -- <urls.json> <bookmarks.txt> [personal-rules.txt]`. The optional personal-rules file (one rule per line, pasted-list format) lives outside the repo.
- [x] Step 2: `history-check.js` uses the real `lib/` modules and prints: total visits; visits deleted per rule; visits deleted as bookmarks; visits left; the top 25 hosts left; the top 10 pages deleted per rule. Duplicates are added in Task 13.
- [x] Step 3: Run it. Expected: no errors; per-rule counts that match what each rule targets. No numeric target.

### Task 8: Service worker and first run

**Files:** Modify `extension/background.js`. Create `extension/firstrun.html`, `extension/firstrun.js`.

- [x] Step 1: `background.js`:
  - `runtime.onInstalled` with reason `install`: `saveRules(defaultRules())`, then open `firstrun.html`.
  - `history.onVisited(item)`: Rotten's own page (`item.url` starts with `chrome.runtime.getURL("")`) → `chrome.history.deleteUrl`, not logged. Not `isWeb` → ignore. `firstMatch(rules, parsed)` → `deleteUrls([url], "rule")`. Else, an exact bookmark (`bookmarks.search({url})`, keeping results whose `url` is identical) → `deleteUrls([url], "bookmark")`.
  - `bookmarks.onCreated`, and `bookmarks.onChanged` when the URL changed, with a web URL → `deleteUrls([url], "bookmark")`.
  - Rules act on new visits from install on, before first run is confirmed (Claude's call).
- [x] Step 2: `firstrun.js`: `searchAll()`; count `matchingItems(rules, items)` and the items whose URL is in `bookmarkedUrls()`; show both counts and one **Delete** button. On click, delete them (reasons `rule` and `bookmark`), then `setFirstRunDone()`.
- [x] Step 3 (user, lab profile), expected results:
  1. Remove and re-add the extension: the first-run page shows counts; Delete removes those entries from chrome://history.
  2. Visit `https://mail.google.com/`: its entry is gone from chrome://history within seconds.
  3. Visit `https://example.com/`, then bookmark it: its entries are gone.
  4. After opening an extension page: no `chrome-extension://` entries in history.
  5. Visit `https://example.org/` (no rule): the entry stays.

**Phase 2 review (user) with `tests/history-check.sh`, then commit.**

## Phase 3: Popup, Rules page, Deleted page

### Task 9: Rule text helpers

**Files:** Modify `extension/lib/rules.js`, `tests/rules.test.js`.

**Interfaces:** `ruleFromUrl(url) -> string` (`""` for non-web; a bare `/` path becomes the whole host, Claude's call); `parseRuleList(text) -> {rules: {host, path}[], invalid: string[]}`.

- [x] Step 1: Tests:

```js
eq(ruleFromUrl("https://www.linkedin.com/feed/"), "www.linkedin.com/feed", "toolbar prefill");
eq(ruleFromUrl("https://example.com/"), "example.com", "root page means whole host");
eq(ruleFromUrl("chrome://history/"), "", "non-web");
eq(parseRuleList("github.com/search\n\n https://X.com/a/ \nbad host!"),
    {rules: [{host: "github.com", path: "/search"}, {host: "x.com", path: "/a"}],
        invalid: ["bad host!"]}, "paste");
```

- [x] Step 2: Run; expect failures. Step 3: implement. Step 4: run; all `ok`.

### Task 10: Saving rules, and the popup

**Files:** Create `extension/lib/save-rule.js`, `tests/save-rule.test.js`, `extension/popup.html`, `extension/popup.js`. Modify `manifest.json`: add `action` {"default_popup": "popup.html", "default_icon": "icon128.png"} and the `activeTab` permission. Modify `background.js`: a `runtime.onMessage` handler for `commitRules`.

**Interfaces** (changed 2026-11-24 from single-rule `previewRule`/`commitRule`: paste needs one preview for many rules, and the popup closes on any outside click, so deletes run in `background.js`). A rule is `{host, path}` or `{words}`.
- `previewRules(rules) -> Promise<{rules, items}>` (items = existing history the rules would delete).
- `commitRules(preview, replaceId = null) -> Promise<number>` (page side: `runtime.sendMessage({type: "commitRules", rules, urls, replaceId})`; resolves to pages deleted).
- `applyRules({rules, urls, replaceId}) -> Promise<number>` (background side: `saveRules(mergeRules(await getRules(), ...))`, then `deleteUrls(urls, "rule")`).
- `mergeRules(saved, rules, replaceId, newId) -> rule[]` (replace keeps id, `builtIn`, and place; append gets `newId()` and `builtIn: false`; a rule already saved is skipped; only rule content is kept).
- `hasRule(saved, rule) -> boolean`; `describeItems(items) -> "N pages, about M entries"`; `removeRule(id)` (page side).
- Every page shows "Deletes N pages, about M entries" with Save and Cancel before `commitRules`.

- [x] Step 1: Implement `save-rule.js`.
- [x] Step 2: Popup: a field prefilled with `ruleFromUrl` of the active tab (`tabs.query({active: true, currentWindow: true})`); Save → preview → confirm → commit; links that open `duplicates.html`, `rules.html`, and `deleted.html` in tabs.
- [x] Step 3 (user, lab profile): on `https://www.iana.org/help/example-domains` the field shows `www.iana.org/help/example-domains` (signed out, `www.linkedin.com/feed/` redirects to sign-in); on chrome://extensions it's empty. If the field is empty on web pages too, Claude switches `activeTab` to `tabs`. Also: a popup save closed before it reports still deletes and logs everything (5,000 lab URLs).

### Task 11: Rules page

**Files:** Create `extension/rules.html`, `extension/rules.js`. Modify `extension/lib/rules.js` (`parseWords(text) -> string[]`: lowercased, repeats dropped) and `extension/lib/save-rule.js` (`hasRule`, `removeRule`).

- [x] Step 1: List every rule from `getRules()`, built-ins labeled. Each row: editable text, Save, Remove. The auth row shows its words, space-separated and editable. An add field, and a paste box (`parseRuleList`; invalid lines are shown and not saved; valid ones get one preview and one confirm). `rules.html?add=<text>` prefills the add field. Editing a rule previews and confirms like a new rule.
- [x] Step 2 (user, lab profile): remove a built-in and reload: it stays removed. Paste 3 lines with 1 bad: the bad line is listed. Visit `https://www.reddit.com/signup` (shows in chrome://history), add `signup` to the auth words: the preview counts it and it's deleted; visit it again: deleted.

### Task 12: Deleted page

**Files:** Create `extension/deleted.html`, `extension/deleted.js`.

- [x] Step 1: Newest first, 500 per page with an "Older" button (`readLog(500, beforeId)`, `beforeId` = the last entry's `id`); columns: time, reason, URL. **Export** downloads `rotten-deleted.jsonl` (blob URL, `<a download>`).
- [x] Step 2 (user): the deletions from Tasks 8 and 11 appear with the right reasons; the export opens as JSON Lines.

**Phase 3 review (user) with `tests/history-check.sh`, then commit.**

## Phase 4: Duplicates

### Task 13: Duplicate grouping

**Files:** Create `extension/lib/duplicates.js`, `tests/duplicates.test.js`.

**Interfaces:** `ID_PARAMS = {"youtube.com/watch": "v", "news.ycombinator.com/item": "id"}` (keys use the host without a leading `www.`); `baseUrl(parsed) -> string`; `groupDuplicates(items: {url, visitCount}[]) -> Map<base, {host, urls: string[], visits: number}>` (web URLs only); `hostSummary(groups) -> {host, duplicates}[]` (duplicates = sum of `visits - 1` over groups with more than 1 visit; sorted by duplicates, then host); `planDeletes(visitsByUrl: Map<url, {visitTime}[]>) -> {deletes, skipped}`, each `{url, visitTime}[]` (every visit except the single oldest in the group, oldest first; a visit is skipped when the oldest is at or after `floor(visitTime) - 1`, since its delete window would also delete the oldest. Changed 2026-11-24 in Task 14 from a single list).

- [x] Step 1: Tests:

```js
const b = (u) => baseUrl(parseUrl(u));
eq(b("https://x.com/a?sort=1#top"), "https://x.com/a", "query and fragment dropped");
eq(b("https://x.com/a#a") === b("https://x.com/a#b"), true, "fragment variants are duplicates");
eq(b("https://www.youtube.com/watch?v=abc&t=42s"), "https://www.youtube.com/watch?v=abc", "keep v");
eq(b("https://www.youtube.com/watch?v=a") === b("https://www.youtube.com/watch?v=b"), false, "videos differ");
eq(b("https://news.ycombinator.com/item?id=1&p=2"), "https://news.ycombinator.com/item?id=1", "keep id");
eq(b("http://localhost:3000/a"), "http://localhost:3000/a", "port kept");
const plan = planDeletes(new Map([
    ["https://x.com/a?v=2", [{visitTime: 5}, {visitTime: 9}]],
    ["https://x.com/a", [{visitTime: 7}, {visitTime: 1}]],
]));
eq(plan.map((v) => v.visitTime), [5, 7, 9], "oldest kept even on another variant");
eq(hostSummary(groupDuplicates([
    {url: "https://x.com/a", visitCount: 3},
    {url: "https://x.com/a?s=1", visitCount: 2},
    {url: "https://y.com/", visitCount: 1},
])), [{host: "x.com", duplicates: 4}], "summary");
```

- [x] Step 2: Run; expect failures. Step 3: implement. Step 4: run; all `ok`.
- [x] Step 5: Add duplicates to `tests/history-check.js`: duplicates removed and entries left, using `groupDuplicates` on what the rules and bookmarks leave (visit counts per URL from the export).

### Task 14: Duplicates page

**Files:** Create `extension/duplicates.html`, `extension/duplicates.js`.

- [x] Step 1: On load, `searchAll()`, then `groupDuplicates`, then `hostSummary`. The list counts come from `visitCount`, labeled approximate (Claude's call).
- [x] Step 2: Clicking a host shows its pages (base URLs) with visit counts, most first. Each page has **Make rule**, which opens `rules.html?add=<ruleFromUrl(page)>`.
- [x] Step 3: **Delete duplicates** for the host: `getVisits` for each URL in the host's groups, then `planDeletes` per group; confirm "Delete N entries?" with the exact N; `deleteVisits(plan, "duplicate", progress)`; show deleted and skipped counts; refresh.
- [x] Step 4 (user, lab profile): visit `https://example.org/`, `https://example.org/?a=1`, and `https://example.org/?a=2` several times each (not `example.com`, which Task 8 bookmarked). The Duplicates page lists `example.org`; Delete leaves exactly one example.org entry in chrome://history, the oldest; the Deleted page shows `duplicate` entries; skipped is 0.

**Phase 4 review (user) with `tests/history-check.sh`, then commit.**

## Phase 5: Real history, packaging, install

### Task 15: Rules check against real history

- [x] Step 1: Claude drafts the user's personal rules (for example the Fleet instances) as a plain-text file outside the repo, for pasting. They are never written into the repo.
- [x] Step 2: Run `tests/history-check.sh` with that file. Bring the findings to the user before changing any rule (DESIGN Build tasks). Known: GitHub repo settings (`/<owner>/<repo>/settings`) aren't matched.

### Task 16: Packaging and extension ID

**Files:** Modify `repack.sh`. Create `updates.xml`, `rotten-policy.mobileconfig`, `distribution.xml`, `scripts/postinstall`. Delete `extension/lab.html`, `extension/lab.js`. Release steps live in `.claude/skills/release-process/SKILL.md`; packaging, signing, and notarization use `/Users/Shared/scripty-legacy/build.pkg.sh` (release-process step 4).

- [x] Step 1: `repack.sh`: `chrome-extension/` becomes `extension/`; rewrite to the shell rules; makes a new `rotten.pem` once (the user backs it up). It writes `rotten-policy.mobileconfig` from a heredoc, like `updates.xml`, never with `PlistBuddy -c Set` (tested: it re-sorts every key alphabetically).
- [x] Step 2: `repack.sh` also stages `payload/Library/Application Support/Rotten/` (`.crx`, `updates.xml`, `rotten-policy.mobileconfig` with `file:///Library/Application%20Support/Rotten/` paths). `scripts/postinstall` prints how to install the profile. Confirm `build.pkg.sh`'s argument order against its header before the first run.
- [x] Step 3: `distribution.xml` modeled on aeropuerto's (`pkg-ref id` `com.nonpunctual.rotten`). `updates.xml` and `rotten-policy.mobileconfig` start as templates (new `PayloadUUID`s, identifiers `com.nonpunctual.rotten`, key order per `~/.claude/rules/mobileconfig.md`); `repack.sh` fills in the extension ID derived from the key.
- [x] Step 4: ID check (DESIGN Build tasks): load `extension/` unpacked and compare its ID with the one from the key. If they differ, add the public key to the manifest as `key`.
- [x] Step 5: Run release-process steps 1 to 6 for `3.0.0`. Expected: `Rotten-3.0.0.pkg` passes all three checks in step 5 (signed, stapled, Gatekeeper accepted).

### Task 17: Install in the real profile (user)

- [ ] Step 1: Run `archive.chrome.history.sh` first; first run deletes history.
- [ ] Step 2: Remove 1.x, and its configuration profile if installed.
- [ ] Step 3: Install 3.0 unpacked from `extension/` (Developer mode), per DESIGN Release. The first-run counts should be close to Task 15's built-in rule and bookmark counts; confirm.
- [ ] Step 4: Paste the personal rules from Task 15 on the Rules page.
- [ ] Step 5: Use the Duplicates page once; check the Deleted page.
- [ ] Step 6: Release: release-process steps 7 to 11 for `3.0.0`, after the user's go-ahead. Before step 9, the one-time force push over the 1.x history on GitHub, as its own step with the user's explicit go-ahead.

**Phase 5 review (user), then commit.**

## Lab results

(Filled in during Task 3.)

**Step 2, parser check (2026-11-23): pass.**
- Fixtures (`tests/fixtures/urls.json`): 66 URLs, 0 mismatches. 5 non-canonical inputs, all intended (no path, uppercase, default ports, leading-zero port).
- Real history export: 3,907 URLs, 0 mismatches, 0 non-canonical (every stored URL equals Chrome's `new URL().href`).
- Params: the lab split Chrome's `search` with the same rule as `parseUrl`, so a match confirms where the query starts and ends, not the split rule itself (empty pieces skipped, first `=`).

**Step 3, deleteRange single visit (2026-11-23): pass.** `visitTime` values are fractional ms.
- `[t, t]`: deleted nothing.
- `[floor(t), ceil(t)]` (1 ms): A lost only the middle visit, B kept, URL A remains. Narrowest passing window.
- `[t - 1, t + 1]`: same result, pass.
- Extra trial, B visited 0.2 ms after A's middle visit, window `[t - 1, t + 1]`: B's only visit was deleted too, so URL B was removed. Other URLs' visits inside the window go too.
- `search({text: "", startTime, endTime})` lists every URL with any visit in the window (A listed although its last visit was 51 ms later; B 51 ms away not listed). A nearby visit of another URL is detectable before deleting.
- Lab window changed to `[floor(t), floor(t) + 1]`: identical for fractional `t`; `ceil` would collapse to `[t, t]` for a whole-ms `t` (whole-ms case untested).
- Rerun with the changed window: same results in every trial.

**Step 4, search cap (2026-11-23): pass.** `search({text: "", startTime: 0, maxResults: 1000000})` returned all 5,000 lab URLs (8,375 total) in 0.7 s. No cap seen; `searchAll` is one call.

**Step 5, bulk timing (2026-11-23): 22.7 s, under 30 s; no batches needed.** Window `[floor(t), floor(t) + 1]`. `getVisits` plus 3,000 `deleteRange` calls (about 7.6 ms each). 3,001 visits found (1 left from an earlier finished run in the same page, inferred), all distinct times, minimum gap 3.1 ms; 1 visit left, the oldest.

**Step 6, log capacity (2026-11-23): pass.** 200,000 entries written, 200,000 counted, no error, 11.4 s. Usage 0 → 19.9 MB; quota about 10 GB. No `unlimitedStorage` needed.

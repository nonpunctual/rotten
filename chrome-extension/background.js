// Hard rules that are always applied, never asked about.
const CLOUDFLARE_TITLE = "Just a moment...";

// Exact-token match (word boundaries), not a loose substring - so
// "authentication"/"authuser" don't trigger on "auth", but a real /login,
// /auth/, ?oauth=, /oauth2/, /authorize, /signin, /sign-in, /sign-on, or
// /sso path or param does. oauth2? and authorize are separate alternatives
// (not folded into auth/oauth) because a bare \b won't fire when auth/oauth
// is glued to a trailing digit or suffix, e.g. "oauth2" or "authorize".
// authorize has an extra (?!\.\w) guard - without it, "authorize" bounded by
// word boundaries also matches inside a hostname like authorize.net (the
// payment gateway), which is not an auth flow; real path/query hits like
// /authorize?... or /authorize/ or a trailing /authorize are unaffected
// since they're never followed by ".<letters>".
const AUTH_KEYWORD_RE = /\b(login|oauth2?|authorize(?!\.\w)|auth|signin|sign-in|sign-on|sso)\b/i;

// Whole hosts that are always an auth flow, every path, even when the URL
// itself doesn't hit AUTH_KEYWORD_RE - e.g. Apple ID's "IDMSWebAuth" has
// "auth" glued onto "Web", so \bauth\b never fires on it.
const AUTH_DOMAIN_HOSTS = ["idmsa.apple.com"];

// Whole domain is noise, every path - no exceptions.
const WHOLE_DOMAIN_NOISE_HOSTS = [
  "accounts.google.com",
  "calendar.google.com",
  "chat.google.com",
  "mail.google.com",
  "meet.google.com",
];

// Only the bare homepage is noise; anything with a path is left alone
// (still subject to the other hard rules and to learned per-domain rules).
const BARE_HOMEPAGE_ONLY_HOSTS = ["drive.google.com"];

// GitHub path-category rules. Delete: search results, login/sessions,
// settings/*, edit-mode, branch compare, directory browsing (tree). Keep:
// file views (blob), issues/pull, bare org/user profile pages, bare repo
// pages, invitations (default keep, bookmark rule handles it if bookmarked).
const GITHUB_DELETE_TOP = ["search", "login", "sessions", "settings"];
const GITHUB_DELETE_CATEGORY = ["edit", "compare", "tree"];

const LINKEDIN_HOSTS = ["www.linkedin.com", "linkedin.com"];
const YOUTUBE_HOSTS = ["www.youtube.com", "youtube.com"];

function isCloudflareInterstitial(item) {
  return item.title === CLOUDFLARE_TITLE && item.url.includes("__cf_chl");
}

// This extension's own pages (popup, View Rules) should never show up in
// browsing history at all - not even long enough to ask about them.
function isOwnExtensionUrl(url) {
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

function isAuthKeywordUrl(host, url) {
  return AUTH_DOMAIN_HOSTS.includes(host) || AUTH_KEYWORD_RE.test(decodeLoose(url));
}

// Search-result pages only, not the bare homepage - so duckduckgo.com/ or
// google.com/ themselves are unaffected, only the results of a query.
function isSearchResultUrl(url) {
  return url.includes("duckduckgo.com/?q=") || url.includes("google.com/search?q=");
}

function isWholeDomainNoise(host) {
  return WHOLE_DOMAIN_NOISE_HOSTS.includes(host);
}

function isBareHomepageNoise(host, pathname) {
  return BARE_HOMEPAGE_ONLY_HOSTS.includes(host) && (pathname === "" || pathname === "/");
}

function isGithubNoise(host, pathname) {
  if (host !== "github.com") return false;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return false; // bare homepage - not covered, leave alone
  if (GITHUB_DELETE_TOP.includes(parts[0])) return true;
  if (parts.length <= 2) return false; // bare profile or bare repo - kept by default
  return GITHUB_DELETE_CATEGORY.includes(parts[2]);
}

// LinkedIn allowlist: keep profile pages (anyone's, including your own -
// add a learned deny rule scoped to your own /in/<slug> path if you want
// that excluded) and individual posts/company posts-listings; delete
// everything else on the domain (feed, search, network browsing, the
// OAuth/2FA chain, saved posts).
function isLinkedInNoise(host, pathname) {
  if (!LINKEDIN_HOSTS.includes(host)) return false;
  const isContact = pathname.startsWith("/in/");
  const isPost =
    pathname.startsWith("/feed/update/urn:li:activity:") ||
    (pathname.includes("/company/") && pathname.includes("/posts"));
  return !(isContact || isPost);
}

// Every rule below means "delete it, never ask". They're checked in order,
// stopping at the first match; all of them - like the bookmark check in
// onVisited - are cheap and synchronous, so they run before the async
// bookmarks.search call and skip that I/O for most noisy visits.
const HARD_DELETE_RULES = [
  { name: "Cloudflare interstitial", test: ({ item }) => isCloudflareInterstitial(item) },
  { name: "Auth/login keyword", test: ({ host, url }) => isAuthKeywordUrl(host, url) },
  { name: "Search results", test: ({ url }) => isSearchResultUrl(url) },
  { name: "Google service domain", test: ({ host }) => isWholeDomainNoise(host) },
  { name: "Drive bare homepage", test: ({ host, pathname }) => isBareHomepageNoise(host, pathname) },
  { name: "GitHub noise page", test: ({ host, pathname }) => isGithubNoise(host, pathname) },
  { name: "LinkedIn noise page", test: ({ host, pathname }) => isLinkedInNoise(host, pathname) },
];

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    return null;
  }
}

// One level of percent-decoding so a scope like "id.atlassian.com" can match
// inside an encoded query param (e.g. redirectTo=https%3A%2F%2Fid.atlassian.com%2F...)
// without the caller having to know the URL was ever encoded. Falls back to
// the raw string on malformed escapes instead of throwing.
function decodeLoose(url) {
  try {
    return decodeURIComponent(url);
  } catch (e) {
    return url;
  }
}

async function isBookmarked(url) {
  try {
    const results = await chrome.bookmarks.search({ url });
    return results.some((b) => b.url === url);
  } catch (e) {
    return false;
  }
}

// YouTube/Google Docs/Google Drive duplicate merging. Each tracking/session-
// param variant (list=, index=, sttick=, slide=, pli=, ...) is its own
// distinct URL, so this doesn't need to scan existing history like the
// generic repeat-visit trim would - it just remembers the first video/doc/
// file/folder id it sees (the keeper) and deletes any later variant of the
// same id as it comes in. First-seen-wins, no retroactive lookback, same as
// everything else here.

function extractYouTubeVideoId(parsed) {
  if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null;
  if (parsed.pathname !== "/watch") return null;
  return parsed.searchParams.get("v");
}

function extractGoogleDocId(parsed) {
  if (parsed.hostname !== "docs.google.com") return null;
  const m = parsed.pathname.match(/^\/(presentation|document|spreadsheets)\/d\/([^/]+)\//);
  return m ? m[2] : null;
}

// Covers the same drive.google.com that isBareHomepageNoise also matches -
// that rule only ever fires on the bare root (no id to extract), so the two
// don't overlap: a file/folder URL always has an id and lands here instead.
function extractGoogleDriveId(parsed) {
  if (parsed.hostname !== "drive.google.com") return null;
  let m = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
  if (m) return m[1];
  m = parsed.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([^/]+)/);
  if (m) return m[1];
  if (parsed.pathname === "/open") return parsed.searchParams.get("id");
  return null;
}

// One bucket per id namespace, checked in order - a URL can only ever match
// one of them, since each extractor is gated on its own hostname.
// "label" is the human wording used in the log reason for a duplicate.
const CANONICAL_BUCKETS = [
  { name: "youtube", label: "YouTube video", extractId: extractYouTubeVideoId },
  { name: "googleDocs", label: "Google Doc/Sheet/Slide", extractId: extractGoogleDocId },
  { name: "googleDrive", label: "Google Drive file/folder", extractId: extractGoogleDriveId },
];

// Serializes every storage read-modify-write section below - rules/pending
// mutations and the notification-id map alike - so overlapping onVisited
// invocations, notification events, and messages from the popup can't
// interleave their get/set calls and silently drop each other's writes.
let storageQueue = Promise.resolve();
function withStorageLock(fn) {
  const run = storageQueue.then(fn, fn);
  storageQueue = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function readStore(key, fallback) {
  const stored = await chrome.storage.local.get({ [key]: fallback });
  return stored[key];
}

async function writeStore(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function getCanonicalStore() {
  const canonical = await readStore("canonical", {});
  // Backfill buckets missing from a store written before they existed -
  // chrome.storage.local.get()'s default only applies when the whole
  // "canonical" key is absent, not per missing sub-key.
  for (const { name } of CANONICAL_BUCKETS) {
    canonical[name] = canonical[name] || {};
  }
  return canonical;
}

async function setCanonicalStore(canonical) {
  await writeStore("canonical", canonical);
}

async function getRules() {
  return readStore("rules", []);
}

async function setRules(rules) {
  await writeStore("rules", rules);
}

async function getPending() {
  return readStore("pending", []);
}

async function setPending(pending) {
  await writeStore("pending", pending);
}

// Maps a live notification id -> the host it's asking about. Read/written
// by the button-click, close, and click (View Rules) notification handlers
// below, always inside withStorageLock.
async function getNotificationMap() {
  return readStore("notificationMap", {});
}

async function setNotificationMap(map) {
  await writeStore("notificationMap", map);
}

// Transport buffer for the options page's on-disk log file: background.js
// can't write to the filesystem itself (service workers have no File System
// Access), so every deletion is queued here and options.js drains it into
// the file whenever that page is open. Capped so an unbounded queue can't
// build up if the log file page is never opened.
const LOG_QUEUE_CAP = 2000;

async function getLogQueue() {
  return readStore("logQueue", []);
}

async function setLogQueue(queue) {
  await writeStore("logQueue", queue);
}

// Every history deletion goes through one of these two, so a deletion can
// never be made without also recording why it happened.
//
// "Raw" - assumes the caller already holds the storage lock, same
// convention as resolveHostRaw etc. above.
async function deleteAndLogRaw(url, title, reason) {
  chrome.history.deleteUrl({ url });
  const queue = await getLogQueue();
  queue.push({ url, title: title || "", reason, deletedAt: Date.now() });
  if (queue.length > LOG_QUEUE_CAP) {
    queue.splice(0, queue.length - LOG_QUEUE_CAP);
  }
  await setLogQueue(queue);
}

async function deleteAndLog(url, title, reason) {
  return withStorageLock(() => deleteAndLogRaw(url, title, reason));
}

// Returns true if this visit was a duplicate and got deleted; false if it's
// the first-seen instance for its canonical id (kept) or doesn't match any
// of the bucket id patterns at all.
async function handleCanonicalDuplicate(url, title, parsed) {
  for (const { name, label, extractId } of CANONICAL_BUCKETS) {
    const id = extractId(parsed);
    if (!id) continue;

    const canonical = await getCanonicalStore();
    const bucket = canonical[name];
    if (bucket[id]) {
      await deleteAndLogRaw(url, title, `Duplicate visit (already seen this ${label})`);
      return true;
    }
    bucket[id] = url;
    await setCanonicalStore(canonical);
    return false;
  }
  return false;
}

// Scope matches anywhere in the decoded full URL (path, query string, all of
// it) - not just as a path prefix - so a rule can target something buried in
// a query param (e.g. a redirectTo=... value) as well as a plain path.
// Most-specific (longest scope) match wins; a host-only rule (scope null) is
// the fallback.
function matchRule(rules, host, decodedUrl) {
  let best = null;
  for (const r of rules) {
    if (r.host !== host) continue;
    if (r.scope) {
      if (decodedUrl.includes(r.scope)) {
        if (!best || !best.scope || best.scope.length < r.scope.length) {
          best = r;
        }
      }
    } else if (!best) {
      best = r;
    }
  }
  return best;
}

// Two rules are the same rule when every stored field matches - the rules
// list has no ids, and a bare index would go stale the moment a
// notification button or the popup writes the list between render and click.
function isSameRule(a, b) {
  return (
    a.host === b.host &&
    a.scope === b.scope &&
    a.action === b.action &&
    a.createdAt === b.createdAt
  );
}

async function updateBadge() {
  const pending = await getPending();
  const count = pending.length;
  chrome.action.setBadgeText({ text: count ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#d33" });
}

async function notifyNewHost(host, title, url) {
  const id = `history-discovery-${host}-${Date.now()}`;
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icon128.png",
    title: `New site: ${host}`,
    message: title || url,
    buttons: [{ title: "Allow" }, { title: "Deny future visits" }],
    requireInteraction: true,
  });
  const map = await getNotificationMap();
  map[id] = host;
  await setNotificationMap(map);
}

// Normalizes a user-edited scope value: trims, drops it entirely if blank
// (host-wide rule). No leading-slash normalization - scope is matched as a
// substring anywhere in the URL, so it might legitimately be a bare path
// segment, a query param value, or a snippet with no slash at all.
function normalizeScope(scope) {
  if (!scope) return null;
  const trimmed = scope.trim();
  return trimmed || null;
}

// No retroactive deletion, ever: this only records the rule for future
// visits going forward. Whatever's already in history for this host,
// including the visit that triggered the prompt, is left untouched.
//
// "Raw" - assumes the caller already holds the storage lock. Call these
// directly only from inside another withStorageLock() (see the notification
// handlers below); everyone else should call the unsuffixed wrappers.
async function resolveHostRaw(host, action, scope = null) {
  const rules = await getRules();
  rules.push({ host, scope: normalizeScope(scope), action, createdAt: Date.now() });
  await setRules(rules);

  const pending = await getPending();
  await setPending(pending.filter((p) => p.host !== host));
  await updateBadge();
}

async function dismissPendingRaw(host) {
  const pending = await getPending();
  await setPending(pending.filter((p) => p.host !== host));
  await updateBadge();
}

async function removeRuleRaw(rule) {
  const rules = await getRules();
  const index = rules.findIndex((r) => isSameRule(r, rule));
  if (index === -1) return; // already gone - removed by another view
  rules.splice(index, 1);
  await setRules(rules);
}

// Drops the notification -> host mapping for a notification that's done
// with. Returns whether there was an entry to drop.
async function dropNotificationRaw(notifId) {
  const map = await getNotificationMap();
  if (!(notifId in map)) return false;
  delete map[notifId];
  await setNotificationMap(map);
  return true;
}

async function resolveHost(host, action, scope = null) {
  return withStorageLock(() => resolveHostRaw(host, action, scope));
}

async function dismissPending(host) {
  return withStorageLock(() => dismissPendingRaw(host));
}

async function removeRule(rule) {
  return withStorageLock(() => removeRuleRaw(rule));
}

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  const resolved = await withStorageLock(async () => {
    const map = await getNotificationMap();
    const host = map[notifId];
    if (!host) return false;
    await resolveHostRaw(host, buttonIndex === 0 ? "allow" : "deny");
    delete map[notifId];
    await setNotificationMap(map);
    return true;
  });
  if (resolved) chrome.notifications.clear(notifId);
});

// Dismissed without clicking a button (manually closed) -> just drop the
// map entry, the pending item itself stays in the queue for later review
// via the popup.
chrome.notifications.onClosed.addListener(async (notifId) => {
  await withStorageLock(() => dropNotificationRaw(notifId));
});

// Clicking the notification body (not a button) jumps straight to View
// Rules - Chrome only supports 2 notification buttons, so this is the
// shortcut to the rules page instead of a third button. Same as closing it
// manually: the pending entry itself is untouched, still there to resolve
// later via the popup.
chrome.notifications.onClicked.addListener(async (notifId) => {
  const found = await withStorageLock(() => dropNotificationRaw(notifId));
  if (!found) return;
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  chrome.notifications.clear(notifId);
});

chrome.history.onVisited.addListener(async (item) => {
  const url = item.url;

  if (isOwnExtensionUrl(url)) {
    await deleteAndLog(url, item.title, "Rotten's own page");
    return;
  }

  // Only ever act on real web pages - chrome-extension:// (other
  // extensions), chrome://, file://, etc. should never enter discovery or
  // the hard rules.
  if (!/^https?:\/\//i.test(url)) return;
  const parsed = parseUrl(url);
  if (!parsed || !parsed.hostname) return;

  const host = parsed.hostname;
  const pathname = parsed.pathname;

  const visit = { item, url, host, pathname };
  const hardRule = HARD_DELETE_RULES.find((rule) => rule.test(visit));
  if (hardRule) {
    await deleteAndLog(url, item.title, hardRule.name);
    return;
  }
  if (await isBookmarked(url)) {
    await deleteAndLog(url, item.title, "Bookmarked link");
    return;
  }

  await withStorageLock(async () => {
    if (await handleCanonicalDuplicate(url, item.title, parsed)) {
      return;
    }

    const rules = await getRules();
    const rule = matchRule(rules, host, decodeLoose(url));
    if (rule) {
      if (rule.action === "deny") {
        const scope = rule.scope ? ` / ${rule.scope}` : "";
        await deleteAndLogRaw(url, item.title, `Learned rule: deny ${rule.host}${scope}`);
      }
      return; // action === "allow" -> leave it alone
    }

    const pending = await getPending();
    const existing = pending.find((p) => p.host === host);
    if (existing) {
      existing.count += 1;
      existing.lastUrl = url;
      existing.lastTitle = item.title || "";
    } else {
      pending.push({
        host,
        sampleUrl: url,
        sampleTitle: item.title || "",
        count: 1,
        firstSeenAt: Date.now(),
      });
      // New host -> notify immediately instead of waiting for a badge click.
      // Only fires once per host: after this, "existing" above will match and
      // no further notifications go out until the pending entry is resolved
      // (via the notification buttons or the popup).
      await notifyNewHost(host, item.title, url);
    }
    await setPending(pending);
    await updateBadge();
  });
});

// onVisited's isBookmarked() check only catches a URL that was already
// bookmarked at the moment it was visited. Bookmarking right after visiting
// (the common flow) misses that check - the visit already went to pending
// and may have fired a "new site" notification. This listener catches that
// case after the fact: once the bookmark exists, delete the history entry
// the same way onVisited would have, and clear out any pending/notification
// state for the host so there's nothing left to manually skip.
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  const url = bookmark.url;
  if (!url || !/^https?:\/\//i.test(url)) return;
  const parsed = parseUrl(url);
  if (!parsed || !parsed.hostname) return;
  const host = parsed.hostname;

  withStorageLock(async () => {
    await deleteAndLogRaw(url, bookmark.title, "Bookmarked link (after the fact)");

    const pending = await getPending();
    if (pending.some((p) => p.host === host)) {
      await setPending(pending.filter((p) => p.host !== host));
      await updateBadge();
    }

    const map = await getNotificationMap();
    let changed = false;
    for (const [notifId, mappedHost] of Object.entries(map)) {
      if (mappedHost === host) {
        chrome.notifications.clear(notifId);
        delete map[notifId];
        changed = true;
      }
    }
    if (changed) await setNotificationMap(map);
  });
});

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

// popup.js routes its allow/deny/dismiss actions through here instead of
// writing to storage directly, and options.js's manual "Add a rule" form and
// its Remove buttons reuse the same channel, so every pending/rules
// mutation - whether triggered by a notification button, the popup, or the
// rules page - goes through the same storageQueue and can't race with an
// in-flight onVisited handler. Each handler answers with the list its caller
// re-renders from.
const MESSAGE_HANDLERS = {
  async resolvePending(message) {
    await resolveHost(message.host, message.action, message.scope);
    return { pending: await getPending() };
  },
  async dismissPending(message) {
    await dismissPending(message.host);
    return { pending: await getPending() };
  },
  async removeRule(message) {
    await removeRule(message.rule);
    return { rules: await getRules() };
  },
  // Read-only: hands back the queue without clearing it. Entries only leave
  // the queue via ackLogQueue, once the options page has actually written
  // them to disk - otherwise a failed/interrupted write would lose them from
  // both the queue and the file.
  async peekLogQueue() {
    return { entries: await getLogQueue() };
  },
  // Removes the first `count` entries (the ones the caller just confirmed it
  // wrote) under the lock, so an in-flight onVisited deletion appending to
  // the queue mid-write can't have its entry discarded by this trim.
  async ackLogQueue(message) {
    return withStorageLock(async () => {
      const queue = await getLogQueue();
      await setLogQueue(queue.slice(message.count));
      return {};
    });
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (!Object.hasOwn(MESSAGE_HANDLERS, type)) return;
  MESSAGE_HANDLERS[type](message).then(sendResponse);
  return true;
});

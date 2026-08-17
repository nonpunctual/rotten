// Hard rules that are always applied, never asked about.
const CLOUDFLARE_TITLE = "Just a moment...";

// Exact-token match (word boundaries), not a loose substring - so
// "authentication"/"authuser" don't trigger on "auth", but a real /login,
// /auth/, ?oauth=, /signin, or /sign-in path or param does.
const AUTH_KEYWORD_RE = /\b(login|oauth|auth|signin|sign-in)\b/i;

function isCloudflareInterstitial(item) {
  return item.title === CLOUDFLARE_TITLE && item.url.includes("__cf_chl");
}

function isAuthKeywordUrl(url) {
  return AUTH_KEYWORD_RE.test(url);
}

// Search-result pages only, not the bare homepage - so duckduckgo.com/ or
// google.com/ themselves are unaffected, only the results of a query.
function isSearchResultUrl(url) {
  return url.includes("duckduckgo.com/?q=") || url.includes("google.com/search?q=");
}

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

function isWholeDomainNoise(host) {
  return WHOLE_DOMAIN_NOISE_HOSTS.includes(host);
}

function isBareHomepageNoise(host, pathname) {
  return BARE_HOMEPAGE_ONLY_HOSTS.includes(host) && (pathname === "" || pathname === "/");
}

// GitHub path-category rules. Delete: search results, login/sessions,
// settings/*, edit-mode, branch compare, directory browsing (tree),
// invitations, bare org/user profile pages. Keep: file views (blob),
// issues/pull, bare repo pages (default keep, bookmark rule handles it if
// bookmarked).
const GITHUB_DELETE_TOP = ["search", "login", "sessions", "settings"];
const GITHUB_DELETE_CATEGORY = ["edit", "compare", "tree", "invitations"];

function isGithubNoise(host, pathname) {
  if (host !== "github.com") return false;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return false; // bare homepage - not covered, leave alone
  if (GITHUB_DELETE_TOP.includes(parts[0])) return true;
  if (parts.length === 1) return true; // bare org/user profile
  if (parts.length === 2) return false; // bare repo - kept by default
  return GITHUB_DELETE_CATEGORY.includes(parts[2]);
}

// LinkedIn allowlist: keep only other people's contact pages and
// individual posts/company posts-listings; delete everything else on the
// domain (feed, search, network browsing, the OAuth/2FA chain, own
// profile, saved posts). Own-profile slug is hardcoded - update if it
// ever changes.
const LI_OWN_SLUG = "brock-walters-247a2990";

function isLinkedInNoise(host, pathname) {
  if (!["www.linkedin.com", "linkedin.com"].includes(host)) return false;
  const isContact = pathname.startsWith("/in/") && !pathname.includes(LI_OWN_SLUG);
  const isPost =
    pathname.startsWith("/feed/update/urn:li:activity:") ||
    (pathname.includes("/company/") && pathname.includes("/posts"));
  return !(isContact || isPost);
}

// YouTube/Google Docs duplicate merging. Each tracking/session-param variant
// (list=, index=, sttick=, slide=, pli=, ...) is its own distinct URL, so
// this doesn't need to scan existing history like the generic repeat-visit
// trim would - it just remembers the first video/doc id it sees (the
// keeper) and deletes any later variant of the same id as it comes in.
// First-seen-wins, no retroactive lookback, same as everything else here.

function extractYouTubeVideoId(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return null;
  }
  if (!["www.youtube.com", "youtube.com"].includes(u.hostname)) return null;
  if (u.pathname !== "/watch") return null;
  return u.searchParams.get("v");
}

function extractGoogleDocId(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return null;
  }
  if (u.hostname !== "docs.google.com") return null;
  const m = u.pathname.match(/^\/(presentation|document|spreadsheets)\/d\/([^/]+)\//);
  return m ? m[2] : null;
}

// Serializes every storage read-modify-write section below so overlapping
// onVisited invocations (and messages from the popup) can't interleave
// their get/set calls and silently drop each other's writes.
let storageQueue = Promise.resolve();
function withStorageLock(fn) {
  const run = storageQueue.then(fn, fn);
  storageQueue = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function getCanonicalStore() {
  const { canonical } = await chrome.storage.local.get({
    canonical: { youtube: {}, googleDocs: {} },
  });
  return canonical;
}
async function setCanonicalStore(canonical) {
  await chrome.storage.local.set({ canonical });
}

// Returns true if this visit was a duplicate and got deleted; false if it's
// the first-seen instance for its canonical id (kept) or doesn't match
// either pattern at all.
async function handleCanonicalDuplicate(url) {
  const videoId = extractYouTubeVideoId(url);
  const docId = videoId ? null : extractGoogleDocId(url);
  if (!videoId && !docId) return false;

  const canonical = await getCanonicalStore();
  const bucket = videoId ? canonical.youtube : canonical.googleDocs;
  const key = videoId || docId;

  if (bucket[key]) {
    chrome.history.deleteUrl({ url });
    return true;
  }
  bucket[key] = url;
  await setCanonicalStore(canonical);
  return false;
}

function getHost(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

function getPath(url) {
  try {
    return new URL(url).pathname;
  } catch (e) {
    return "";
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

async function getRules() {
  const { rules } = await chrome.storage.local.get({ rules: [] });
  return rules;
}

async function setRules(rules) {
  await chrome.storage.local.set({ rules });
}

async function getPending() {
  const { pending } = await chrome.storage.local.get({ pending: [] });
  return pending;
}

async function setPending(pending) {
  await chrome.storage.local.set({ pending });
}

// Most-specific pathPrefix match wins; a host-only rule (pathPrefix null) is the fallback.
function matchRule(rules, host, pathname) {
  let best = null;
  for (const r of rules) {
    if (r.host !== host) continue;
    if (r.pathPrefix) {
      if (pathname.startsWith(r.pathPrefix)) {
        if (!best || !best.pathPrefix || best.pathPrefix.length < r.pathPrefix.length) {
          best = r;
        }
      }
    } else if (!best) {
      best = r;
    }
  }
  return best;
}

async function updateBadge() {
  const pending = await getPending();
  const count = pending.length;
  chrome.action.setBadgeText({ text: count ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#d33" });
}

// Maps a live notification id -> the host it's asking about, so the button
// click handler knows which pending entry to resolve.
async function getNotificationMap() {
  const { notificationMap } = await chrome.storage.local.get({ notificationMap: {} });
  return notificationMap;
}
async function setNotificationMap(m) {
  await chrome.storage.local.set({ notificationMap: m });
}

async function notifyNewHost(host, title, url) {
  const id = `history-discovery-${host}-${Date.now()}`;
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icon128.png",
    title: `New site: ${host}`,
    message: title || url,
    buttons: [{ title: "Keep" }, { title: "Delete future visits" }],
    requireInteraction: true,
  });
  const map = await getNotificationMap();
  map[id] = host;
  await setNotificationMap(map);
}

// Normalizes a user-edited scope value: trims, drops it entirely if blank
// (host-wide rule), and adds a leading slash if missing so a typo like
// "org/repo" still matches via pathname.startsWith() instead of silently
// never matching.
function normalizePathPrefix(pathPrefix) {
  if (!pathPrefix) return null;
  const trimmed = pathPrefix.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// No retroactive deletion, ever: this only records the rule for future
// visits going forward. Whatever's already in history for this host,
// including the visit that triggered the prompt, is left untouched.
async function resolveHost(host, action, pathPrefix = null) {
  return withStorageLock(async () => {
    const rules = await getRules();
    rules.push({ host, pathPrefix: normalizePathPrefix(pathPrefix), action, createdAt: Date.now() });
    await setRules(rules);

    const pending = await getPending();
    await setPending(pending.filter((p) => p.host !== host));
    await updateBadge();
  });
}

async function dismissPending(host) {
  return withStorageLock(async () => {
    const pending = await getPending();
    await setPending(pending.filter((p) => p.host !== host));
    await updateBadge();
  });
}

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  const map = await getNotificationMap();
  const host = map[notifId];
  if (!host) return;
  await resolveHost(host, buttonIndex === 0 ? "keep" : "delete");
  delete map[notifId];
  await setNotificationMap(map);
  chrome.notifications.clear(notifId);
});

// Dismissed without clicking a button (manually closed) -> just drop the
// map entry, the pending item itself stays in the queue for later review
// via the popup.
chrome.notifications.onClosed.addListener(async (notifId) => {
  const map = await getNotificationMap();
  if (notifId in map) {
    delete map[notifId];
    await setNotificationMap(map);
  }
});

chrome.history.onVisited.addListener(async (item) => {
  const url = item.url;
  const host = getHost(url);
  if (!host) return;

  // Cheap synchronous checks first - all of them, like the bookmark check
  // below, unconditionally delete on a match, so running them before the
  // async bookmarks.search call skips that I/O for most noisy visits.
  if (isCloudflareInterstitial(item)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  if (isAuthKeywordUrl(url)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  if (isSearchResultUrl(url)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  const pathname = getPath(url);

  if (isWholeDomainNoise(host)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  if (isBareHomepageNoise(host, pathname)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  if (isGithubNoise(host, pathname)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  if (isLinkedInNoise(host, pathname)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  if (await isBookmarked(url)) {
    chrome.history.deleteUrl({ url });
    return;
  }

  await withStorageLock(async () => {
    if (await handleCanonicalDuplicate(url)) {
      return;
    }

    const rules = await getRules();
    const rule = matchRule(rules, host, pathname);
    if (rule) {
      if (rule.action === "delete") {
        chrome.history.deleteUrl({ url });
      }
      return; // action === "keep" -> leave it alone
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

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

// popup.js routes its keep/delete/dismiss actions through here instead of
// writing to storage directly, so every pending/rules mutation - whether
// triggered by a notification button or the popup - goes through the same
// storageQueue and can't race with an in-flight onVisited handler.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "resolvePending") {
    resolveHost(message.host, message.action, message.pathPrefix).then(async () => {
      sendResponse({ pending: await getPending() });
    });
    return true;
  }
  if (message?.type === "dismissPending") {
    dismissPending(message.host).then(async () => {
      sendResponse({ pending: await getPending() });
    });
    return true;
  }
});

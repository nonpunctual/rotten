const HARD_RULES = [
  { rule: "Authorization / login keywords", matches: 'URLs containing exact matches for the words "auth", "oauth", "login", "signin", "sign-in", and "idmsa" (Apple) are deleted from the browser history.' },
  { rule: "Bookmarked links", matches: "Any URL that exactly matches a bookmarked URL is deleted from the browser history." },
  { rule: "Browser search results", matches: "URLs for searches on google.com or duckduckgo.com are deleted from the browser history." },
  { rule: "Cloudflare redirection", matches: 'Any page titled exactly "Just a moment..." whose URL also contains __cf_chl (Cloudflare\'s temporary "checking your browser" screen, not the real page underneath it) is deleted from the browser history.' },
  { rule: "GitHub", matches: "Search results, login/session pages, settings pages, and (within a repo) the edit, compare, and tree pages are deleted from the browser history. Everything else (bare profile pages, bare repo pages, file views, issues, pull requests, and invitations) is kept." },
  { rule: "Google Docs & Drive", matches: "The first visit to a given Google Doc, Sheet, Slide, or Drive file/folder is kept; any later visits to the same item (even if the URLs have different tracking parameters) are deleted from the browser history." },
  { rule: "Google service domains", matches: 'Every URL on "accounts.google.com", "calendar.google.com", "chat.google.com", "mail.google.com", or "meet.google.com" is deleted from the browser history. URLs containing "drive.google.com" are treated differently - only the bare top-level homepage is deleted. Real links on "drive.google.com" are kept.' },
  { rule: "LinkedIn", matches: "Profile page visits and post links (including company posts) are kept. All other URLs (feed, search, network browsing, and login pages) are deleted from the browser history." },
  { rule: "YouTube", matches: "The first visit to a given YouTube video is kept. Later visits to the same video (even if the URLs have different tracking parameters) are deleted from the browser history." },
];

// The rules exactly as last rendered. Remove buttons carry an index into
// this snapshot, and the rule object it points at - not the index - is what
// gets sent to background.js, so a rules list that changed underneath us
// (a notification button, another tab) can't make a Remove hit the wrong row.
let renderedRules = [];

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

async function getRules() {
  const { rules } = await chrome.storage.local.get({ rules: [] });
  return rules;
}

function renderHardRules() {
  const rows = document.getElementById("hardRows");
  rows.innerHTML = HARD_RULES.map(
    (r) => `<tr><td>${esc(r.rule)}</td><td>${esc(r.matches)}</td></tr>`
  ).join("");
}

function renderRuleRows(el, rules, indices, emptyLabel) {
  if (!indices.length) {
    el.innerHTML = `<tr><td colspan="3" class="empty">${esc(emptyLabel)}</td></tr>`;
    return;
  }
  el.innerHTML = indices
    .map(
      (i) => `
    <tr>
      <td>${esc(rules[i].host)}</td>
      <td>${esc(rules[i].scope || "(whole domain)")}</td>
      <td><button data-i="${i}">Remove</button></td>
    </tr>
  `
    )
    .join("");
}

function renderRules(rules) {
  renderedRules = rules;
  const allowIndices = [];
  const denyIndices = [];
  rules.forEach((r, i) => (r.action === "allow" ? allowIndices : denyIndices).push(i));
  renderRuleRows(document.getElementById("rowsAllow"), rules, allowIndices, "No allow rules learned yet.");
  renderRuleRows(document.getElementById("rowsDeny"), rules, denyIndices, "No deny rules learned yet.");
}

async function render() {
  renderRules(await getRules());
}

// Removal goes through background.js for the same reason the add form does:
// it's a read-modify-write of "rules" and has to happen under the storage
// lock, not as an unlocked write from this page.
async function removeRule(rule) {
  const response = await chrome.runtime.sendMessage({ type: "removeRule", rule });
  renderRules(response.rules);
}

function onRulesTableClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const rule = renderedRules[Number(btn.dataset.i)];
  if (rule) removeRule(rule);
}

for (const id of ["rowsAllow", "rowsDeny"]) {
  document.getElementById(id).addEventListener("click", onRulesTableClick);
}

// Lets a full URL be pasted into the host field instead of requiring the
// bare hostname.
function parseHost(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).hostname;
    } catch (e) {
      return null;
    }
  }
  return trimmed;
}

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const hostInput = document.getElementById("addHost");
  const scopeInput = document.getElementById("addScope");
  const actionSelect = document.getElementById("addAction");

  const host = parseHost(hostInput.value);
  if (!host) {
    hostInput.focus();
    return;
  }

  // Same message popup.js sends to resolve a live pending entry - besides
  // adding the rule, it also clears out any pending entry for this host
  // (harmless no-op if there isn't one) and does both under background.js's
  // storage lock, instead of this page writing to "rules" unlocked.
  await chrome.runtime.sendMessage({
    type: "resolvePending",
    host,
    action: actionSelect.value,
    scope: scopeInput.value,
  });

  hostInput.value = "";
  scopeInput.value = "";
  actionSelect.value = "allow";
  render();
});

renderHardRules();
render();

// Log file: the file handle can't go in chrome.storage (not structured-
// cloneable there), so it's kept in this page's own IndexedDB - the
// standard persistence mechanism for File System Access handles. Only
// this page (not background.js, which has no filesystem access at all)
// ever touches the file; background.js just queues entries for it to drain.
const LOG_DB_NAME = "rottenLogFile";
const LOG_DB_STORE = "handles";
const LOG_DB_KEY = "logFile";

function openLogDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOG_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOG_DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getSavedLogHandle() {
  const db = await openLogDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOG_DB_STORE, "readonly");
    const req = tx.objectStore(LOG_DB_STORE).get(LOG_DB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveLogHandle(handle) {
  const db = await openLogDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOG_DB_STORE, "readwrite");
    tx.objectStore(LOG_DB_STORE).put(handle, LOG_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let logFileHandle = null;

function setLogStatus(text) {
  document.getElementById("logFileStatus").textContent = text;
}

// Permission on a handle isn't permanent - it lapses when the browser
// restarts, and has to be re-granted from a user gesture (the button below)
// before the file can be written to again.
async function hasWritePermission(handle) {
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

// File System Access has no true append mode: a writable stream truncates
// unless keepExistingData is set, and even then writes start at position 0
// unless given an explicit offset - so every drain reads the current size
// first and writes new lines starting there.
async function appendEntriesToFile(handle, entries) {
  if (!entries.length) return;
  const file = await handle.getFile();
  const writable = await handle.createWritable({ keepExistingData: true });
  const text = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writable.write({ type: "write", position: file.size, data: text });
  await writable.close();
}

// navigator.locks (not a local promise chain) because the lock has to hold
// across tabs, not just within this page: two options.html tabs can restore
// the same file handle from IndexedDB and both try to drain at once. Web
// Locks serialize same-named requests across every document of this
// extension's origin, so only one drain (peek -> write -> ack) runs at a
// time regardless of how many tabs are open.
async function drainLogQueue() {
  if (!logFileHandle) return;
  if (!(await hasWritePermission(logFileHandle))) return;
  await navigator.locks.request("rotten-log-file-write", async () => {
    const { entries } = await chrome.runtime.sendMessage({ type: "peekLogQueue" });
    if (!entries.length) return;
    // Only acknowledged (removed from background's queue) after the write
    // to disk succeeds - if appendEntriesToFile throws, the entries stay
    // queued and the next drain retries them instead of losing them.
    await appendEntriesToFile(logFileHandle, entries);
    await chrome.runtime.sendMessage({ type: "ackLogQueue", count: entries.length });
  });
}

async function connectLogHandle(handle) {
  logFileHandle = handle;
  setLogStatus(`Logging to ${handle.name}`);
  await drainLogQueue();
}

document.getElementById("chooseLogFile").addEventListener("click", async () => {
  try {
    // Reconnecting an already-picked file (permission lapsed, e.g. after a
    // browser restart) re-requests permission on the same handle instead of
    // making the user pick a file all over again.
    if (logFileHandle) {
      const permission = await logFileHandle.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        await connectLogHandle(logFileHandle);
        return;
      }
    }
    const handle = await window.showSaveFilePicker({
      suggestedName: "rotten-activity.log",
      types: [{ description: "JSON Lines log", accept: { "application/octet-stream": [".log", ".jsonl"] } }],
    });
    await saveLogHandle(handle);
    await connectLogHandle(handle);
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
});

async function initLogFile() {
  const saved = await getSavedLogHandle();
  if (!saved) {
    setLogStatus("Not logging.");
    return;
  }
  if (await hasWritePermission(saved)) {
    await connectLogHandle(saved);
    return;
  }
  logFileHandle = saved;
  setLogStatus(`Not logging — click "Choose log file…" to reconnect ${saved.name}`);
}

// Live updates while this page is open: every new deletion queued by
// background.js triggers a drain immediately, so a screen recording shows
// entries landing in the file in real time. Guarded on a non-empty newValue
// so ackLogQueue's own queue-clearing write doesn't trigger a redundant
// drain of its own.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.logQueue?.newValue?.length) drainLogQueue();
});

initLogFile();

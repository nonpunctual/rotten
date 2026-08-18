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

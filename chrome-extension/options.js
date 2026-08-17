const HARD_RULES = [
  { rule: "Authorization / login keywords", matches: 'URLs containing exact matches for the words "auth", "oauth", "login", "signin", or "sign-in" are deleted from the browser history.' },
  { rule: "Bookmarked links", matches: "Any URL that exactly matches a bookmarked URL is deleted from the browser history." },
  { rule: "Browser search results", matches: "URLs for searches on google.com or duckduckgo.com are deleted from the browser history." },
  { rule: "Cloudflare redirection", matches: 'Any page titled exactly "Just a moment..." whose URL also contains __cf_chl (Cloudflare\'s temporary "checking your browser" screen, not the real page underneath it) is deleted from the browser history.' },
  { rule: "GitHub", matches: "Search results, login/session pages, settings pages, and (within a repo) the edit, compare, and tree pages are deleted from the browser history. Everything else (bare profile pages, bare repo pages, file views, issues, pull requests, and invitations) is kept." },
  { rule: "Google Docs & Drive", matches: "The first visit to a given Google Doc, Sheet, Slide, or Drive file/folder is kept; any later visits to the same item (even if the URLs have different tracking parameters) are deleted from the browser history." },
  { rule: "Google service domains", matches: 'Every URL on "accounts.google.com", "calendar.google.com", "chat.google.com", "mail.google.com", or "meet.google.com" is deleted from the browser history. URLs containing "drive.google.com" are treated differently - only the bare top-level homepage is deleted. Real links on "drive.google.com" are kept.' },
  { rule: "LinkedIn", matches: "Other people's profile pages and individual posts (including company post listings) are kept. All other URLs (including your own profile, feed, search, network browsing, and login pages) are deleted from the browser history." },
  { rule: "YouTube", matches: "The first visit to a given YouTube video is kept. Later visits to the same video (even if the URLs have different tracking parameters) is deleted from the browser history." },
];

function renderHardRules() {
  const rows = document.getElementById("hardRows");
  rows.innerHTML = HARD_RULES.map(
    (r) => `<tr><td>${esc(r.rule)}</td><td>${esc(r.matches)}</td></tr>`
  ).join("");
}

async function getRules() {
  const { rules } = await chrome.storage.local.get({ rules: [] });
  return rules;
}
async function setRules(rules) {
  await chrome.storage.local.set({ rules });
}
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
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
      <td>${esc(rules[i].pathPrefix || "(whole domain)")}</td>
      <td><button data-i="${i}">Remove</button></td>
    </tr>
  `
    )
    .join("");
}

async function render() {
  const rules = await getRules();
  const allowIndices = [];
  const denyIndices = [];
  rules.forEach((r, i) => (r.action === "allow" ? allowIndices : denyIndices).push(i));
  renderRuleRows(document.getElementById("rowsAllow"), rules, allowIndices, "No allow rules learned yet.");
  renderRuleRows(document.getElementById("rowsDeny"), rules, denyIndices, "No deny rules learned yet.");
}

async function removeRule(i) {
  const rules = await getRules();
  rules.splice(i, 1);
  await setRules(rules);
  render();
}
document.getElementById("rowsAllow").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  removeRule(Number(e.target.dataset.i));
});
document.getElementById("rowsDeny").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  removeRule(Number(e.target.dataset.i));
});
renderHardRules();
render();

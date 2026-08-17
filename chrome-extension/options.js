const HARD_RULES = [
  { rule: "Bookmarked", matches: "Any URL that's also in your Chrome Bookmarks (exact match)" },
  { rule: "Cloudflare interstitial", matches: 'Title is exactly "Just a moment..." AND the URL contains __cf_chl' },
  { rule: "Auth keyword", matches: "URL contains login, oauth, auth, signin, or sign-in as an exact word (not substring - authentication doesn't count)" },
  { rule: "Search results", matches: "duckduckgo.com/?q=... or google.com/search?q=... (bare homepages are unaffected)" },
  { rule: "Whole-domain noise", matches: "accounts.google.com, calendar.google.com, chat.google.com, mail.google.com, meet.google.com — every path deleted" },
  { rule: "Bare-homepage noise", matches: "drive.google.com — only the bare homepage is deleted, anything with a path is left alone" },
  { rule: "YouTube duplicate merge", matches: "Same v= video id seen again → the later visit is deleted, first-seen instance is kept" },
  { rule: "Google Docs duplicate merge", matches: "Same /d/<doc id>/ seen again (Docs/Slides/Sheets) → the later visit is deleted, first-seen instance is kept" },
  { rule: "GitHub path rules", matches: "Delete: search, login/sessions, settings/*, edit, compare, tree, invitations, bare org/user profile. Keep: blob, issues/pull, bare repo." },
  { rule: "LinkedIn allowlist", matches: "Keep only: other people's /in/<slug> contact pages (not your own) and posts/company-posts pages. Delete everything else on the domain." },
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
async function render() {
  const rules = await getRules();
  const rows = document.getElementById("rows");
  if (!rules.length) {
    rows.innerHTML = '<tr><td colspan="4" class="empty">No rules learned yet.</td></tr>';
    return;
  }
  rows.innerHTML = rules
    .map(
      (r, i) => `
    <tr>
      <td>${esc(r.host)}</td>
      <td>${esc(r.pathPrefix || "(whole domain)")}</td>
      <td>${esc(r.action)}</td>
      <td><button data-i="${i}">Remove</button></td>
    </tr>
  `
    )
    .join("");
}
document.getElementById("rows").addEventListener("click", async (e) => {
  if (e.target.tagName !== "BUTTON") return;
  const i = Number(e.target.dataset.i);
  const rules = await getRules();
  rules.splice(i, 1);
  await setRules(rules);
  render();
});
renderHardRules();
render();

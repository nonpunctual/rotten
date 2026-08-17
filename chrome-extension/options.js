const HARD_RULES = [
  { rule: "Authorization / login keywords", matches: "URLs containing exact matches for the words auth, oauth, login, signin, or sign-in are deleted." },
  { rule: "Bookmarked links", matches: "Any URL that exactly matches a bookmarked URL is deleted from the browser history." },
  { rule: "Browser search results", matches: "URLs for searches on google.com or duckduckgo.com are deleted." },
  { rule: "Cloudflare redirection", matches: 'Any page titled exactly "Just a moment..." whose URL also contains __cf_chl is deleted - this is Cloudflare\'s temporary "checking your browser" screen, not the real page underneath it.' },
  { rule: "GitHub", matches: "On github.com: delete search results, login/session pages, settings pages, and (within a repo) the edit, compare, and tree pages. Keep everything else - including bare profile pages, bare repo pages, file views, issues, pull requests, and invitations." },
  { rule: "Google Docs & Drive", matches: "The first visit to a given Google Doc, Sheet, Slide, or Drive file/folder is kept; any later visit to that same item - even with different tracking parameters - is deleted." },
  { rule: "Google service domains", matches: "Every URL on accounts.google.com, calendar.google.com, chat.google.com, mail.google.com, or meet.google.com is deleted, regardless of path. drive.google.com is treated differently: only its bare top-level homepage is deleted - any real link on drive.google.com is left alone." },
  { rule: "LinkedIn", matches: "On linkedin.com: keep only other people's profile pages and individual posts (including company post listings). Delete everything else - including your own profile, feed, search, network browsing, and login pages." },
  { rule: "YouTube", matches: "The first visit to a given YouTube video is kept; any later visit to the same video - even with different tracking parameters - is deleted." },
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

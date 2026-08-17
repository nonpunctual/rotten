async function getPending() {
  const { pending } = await chrome.storage.local.get({ pending: [] });
  return pending;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function samplePathname(p) {
  try {
    return new URL(p.lastUrl || p.sampleUrl).pathname;
  } catch (e) {
    return "";
  }
}

function renderPending(pending) {
  const list = document.getElementById("list");
  if (!pending.length) {
    list.innerHTML = '<div class="empty">Nothing new to review.</div>';
    return;
  }
  list.innerHTML = pending
    .map(
      (p) => `
    <div class="item" data-host="${esc(p.host)}">
      <div class="host">${esc(p.host)}</div>
      <div class="sample">${esc(p.sampleTitle || p.sampleUrl)}</div>
      <div class="count">${p.count} visit${p.count === 1 ? "" : "s"} seen</div>
      <div class="scope">
        <label>Scope: ${esc(p.host)}<input type="text" class="prefix-input" value="${esc(
        samplePathname(p)
      )}" placeholder="(whole domain)"></label>
      </div>
      <div class="actions">
        <button data-action="allow">Allow</button>
        <button data-action="deny">Deny future visits</button>
        <button data-action="dismiss">Skip for now</button>
      </div>
    </div>
  `
    )
    .join("");
}

async function render() {
  renderPending(await getPending());
}

document.getElementById("list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const itemEl = e.target.closest(".item");
  const host = itemEl.dataset.host;
  const action = btn.dataset.action;

  // Both allow/deny/dismiss are handled by background.js, which serializes
  // them against onVisited's own storage writes - see resolvePending /
  // dismissPending in background.js.
  let message;
  if (action === "allow" || action === "deny") {
    const scope = itemEl.querySelector(".prefix-input").value.trim() || null;
    message = { type: "resolvePending", host, action, scope };
  } else {
    message = { type: "dismissPending", host };
  }
  const response = await chrome.runtime.sendMessage(message);
  renderPending(response.pending);
});

render();

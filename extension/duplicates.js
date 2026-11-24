import {groupDuplicates, hostSummary, planDeletes} from "./lib/duplicates.js";
import {ruleFromUrl} from "./lib/rules.js";
import {searchAll, deleteVisits} from "./lib/history.js";

const $ = (id) => document.getElementById(id);
const status = $("status");
const progress = $("progress");
const dialog = $("confirm");

let groups = new Map();
let summary = [];
let busy = false;

function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) {
        td.className = className;
    }
    return td;
}

// Resolves true when the user clicks Delete; Cancel and Escape resolve false.
function ask(text) {
    $("confirm-text").textContent = text;
    dialog.returnValue = "";
    dialog.showModal();
    return new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), {once: true});
    });
}

// One action at a time; errors go to the status line.
async function run(action) {
    if (busy) {
        return;
    }
    busy = true;
    try {
        await action();
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
    } finally {
        busy = false;
        progress.hidden = true;
    }
}

// Counts come from Chrome's visitCount, so they're approximate.
async function load() {
    groups = groupDuplicates(await searchAll());
    summary = hostSummary(groups);
}

function showList() {
    const body = $("hosts");
    body.replaceChildren();
    for (const {host, duplicates} of summary) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "host";
        button.textContent = host;
        button.addEventListener("click", () => {
            if (!busy) {
                showHost(host);
                status.textContent = "";
            }
        });
        const hostCell = document.createElement("td");
        hostCell.append(button);
        const tr = document.createElement("tr");
        tr.append(cell(String(duplicates), "n"), hostCell);
        body.append(tr);
    }
    $("detail").hidden = true;
    $("list").hidden = false;
    $("delete").dataset.host = "";
}

// The host's pages (base URLs) with more than 1 visit, most visits first.
function showHost(host) {
    const pages = [...groups]
        .filter(([, group]) => group.host === host && group.visits > 1)
        .sort((a, b) => b[1].visits - a[1].visits || (a[0] < b[0] ? -1 : 1));
    const body = $("pages");
    body.replaceChildren();
    for (const [base, group] of pages) {
        const link = document.createElement("a");
        link.href = `rules.html?add=${encodeURIComponent(ruleFromUrl(base))}`;
        link.target = "_blank";
        link.textContent = "Make rule";
        const make = document.createElement("td");
        make.className = "make";
        make.append(link);
        const tr = document.createElement("tr");
        tr.append(cell(String(group.visits), "n"), cell(base, "url"), make);
        body.append(tr);
    }
    $("detail-host").textContent = host;
    $("delete").dataset.host = host;
    $("list").hidden = true;
    $("detail").hidden = false;
}

function describe() {
    if (summary.length === 0) {
        return "No duplicates.";
    }
    const total = summary.reduce((n, item) => n + item.duplicates, 0);
    return `${summary.length} hosts, about ${total} duplicates.`;
}

const warn = (event) => {
    event.preventDefault();
    event.returnValue = "";
};

// Every visit of every URL in the host's groups; planDeletes keeps each group's oldest visit.
async function deleteDuplicates(host) {
    const hostGroups = [...groups.values()].filter((group) => group.host === host);
    const urlCount = hostGroups.reduce((n, group) => n + group.urls.length, 0);
    progress.max = urlCount;
    progress.value = 0;
    progress.hidden = false;
    const deletes = [];
    let near = 0;
    for (const group of hostGroups) {
        const visitsByUrl = new Map();
        for (const url of group.urls) {
            visitsByUrl.set(url, await chrome.history.getVisits({url}));
            progress.value++;
            status.textContent = `Counting... ${progress.value} of ${urlCount} pages`;
        }
        const plan = planDeletes(visitsByUrl);
        deletes.push(...plan.deletes);
        near += plan.skipped.length;
    }
    progress.hidden = true;
    const total = deletes.length + near;
    if (total === 0) {
        status.textContent = `No duplicates found for ${host}.`;
        return;
    }
    status.textContent = "";
    if (!(await ask(`Delete ${total} entries from ${host}?`))) {
        return;
    }
    progress.max = deletes.length;
    progress.value = 0;
    progress.hidden = false;
    window.addEventListener("beforeunload", warn);
    const started = performance.now();
    let result;
    try {
        result = await deleteVisits(deletes, "duplicate", (done, n) => {
            progress.value = done;
            status.textContent = `Deleting... ${done} of ${n}`;
        });
    } finally {
        window.removeEventListener("beforeunload", warn);
    }
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    await load();
    showList();
    if (summary.some((item) => item.host === host)) {
        showHost(host);
    }
    status.textContent = `Deleted ${result.deleted} entries, skipped ${result.skipped + near} ` +
        `(too close in time to another entry to delete alone), in ${seconds} s.`;
}

$("back").addEventListener("click", () => {
    if (!busy) {
        $("detail").hidden = true;
        $("list").hidden = false;
        $("delete").dataset.host = "";
        status.textContent = describe();
    }
});

$("delete").addEventListener("click", () => {
    const host = $("delete").dataset.host;
    if (host) {
        run(() => deleteDuplicates(host));
    }
});

run(async () => {
    await load();
    showList();
    status.textContent = describe();
});

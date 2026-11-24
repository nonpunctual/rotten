import {readLog, exportLog} from "./lib/log.js";

const PAGE = 500;

const status = document.getElementById("status");
const body = document.getElementById("log");
const older = document.getElementById("older");

let lastId = null;
let shown = 0;

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

// Appends the next PAGE entries older than the last one shown.
async function load() {
    older.disabled = true;
    const entries = await readLog(PAGE, lastId);
    for (const entry of entries) {
        const tr = document.createElement("tr");
        tr.append(cell(new Date(entry.time).toLocaleString()), cell(entry.reason), cell(entry.url));
        body.append(tr);
    }
    if (entries.length > 0) {
        lastId = entries.at(-1).id;
    }
    shown += entries.length;
    status.textContent = shown === 0 ? "Nothing deleted yet." : `Showing the newest ${shown}.`;
    older.hidden = entries.length < PAGE;
    older.disabled = false;
}

older.addEventListener("click", () => {
    load().catch((error) => {
        status.textContent = `Error: ${error.message}`;
    });
});

// JSON Lines, oldest first, one {url, reason, time} per line.
document.getElementById("export").addEventListener("click", async () => {
    try {
        const text = await exportLog();
        const url = URL.createObjectURL(new Blob([text], {type: "application/x-ndjson"}));
        const a = document.createElement("a");
        a.href = url;
        a.download = "rotten-deleted.jsonl";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
    }
});

await load();

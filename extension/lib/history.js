// Chrome-only history glue. Checked by hand in Tasks 8 and 14.

import {appendLog, logEntry} from "./log.js";

const MAX_RESULTS = 1000000;
const FLUSH_EVERY = 100;

// One call: the lab found no cap (5,000 of 5,000 returned).
export function searchAll() {
    return chrome.history.search({text: "", startTime: 0, maxResults: MAX_RESULTS});
}

// Collects log entries for what was deleted and writes them every FLUSH_EVERY entries,
// so a page closed mid-run loses at most that many log entries.
function logWriter() {
    let pending = [];
    let count = 0;
    const flush = () => {
        const batch = pending;
        pending = [];
        return appendLog(batch);
    };
    return {
        async add(entry) {
            pending.push(entry);
            count++;
            if (pending.length >= FLUSH_EVERY) {
                await flush();
            }
        },
        flush,
        get count() {
            return count;
        },
    };
}

// deleteUrl each URL; log only what was deleted, even if a later call fails.
export async function deleteUrls(urls, reason) {
    const log = logWriter();
    try {
        for (const url of urls) {
            const entry = logEntry(url, reason, 0);
            await chrome.history.deleteUrl({url});
            entry.time = Date.now();
            await log.add(entry);
        }
    } finally {
        await log.flush();
    }
    return log.count;
}

// Delete single visits with deleteRange over [floor(t), floor(t) + 1], the lab's narrowest
// passing window. deleteRange also deletes other URLs' visits in that window, so a visit is
// skipped when search lists any other URL near it. The search window is 1 ms wider on each
// side than the delete window, so an endpoint difference between the two calls can't hide one.
export async function deleteVisits(visits, reason, onProgress) {
    const log = logWriter();
    let skipped = 0;
    try {
        for (const [i, visit] of visits.entries()) {
            const entry = logEntry(visit.url, reason, 0);
            const start = Math.floor(visit.visitTime);
            const nearby = await chrome.history.search({
                text: "", startTime: start - 1, endTime: start + 2, maxResults: MAX_RESULTS,
            });
            if (nearby.some((item) => item.url !== visit.url)) {
                skipped++;
            } else {
                await chrome.history.deleteRange({startTime: start, endTime: start + 1});
                entry.time = Date.now();
                await log.add(entry);
            }
            onProgress?.(i + 1, visits.length);
        }
    } finally {
        await log.flush();
    }
    return {deleted: log.count, skipped};
}

export async function bookmarkedUrls() {
    const urls = new Set();
    const walk = (nodes) => {
        for (const node of nodes) {
            if (node.url) {
                urls.add(node.url);
            }
            if (node.children) {
                walk(node.children);
            }
        }
    };
    walk(await chrome.bookmarks.getTree());
    return urls;
}

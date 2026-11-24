// Phase 1 lab (PLAN.md Task 3). Chrome-only; deleted in Task 16.
// Every step uses its own URLs under https://rotten-lab.test/<run>/<step>/
// and counts only those.
import {parseUrl} from "./lib/url.js";

const run = Date.now();
const results = {};
const parserRuns = [];

const WINDOWS = {
    exact: (t) => [t, t],
    rounded: (t) => [Math.floor(t), Math.floor(t) + 1],
    plusMinus1: (t) => [t - 1, t + 1],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (start) => Math.round(performance.now() - start) / 1000;
const prefix = (step) => `https://rotten-lab.test/${run}/${step}/`;

function show(step, value) {
    results[step] = value;
    document.getElementById(step).textContent = JSON.stringify(value, null, 2);
}

async function visitTimes(url) {
    const visits = await chrome.history.getVisits({url});
    return visits.map((v) => v.visitTime).sort((a, b) => a - b);
}

// Step 2: parseUrl against Chrome's URL parser.

function splitParams(query) {
    return query.split("&")
        .filter((piece) => piece !== "")
        .map((piece) => {
            const i = piece.indexOf("=");
            return i < 0 ? [piece, ""] : [piece.slice(0, i), piece.slice(i + 1)];
        });
}

function chromeParse(input) {
    let u;
    try {
        u = new URL(input);
    } catch {
        return null;
    }
    return {
        scheme: u.protocol.slice(0, -1),
        host: u.hostname,
        port: u.port,
        path: u.pathname,
        params: splitParams(u.search.slice(1)),
        fragment: u.hash.slice(1),
    };
}

async function parserCheck() {
    const file = document.getElementById("urls-file").files[0];
    if (!file) {
        throw new Error("pick a urls.json first");
    }
    const list = JSON.parse(await file.text())
        .map((x) => (typeof x === "string" ? x : x.url));
    const mismatches = [];
    const noncanonical = [];
    for (const input of list) {
        let ours;
        try {
            ours = parseUrl(input);
        } catch (e) {
            ours = {threw: String(e)};
        }
        const chrome = chromeParse(input);
        if (JSON.stringify(ours) !== JSON.stringify(chrome)) {
            mismatches.push({input, ours, chrome});
        }
        if (chrome && new URL(input).href !== input) {
            noncanonical.push(input);
        }
    }
    const out = {
        file: file.name,
        urls: list.length,
        mismatches: mismatches.length,
        first20: mismatches.slice(0, 20),
        noncanonical: noncanonical.length,
        noncanonicalFirst5: noncanonical.slice(0, 5),
        pass: mismatches.length === 0,
    };
    parserRuns.push(out);
    return out;
}

// Step 3: can deleteRange remove one visit?
// Plan trials: A, B, A (middle, time t), A at 50 ms spacing.
// Extra trial "sameWindow": B added right after the middle A, no delay,
// to see whether a nearby visit of another URL goes too (DESIGN Build task).

async function singleTrial(name, windowName, bRightAfterMiddle) {
    const a = `${prefix("s3")}${name}/a`;
    const b = `${prefix("s3")}${name}/b`;
    await chrome.history.addUrl({url: a});
    await sleep(50);
    if (!bRightAfterMiddle) {
        await chrome.history.addUrl({url: b});
        await sleep(50);
    }
    await chrome.history.addUrl({url: a});
    if (bRightAfterMiddle) {
        await chrome.history.addUrl({url: b});
    }
    await sleep(50);
    await chrome.history.addUrl({url: a});

    const aBefore = await visitTimes(a);
    const bBefore = await visitTimes(b);
    const t = aBefore[1];
    const [startTime, endTime] = WINDOWS[windowName](t);
    const inRange = await chrome.history.search({text: "", startTime: t - 1, endTime: t + 1, maxResults: 100});
    let error = null;
    try {
        await chrome.history.deleteRange({startTime, endTime});
    } catch (e) {
        error = String(e);
    }
    const aAfter = await visitTimes(a);
    const bAfter = await visitTimes(b);
    const offsets = (times) => times.map((x) => x - t);
    return {
        trial: name,
        window: windowName,
        t,
        range: [startTime, endTime],
        aBeforeOffsets: offsets(aBefore),
        bBeforeOffsets: offsets(bBefore),
        searchTminus1toTplus1: inRange.map((i) => ({url: i.url, lastVisitOffset: i.lastVisitTime - t})),
        error,
        aAfterOffsets: offsets(aAfter),
        bAfterOffsets: offsets(bAfter),
        aLost: aBefore.length - aAfter.length,
        bLost: bBefore.length - bAfter.length,
        aRemains: aAfter.length > 0,
        pass: aBefore.length - aAfter.length === 1 && bBefore.length === bAfter.length && aAfter.length > 0,
    };
}

async function singleVisit() {
    const trials = [];
    for (const windowName of Object.keys(WINDOWS)) {
        trials.push(await singleTrial(windowName, windowName, false));
    }
    trials.push(await singleTrial("sameWindow", "plusMinus1", true));
    const passing = trials.find((x) => x.trial !== "sameWindow" && x.pass);
    if (passing) {
        document.getElementById("window").value = passing.window;
    }
    return {narrowestPassingWindow: passing ? passing.window : null, trials};
}

// Step 4: does search return every URL?

async function searchCap() {
    const p = prefix("s4");
    let start = performance.now();
    for (let i = 0; i < 5000; i++) {
        await chrome.history.addUrl({url: `${p}${i}`});
        if (i % 500 === 0) {
            show("cap", {running: true, added: i});
        }
    }
    const addSeconds = seconds(start);
    start = performance.now();
    const items = await chrome.history.search({text: "", startTime: 0, maxResults: 1000000});
    const searchSeconds = seconds(start);
    const ours = items.filter((i) => i.url.startsWith(p)).length;
    return {added: 5000, returnedTotal: items.length, returnedOurs: ours, addSeconds, searchSeconds, pass: ours === 5000};
}

// Step 5: time getVisits plus one deleteRange per visit except the oldest.

async function bulkTiming() {
    const windowName = document.getElementById("window").value;
    const url = `${prefix("s5")}page`;
    for (let i = 0; i < 3000; i++) {
        await chrome.history.addUrl({url});
        await sleep(3);
        if (i % 500 === 0) {
            show("bulk", {running: true, added: i});
        }
    }
    const start = performance.now();
    const times = await visitTimes(url);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    for (const t of times.slice(1)) {
        const [startTime, endTime] = WINDOWS[windowName](t);
        await chrome.history.deleteRange({startTime, endTime});
    }
    const elapsed = seconds(start);
    const left = await visitTimes(url);
    return {
        window: windowName,
        added: 3000,
        visitsFound: times.length,
        distinctTimes: new Set(times).size,
        minGapMs: gaps.length ? Math.min(...gaps) : null,
        deleteCalls: Math.max(times.length - 1, 0),
        seconds: elapsed,
        visitsLeft: left.length,
        oldestKept: left.length === 1 && left[0] === times[0],
    };
}

// Task 14: 3,000 visits of one URL for the Duplicates page to delete (re-times deleteVisits,
// which adds a search per visit). rotten-dup.test matches no lab rule or auth word.

async function dupSetup() {
    const url = `https://rotten-dup.test/${run}/page`;
    for (let i = 0; i < 3000; i++) {
        await chrome.history.addUrl({url});
        await sleep(3);
        if (i % 500 === 0) {
            show("dups", {running: true, added: i});
        }
    }
    const times = await visitTimes(url);
    return {url, added: 3000, visitsFound: times.length, oldest: times[0]};
}

// Step 6: 200,000 log entries in IndexedDB.

function request(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function openLabDb() {
    const req = indexedDB.open("rotten-lab", 1);
    req.onupgradeneeded = () => {
        const store = req.result.createObjectStore("log", {autoIncrement: true});
        store.createIndex("time", "time");
    };
    return request(req);
}

function writeBatch(db, batch, size) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("log", "readwrite");
        const store = tx.objectStore("log");
        for (let i = 0; i < size; i++) {
            store.add({
                url: `${prefix("s6")}${batch}/${i}/a/typical/length/path/for/a/page?with=some&query=params#and-a-fragment`,
                reason: "duplicate",
                time: Date.now(),
            });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function logCapacity() {
    await request(indexedDB.deleteDatabase("rotten-lab"));
    const before = await navigator.storage.estimate();
    const db = await openLabDb();
    const start = performance.now();
    let written = 0;
    let error = null;
    try {
        for (let batch = 0; batch < 20; batch++) {
            await writeBatch(db, batch, 10000);
            written += 10000;
            show("log", {running: true, written});
        }
    } catch (e) {
        error = String(e);
    }
    const elapsed = seconds(start);
    const count = await request(db.transaction("log").objectStore("log").count());
    db.close();
    const after = await navigator.storage.estimate();
    return {
        written,
        count,
        error,
        seconds: elapsed,
        before: {usage: before.usage, quota: before.quota},
        after: {usage: after.usage, quota: after.quota},
        pass: count === 200000 && error === null,
    };
}

// Wiring.

const STEPS = {parser: parserCheck, single: singleVisit, cap: searchCap, bulk: bulkTiming, log: logCapacity, dups: dupSetup};

for (const button of document.querySelectorAll("button[data-step]")) {
    const step = button.dataset.step;
    button.addEventListener("click", async () => {
        button.disabled = true;
        show(step, {running: true});
        try {
            show(step, await STEPS[step]());
        } catch (e) {
            show(step, {error: String(e)});
        } finally {
            button.disabled = false;
        }
    });
}

document.getElementById("run").textContent = run;
document.getElementById("copy").addEventListener("click", () => {
    navigator.clipboard.writeText(JSON.stringify({run, ...results, parser: parserRuns}, null, 2));
});

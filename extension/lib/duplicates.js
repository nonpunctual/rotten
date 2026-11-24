// Duplicate grouping. Pure logic, shared by the Duplicates page and tests/history-check.js.

import {parseUrl, isWeb} from "./url.js";

// Query parameters that identify the page, keyed by host (without a leading "www.") and path.
// Note (user, 2026-11-24): every other query parameter is dropped, so distinct pages picked by a
// parameter (e.g. help-site articles by ?articleId=) collapse into one page and Delete keeps one.
// If too many such pages get deleted, redo how identifying parameters work.
export const ID_PARAMS = {"youtube.com/watch": "v", "news.ycombinator.com/item": "id"};

// Scheme, host, port, and path; the fragment and every query parameter are dropped,
// except the page's identifying parameter.
export function baseUrl(parsed) {
    const port = parsed.port === "" ? "" : `:${parsed.port}`;
    let base = `${parsed.scheme}://${parsed.host}${port}${parsed.path}`;
    const name = ID_PARAMS[parsed.host.replace(/^www\./, "") + parsed.path];
    const param = name === undefined ? undefined : parsed.params.find(([key]) => key === name);
    if (param) {
        base += `?${param[0]}=${param[1]}`;
    }
    return base;
}

// Web URLs grouped by base URL; visits = sum of visitCount.
export function groupDuplicates(items) {
    const groups = new Map();
    for (const item of items) {
        const parsed = parseUrl(item.url);
        if (!isWeb(parsed)) {
            continue;
        }
        const base = baseUrl(parsed);
        let group = groups.get(base);
        if (!group) {
            group = {host: parsed.host, urls: [], visits: 0};
            groups.set(base, group);
        }
        group.urls.push(item.url);
        group.visits += item.visitCount;
    }
    return groups;
}

// Hosts with duplicates, most first: duplicates = sum of visits - 1 over groups with more than 1 visit.
export function hostSummary(groups) {
    const hosts = new Map();
    for (const group of groups.values()) {
        if (group.visits > 1) {
            hosts.set(group.host, (hosts.get(group.host) ?? 0) + group.visits - 1);
        }
    }
    return [...hosts]
        .map(([host, duplicates]) => ({host, duplicates}))
        .sort((a, b) => b.duplicates - a.duplicates || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}

// One group's visits by URL -> every visit except the single oldest, oldest first, split into
// deletes and skipped. deleteVisits deletes [floor(t), floor(t) + 1], which would also delete the
// kept oldest visit if it fell in that window, and only another URL's visit nearby is detected
// there. So a visit is skipped when the oldest is at or after floor(t) - 1 (the same 1 ms margin
// as deleteVisits' check).
export function planDeletes(visitsByUrl) {
    const visits = [];
    for (const [url, list] of visitsByUrl) {
        for (const visit of list) {
            visits.push({url, visitTime: visit.visitTime});
        }
    }
    visits.sort((a, b) => a.visitTime - b.visitTime);
    const deletes = [];
    const skipped = [];
    for (const visit of visits.slice(1)) {
        (visits[0].visitTime >= Math.floor(visit.visitTime) - 1 ? skipped : deletes).push(visit);
    }
    return {deletes, skipped};
}

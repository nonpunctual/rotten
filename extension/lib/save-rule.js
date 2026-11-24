// Saving rules. A page previews what the rules would delete, the user confirms, and the page asks
// background.js to save them and delete that history there, so closing the page (the popup closes
// on any click outside it) doesn't stop a deletion halfway.
// A rule here is {host, path} (from parseRule) or {words}.

import {formatRule, matchingItems} from "./rules.js";
import {searchAll, deleteUrls} from "./history.js";
import {getRules, saveRules} from "./store.js";

const content = (rule) => (Array.isArray(rule.words) ? {words: [...rule.words]} : {host: rule.host, path: rule.path});

const sameRule = (a, b) => !a.words && !b.words && formatRule(a) === formatRule(b);

export function hasRule(saved, rule) {
    return saved.some((existing) => sameRule(existing, rule));
}

// The saved list after replacing the rule replaceId (keeping its id, flag, and place) or
// appending rules with new ids. A rule already in the list is not added again.
export function mergeRules(saved, rules, replaceId, newId) {
    const out = [...saved];
    const at = replaceId === null ? -1 : out.findIndex((rule) => rule.id === replaceId);
    if (at >= 0) {
        out[at] = {id: out[at].id, builtIn: out[at].builtIn, ...content(rules[0])};
        return out;
    }
    for (const rule of rules) {
        if (!hasRule(out, rule)) {
            out.push({id: newId(), builtIn: false, ...content(rule)});
        }
    }
    return out;
}

// Entries are visits; visitCount is Chrome's per-URL count, so the entry total is approximate.
export function describeItems(items) {
    return `${items.length} pages, about ${items.reduce((n, item) => n + item.visitCount, 0)} entries`;
}

// Existing history the rules would delete.
export async function previewRules(rules) {
    return {rules, items: matchingItems(rules, await searchAll())};
}

// Runs in the page: hands the confirmed preview to background.js. Resolves to the pages deleted.
export async function commitRules(preview, replaceId = null) {
    const reply = await chrome.runtime.sendMessage({
        type: "commitRules",
        rules: preview.rules,
        urls: preview.items.map((item) => item.url),
        replaceId,
    });
    if (!reply || reply.error) {
        throw new Error(reply?.error ?? "no reply from the background page");
    }
    return reply.deleted;
}

// Removing a rule deletes nothing, so it runs in the page.
export async function removeRule(id) {
    await saveRules((await getRules()).filter((rule) => rule.id !== id));
}

// Runs in background.js: saves against the rules in storage now, then deletes the previewed URLs.
export async function applyRules({rules, urls, replaceId}) {
    await saveRules(mergeRules(await getRules(), rules, replaceId, () => crypto.randomUUID()));
    return deleteUrls(urls, "rule");
}

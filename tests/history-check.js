// Run by tests/history-check.sh: what Rotten's rules and bookmarks would delete from a copy of
// real history. Same order as background.js: non-web left alone, then first matching rule,
// else exact bookmark URL. Prints to the terminal only.

import {parseUrl, isWeb} from "../extension/lib/url.js";
import {parseRule, formatRule, firstMatch, defaultRules} from "../extension/lib/rules.js";

const [urlsPath, bookmarksPath, personalPath] = arguments;
const items = JSON.parse(readFile(urlsPath));
const bookmarks = new Set(readFile(bookmarksPath).split("\n").filter((line) => line !== ""));

const rules = defaultRules();
if (personalPath) {
    for (const line of readFile(personalPath).split("\n")) {
        if (line.trim() === "") {
            continue;
        }
        const parsed = parseRule(line);
        if (parsed) {
            rules.push({id: `personal:${formatRule(parsed)}`, builtIn: false, ...parsed});
        } else {
            print(`invalid rule line: ${line}`);
        }
    }
}

const label = (rule) => (rule.words ? `auth words (${rule.words.join(" ")})` : formatRule(rule));
const sum = (list, key) => list.reduce((n, item) => n + item[key], 0);
const counts = (list) => `${list.length} urls, ${sum(list, "visits")} visits`;
const short = (url) => (url.length > 120 ? `${url.slice(0, 117)}...` : url);

const byRule = new Map(rules.map((rule) => [rule, []]));
const bookmarked = [];
const left = [];
// Hidden rows and rows with no visits are counted apart: the lab's history.search did not
// return a hidden URL, and bookmark events delete only URLs with visits.
const unseen = [];
for (const item of items) {
    if (item.hidden === 1 || item.rows === 0) {
        unseen.push(item);
        continue;
    }
    const parsed = parseUrl(item.url);
    const rule = isWeb(parsed) ? firstMatch(rules, parsed) : null;
    if (rule) {
        byRule.get(rule).push(item);
    } else if (isWeb(parsed) && bookmarks.has(item.url)) {
        bookmarked.push(item);
    } else {
        left.push(item);
    }
}

print(`total: ${counts(items)} (${sum(items, "rows")} visit rows)`);
print(`not visible to search (hidden or no visits), left out below: ${counts(unseen)}`);
print(`bookmarks in file: ${bookmarks.size}`);
print("");
print("deleted per rule:");
for (const [rule, list] of byRule) {
    print(`  ${label(rule)}: ${counts(list)}`);
}
const ruled = [...byRule.values()].flat();
print(`deleted by rules: ${counts(ruled)}`);
print(`deleted as bookmarks: ${counts(bookmarked)}`);
print(`left: ${counts(left)}`);

print("");
print("top 25 hosts left (visits):");
const hosts = new Map();
for (const item of left) {
    const parsed = parseUrl(item.url);
    const host = !parsed ? "(unparsed)" : isWeb(parsed) ? parsed.host : `${parsed.scheme}://${parsed.host}`;
    hosts.set(host, (hosts.get(host) ?? 0) + item.visits);
}
const topHosts = [...hosts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 25);
for (const [host, visits] of topHosts) {
    print(`  ${String(visits).padStart(6)}  ${host}`);
}

print("");
print("top 10 pages deleted per rule (visits):");
for (const [rule, list] of byRule) {
    if (list.length === 0) {
        continue;
    }
    print(`  ${label(rule)}`);
    const top = [...list].sort((a, b) => b.visits - a.visits || a.url.localeCompare(b.url)).slice(0, 10);
    for (const item of top) {
        print(`    ${String(item.visits).padStart(6)}  ${short(item.url)}`);
    }
}

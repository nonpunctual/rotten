import {parseUrl, isWeb} from "./lib/url.js";
import {matchingItems} from "./lib/rules.js";
import {getRules, setFirstRunDone} from "./lib/store.js";
import {searchAll, deleteUrls, bookmarkedUrls} from "./lib/history.js";

const status = document.getElementById("status");
const button = document.getElementById("delete");
const counts = document.getElementById("counts");

// Entries are visits; visitCount is Chrome's per-URL count, so the totals are approximate.
const describe = (items) => `${items.length} pages, about ${items.reduce((n, item) => n + item.visitCount, 0)} entries`;

const [items, rules, bookmarks] = await Promise.all([searchAll(), getRules(), bookmarkedUrls()]);
const ruleItems = matchingItems(rules, items);
const ruled = new Set(ruleItems.map((item) => item.url));
// A URL matched by a rule and also bookmarked is deleted once, as a rule (same order as background.js).
const bookmarkItems = items.filter((item) => !ruled.has(item.url) && bookmarks.has(item.url) && isWeb(parseUrl(item.url)));

for (const [name, list] of [["Built-in rules", ruleItems], ["Bookmarks", bookmarkItems]]) {
    const li = document.createElement("li");
    li.textContent = `${name}: ${describe(list)}`;
    counts.append(li);
}

if (ruleItems.length + bookmarkItems.length === 0) {
    await setFirstRunDone();
    status.textContent = "Nothing to delete.";
} else {
    status.textContent = "";
    button.hidden = false;
    button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "Deleting...";
        const byRule = await deleteUrls(ruleItems.map((item) => item.url), "rule");
        const byBookmark = await deleteUrls(bookmarkItems.map((item) => item.url), "bookmark");
        await setFirstRunDone();
        status.textContent = `Deleted ${byRule + byBookmark} pages.`;
    });
}

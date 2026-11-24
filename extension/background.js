import {parseUrl, isWeb} from "./lib/url.js";
import {defaultRules, firstMatch} from "./lib/rules.js";
import {getRules, saveRules} from "./lib/store.js";
import {deleteUrls} from "./lib/history.js";
import {applyRules} from "./lib/save-rule.js";

// Listeners are registered at top level so Chrome can wake the worker for them.
// Rules are read from storage in each handler; a restarted worker has no module state.

const OWN_PAGES = chrome.runtime.getURL("");

chrome.runtime.onInstalled.addListener(async ({reason}) => {
    if (reason !== "install") {
        return;
    }
    await saveRules(defaultRules());
    await chrome.tabs.create({url: chrome.runtime.getURL("firstrun.html")});
});

async function isBookmarked(url) {
    const nodes = await chrome.bookmarks.search({url});
    return nodes.some((node) => node.url === url);
}

chrome.history.onVisited.addListener(async ({url}) => {
    if (url.startsWith(OWN_PAGES)) {
        await chrome.history.deleteUrl({url});
        return;
    }
    const parsed = parseUrl(url);
    if (!isWeb(parsed)) {
        return;
    }
    if (firstMatch(await getRules(), parsed)) {
        await deleteUrls([url], "rule");
    } else if (await isBookmarked(url)) {
        await deleteUrls([url], "bookmark");
    }
});

// A new or changed bookmark deletes its URL's history, if it has any.
async function onBookmark(url) {
    if (!url || !isWeb(parseUrl(url))) {
        return;
    }
    const visits = await chrome.history.getVisits({url});
    if (visits.length > 0) {
        await deleteUrls([url], "bookmark");
    }
}

chrome.bookmarks.onCreated.addListener((id, node) => onBookmark(node.url));
chrome.bookmarks.onChanged.addListener((id, changeInfo) => onBookmark(changeInfo.url));

// Rule saves from Rotten's pages run here, so closing the page (the popup closes on any outside
// click) doesn't stop the deletion. sendResponse is called after the async work, so return true.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "commitRules") {
        return false;
    }
    applyRules(message).then(
        (deleted) => sendResponse({deleted}),
        (error) => sendResponse({error: String(error)}),
    );
    return true;
});

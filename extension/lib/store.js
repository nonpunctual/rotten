// Settings in chrome.storage.local: keys "rules" and "firstRunDone".

export async function getRules() {
    const {rules} = await chrome.storage.local.get("rules");
    return rules ?? [];
}

export function saveRules(rules) {
    return chrome.storage.local.set({rules});
}

export async function getFirstRunDone() {
    const {firstRunDone} = await chrome.storage.local.get("firstRunDone");
    return firstRunDone === true;
}

export function setFirstRunDone() {
    return chrome.storage.local.set({firstRunDone: true});
}

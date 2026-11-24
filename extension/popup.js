import {parseRule, formatRule, ruleFromUrl} from "./lib/rules.js";
import {previewRules, commitRules, describeItems, hasRule} from "./lib/save-rule.js";
import {getRules} from "./lib/store.js";

const form = document.getElementById("form");
const field = document.getElementById("rule");
const save = document.getElementById("save");
const confirmBox = document.getElementById("confirm");
const preview = document.getElementById("preview");
const yes = document.getElementById("yes");
const no = document.getElementById("no");
const status = document.getElementById("status");

let pending = null;

function setEditing(on) {
    field.disabled = !on;
    save.disabled = !on;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rule = parseRule(field.value);
    if (!rule) {
        status.textContent = "Not a valid rule.";
        return;
    }
    setEditing(false);
    status.textContent = "Counting...";
    try {
        if (hasRule(await getRules(), rule)) {
            status.textContent = `${formatRule(rule)} is already a rule.`;
            setEditing(true);
            return;
        }
        pending = await previewRules([rule]);
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
        setEditing(true);
        return;
    }
    preview.textContent = `Deletes ${describeItems(pending.items)}.`;
    status.textContent = "";
    yes.disabled = false;
    no.disabled = false;
    confirmBox.hidden = false;
});

yes.addEventListener("click", async () => {
    yes.disabled = true;
    no.disabled = true;
    status.textContent = "Deleting...";
    try {
        const deleted = await commitRules(pending);
        confirmBox.hidden = true;
        status.textContent = `Saved. Deleted ${deleted} pages.`;
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
        no.disabled = false;
    }
});

no.addEventListener("click", () => {
    pending = null;
    confirmBox.hidden = true;
    status.textContent = "";
    setEditing(true);
});

for (const link of document.querySelectorAll("nav a")) {
    link.addEventListener("click", async (event) => {
        event.preventDefault();
        await chrome.tabs.create({url: chrome.runtime.getURL(link.getAttribute("href"))});
        window.close();
    });
}

const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
field.value = ruleFromUrl(tab?.url ?? "");
field.focus();

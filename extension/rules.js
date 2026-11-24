import {parseRule, formatRule, parseRuleList, parseWords} from "./lib/rules.js";
import {previewRules, commitRules, describeItems, hasRule, removeRule} from "./lib/save-rule.js";
import {getRules} from "./lib/store.js";

const $ = (id) => document.getElementById(id);
const status = $("status");
const dialog = $("confirm");

const label = (rule) => (rule.words ? "the auth words" : formatRule(rule));

// Resolves true when the user clicks the OK button; Cancel and Escape resolve false.
function ask(text, ok) {
    $("confirm-text").textContent = text;
    $("confirm-ok").textContent = ok;
    dialog.returnValue = "";
    dialog.showModal();
    return new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), {once: true});
    });
}

// Preview, confirm, then save and delete in background.js. Resolves to the pages deleted, or null if cancelled.
async function save(rules, what, replaceId = null) {
    status.textContent = "Counting...";
    const preview = await previewRules(rules);
    status.textContent = "";
    if (!(await ask(`Save ${what}? Deletes ${describeItems(preview.items)}.`, "Save"))) {
        return null;
    }
    status.textContent = "Deleting...";
    return commitRules(preview, replaceId);
}

// One action at a time; errors go to the status line.
let busy = false;
async function run(action) {
    if (busy) {
        return;
    }
    busy = true;
    try {
        await action();
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
    } finally {
        busy = false;
    }
}

async function edit(rule, text) {
    let next;
    if (rule.words) {
        next = {words: parseWords(text)};
        if (next.words.length === 0) {
            status.textContent = "No words. To stop matching words, remove the row.";
            return;
        }
        if (next.words.join(" ") === rule.words.join(" ")) {
            status.textContent = "No change.";
            return;
        }
    } else {
        next = parseRule(text);
        if (!next) {
            status.textContent = `Not a valid rule: ${text.trim()}`;
            return;
        }
        if (formatRule(next) === formatRule(rule)) {
            status.textContent = "No change.";
            return;
        }
        const others = (await getRules()).filter((r) => r.id !== rule.id);
        if (hasRule(others, next)) {
            status.textContent = `${formatRule(next)} is already a rule.`;
            return;
        }
    }
    const deleted = await save([next], label(next), rule.id);
    if (deleted !== null) {
        status.textContent = `Saved ${label(next)}. Deleted ${deleted} pages.`;
    }
    await render();
}

async function remove(rule) {
    const note = rule.words ? " The word list can't be added back." : "";
    if (!(await ask(`Remove ${label(rule)}? Its later visits stay in history.${note}`, "Remove"))) {
        return;
    }
    await removeRule(rule.id);
    status.textContent = `Removed ${label(rule)}.`;
    await render();
}

function cell(...children) {
    const td = document.createElement("td");
    td.append(...children);
    return td;
}

function button(text, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
}

function row(rule) {
    const input = document.createElement("input");
    input.value = rule.words ? rule.words.join(" ") : formatRule(rule);
    input.spellcheck = false;
    input.autocomplete = "off";
    const doSave = () => run(() => edit(rule, input.value));
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            doSave();
        }
    });
    const kind = [rule.builtIn ? "built-in" : "", rule.words ? "auth words" : ""].filter((s) => s !== "").join(", ");
    const tr = document.createElement("tr");
    tr.append(cell(input), cell(kind), cell(button("Save", doSave)), cell(button("Remove", () => run(() => remove(rule)))));
    return tr;
}

async function render() {
    $("rules").replaceChildren(...(await getRules()).map(row));
}

function showInvalid(lines) {
    const box = $("invalid");
    box.replaceChildren();
    if (lines.length === 0) {
        return;
    }
    const p = document.createElement("p");
    p.textContent = `Not saved, not valid rules (${lines.length}):`;
    const ul = document.createElement("ul");
    for (const line of lines) {
        const li = document.createElement("li");
        li.textContent = line;
        ul.append(li);
    }
    box.append(p, ul);
}

$("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
        const text = $("add").value;
        const rule = parseRule(text);
        if (!rule) {
            status.textContent = text.trim() === "" ? "Type a rule." : `Not a valid rule: ${text.trim()}`;
            return;
        }
        if (hasRule(await getRules(), rule)) {
            status.textContent = `${formatRule(rule)} is already a rule.`;
            return;
        }
        const deleted = await save([rule], formatRule(rule));
        if (deleted !== null) {
            status.textContent = `Saved ${formatRule(rule)}. Deleted ${deleted} pages.`;
            $("add").value = "";
            await render();
        }
    });
});

$("paste-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
        const {rules, invalid} = parseRuleList($("paste").value);
        showInvalid(invalid);
        const saved = await getRules();
        const fresh = rules.filter((rule) => !hasRule(saved, rule));
        const already = rules.length - fresh.length;
        const note = already > 0 ? ` ${already} already saved.` : "";
        if (fresh.length === 0) {
            status.textContent = `No new rules to save.${note}`;
            return;
        }
        const deleted = await save(fresh, `${fresh.length} rules`);
        if (deleted !== null) {
            status.textContent = `Saved ${fresh.length} rules. Deleted ${deleted} pages.${note}`;
            $("paste").value = invalid.join("\n");
            await render();
        }
    });
});

const add = new URLSearchParams(location.search).get("add");
if (add) {
    $("add").value = add;
    $("add").focus();
}
await render();

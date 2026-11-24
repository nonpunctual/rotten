import {eq} from "./assert.js";
import {mergeRules, describeItems, hasRule} from "../extension/lib/save-rule.js";

let n = 0;
const newId = () => `new${++n}`;
const saved = [
    {id: "builtin:x.com", builtIn: true, host: "x.com", path: ""},
    {id: "builtin:auth", builtIn: true, words: ["login"]},
];
eq(mergeRules(saved, [{host: "y.com", path: "/a"}], null, newId),
    [...saved, {id: "new1", builtIn: false, host: "y.com", path: "/a"}], "append with a new id");
eq(mergeRules(saved, [{host: "x.com", path: ""}, {host: "z.com", path: ""}, {host: "z.com", path: ""}], null, newId),
    [...saved, {id: "new2", builtIn: false, host: "z.com", path: ""}], "skip rules already saved");
eq(mergeRules(saved, [{host: "x.com", path: "/b"}], "builtin:x.com", newId),
    [{id: "builtin:x.com", builtIn: true, host: "x.com", path: "/b"}, saved[1]], "replace keeps id, flag, and place");
eq(mergeRules(saved, [{words: ["login", "signup"]}], "builtin:auth", newId),
    [saved[0], {id: "builtin:auth", builtIn: true, words: ["login", "signup"]}], "replace auth words");
eq(mergeRules(saved, [{host: "q.com", path: ""}], "gone", newId),
    [...saved, {id: "new3", builtIn: false, host: "q.com", path: ""}], "replacing a removed rule appends it");
eq(mergeRules(saved, [{id: "evil", builtIn: true, host: "q.com", path: "", extra: 1}], null, newId).at(-1),
    {id: "new4", builtIn: false, host: "q.com", path: ""}, "only rule content is kept");
eq(saved.length === 2 && saved[0].path === "" && saved[1].words.length === 1, true, "saved list not changed");
eq(describeItems([{visitCount: 3}, {visitCount: 1}]), "2 pages, about 4 entries", "describe");
eq(describeItems([]), "0 pages, about 0 entries", "describe none");
eq(hasRule(saved, {host: "x.com", path: ""}), true, "has rule");
eq(hasRule(saved, {host: "x.com", path: "/"}), false, "homepage is another rule");
eq(hasRule(saved, {words: ["login"]}), false, "word lists are never the same rule");

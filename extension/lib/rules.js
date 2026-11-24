import {parseUrl, decodePath, isWeb} from "./url.js";
import {BUILT_IN_RULES, AUTH_WORDS} from "./builtins.js";

const RULE_RE = /^([^/?]*)(\/[^?]*)?(\?.*)?$/;
const HOST_RE = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const SEGMENT_RE = /^[^\s#*]*$/;
const PARAM_RE = /^[^\s=&?#/]+$/;

// A rule line, written like a URL without the scheme, to {host, path}.
// path is "" (whole host), "/" (homepage), or "/a/*/b", optionally followed by "?name".
export function parseRule(line) {
    if (typeof line !== "string") {
        return null;
    }
    const text = line.trim().toLowerCase().replace(/^https?:\/\//, "");
    if (text === "") {
        return null;
    }
    const m = RULE_RE.exec(text);
    const host = m[1];
    if (!HOST_RE.test(host)) {
        return null;
    }
    let path = m[2] ?? "";
    if (path !== "") {
        path = path.replace(/\/+$/, "") || "/";
        const segments = path.split("/").slice(1);
        if (!segments.every((s) => s === "*" || SEGMENT_RE.test(s))) {
            return null;
        }
    }
    if (m[3] !== undefined) {
        const name = m[3].slice(1);
        if (!PARAM_RE.test(name)) {
            return null;
        }
        path += `?${name}`;
    }
    return {host, path};
}

export function formatRule(rule) {
    return rule.host + rule.path;
}

// Rule text for a page: host (no port) and path, without trailing slashes, so a root page means
// the whole host. "" for non-web URLs. Pages no rule can express (e.g. an IPv6 host) still get
// their text, so saving reports it invalid.
export function ruleFromUrl(url) {
    const parsed = parseUrl(url);
    if (!isWeb(parsed)) {
        return "";
    }
    return parsed.host + parsed.path.replace(/\/+$/, "");
}

// A pasted list, one rule per line. Blank lines are skipped, repeats dropped,
// and lines that don't parse are returned trimmed in invalid.
export function parseRuleList(text) {
    const rules = [];
    const invalid = [];
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
        if (line.trim() === "") {
            continue;
        }
        const rule = parseRule(line);
        if (!rule) {
            invalid.push(line.trim());
        } else if (!seen.has(formatRule(rule))) {
            seen.add(formatRule(rule));
            rules.push(rule);
        }
    }
    return {rules, invalid};
}

// The auth words row: words separated by whitespace, lowercased, repeats dropped.
export function parseWords(text) {
    return [...new Set(text.toLowerCase().split(/\s+/).filter((word) => word !== ""))];
}

function matchHost(pattern, host) {
    if (pattern.startsWith("*.")) {
        const base = pattern.slice(2);
        return host === base || host.endsWith(`.${base}`);
    }
    return host === pattern;
}

function matchPath(rulePath, parsed) {
    const q = rulePath.indexOf("?");
    const pathPart = q < 0 ? rulePath : rulePath.slice(0, q);
    if (q >= 0) {
        const name = rulePath.slice(q + 1);
        if (!parsed.params.some(([n]) => n.toLowerCase() === name)) {
            return false;
        }
    }
    if (pathPart === "") {
        return true;
    }
    const urlPath = decodePath(parsed.path).toLowerCase();
    if (pathPart === "/") {
        return urlPath === "/" || urlPath === "";
    }
    const ruleSegments = decodePath(pathPart).toLowerCase().split("/").slice(1);
    const urlSegments = urlPath.split("/").slice(1);
    if (urlSegments.length < ruleSegments.length) {
        return false;
    }
    return ruleSegments.every((s, i) => s === "*" || s === urlSegments[i]);
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word match in the host or the decoded path, as grep -w defines a word:
// letters (any script), digits, and _ are word characters; anything else is a boundary.
function matchWords(words, parsed) {
    const list = words
        .filter((w) => typeof w === "string" && w.trim() !== "")
        .map((w) => escapeRegExp(w.trim().toLowerCase()));
    if (list.length === 0) {
        return false;
    }
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${list.join("|")})(?![\\p{L}\\p{N}_])`, "u");
    return re.test(parsed.host) || re.test(decodePath(parsed.path).toLowerCase());
}

export function matchRule(rule, parsed) {
    if (!rule || !isWeb(parsed)) {
        return false;
    }
    if (Array.isArray(rule.words)) {
        return matchWords(rule.words, parsed);
    }
    return matchHost(rule.host, parsed.host) && matchPath(rule.path, parsed);
}

export function firstMatch(rules, parsed) {
    return rules.find((rule) => matchRule(rule, parsed)) ?? null;
}

export function matchingItems(rules, items) {
    return items.filter((item) => firstMatch(rules, parseUrl(item.url)) !== null);
}

export function defaultRules() {
    return [
        ...BUILT_IN_RULES.map((text) => ({id: `builtin:${text}`, builtIn: true, ...parseRule(text)})),
        {id: "builtin:auth", builtIn: true, words: [...AUTH_WORDS]},
    ];
}

import {eq} from "./assert.js";
import {parseUrl, isWeb} from "../extension/lib/url.js";
import {parseRule, formatRule, matchRule, firstMatch, matchingItems, defaultRules, ruleFromUrl, parseRuleList, parseWords} from "../extension/lib/rules.js";
import {BUILT_IN_RULES, AUTH_WORDS} from "../extension/lib/builtins.js";

const r = (t) => ({id: t, builtIn: false, ...parseRule(t)});
const p = parseUrl;
eq(matchRule(r("github.com/search"), p("https://github.com/search?q=x")), true, "segment prefix");
eq(matchRule(r("github.com/search"), p("https://github.com/searchx")), false, "whole segment");
eq(matchRule(r("github.com/*/*/edit"), p("https://github.com/o/r/edit/main/a")), true, "star");
eq(matchRule(r("github.com/*/*/edit"), p("https://github.com/o/r/blob/x")), false, "star miss");
eq(matchRule(r("drive.google.com/"), p("https://drive.google.com/")), true, "homepage");
eq(matchRule(r("drive.google.com/"), p("https://drive.google.com/file/d/1")), false, "homepage only");
eq(matchRule(r("duckduckgo.com/?q"), p("https://duckduckgo.com/?q=a")), true, "param");
eq(matchRule(r("duckduckgo.com/?q"), p("https://duckduckgo.com/")), false, "param missing");
eq(matchRule(r("*.linkedin.com"), p("https://linkedin.com/feed")), true, "wildcard bare");
eq(matchRule(r("*.linkedin.com"), p("https://www.linkedin.com/in/x")), true, "wildcard sub");
eq(matchRule(r("*.linkedin.com"), p("https://notlinkedin.com/")), false, "wildcard boundary");
eq(matchRule(r("x.com/Login"), p("https://X.com/LOGIN/a")), true, "case-insensitive");
eq(matchRule(r("x.com/sign-in"), p("https://x.com/sign%2Din")), true, "decoded path");
eq(matchRule(r("localhost"), p("http://localhost:3000/a")), true, "port ignored");
eq(matchRule(r("x.com"), null), false, "null never matches");
const auth = defaultRules().find((x) => x.words);
eq(matchRule(auth, p("https://sso.example.com/")), true, "auth host");
eq(matchRule(auth, p("https://x.com/oauth2/authorize")), true, "auth path");
eq(matchRule(auth, p("https://x.com/logout")), true, "logout");
eq(matchRule(auth, p("https://x.com/authentication")), false, "whole word only");
eq(matchRule(auth, p("https://x.com/?next=login")), false, "query ignored");
eq(parseRule("https://GitHub.com/search/"), {host: "github.com", path: "/search"}, "clean");
eq(parseRule("example.com/"), {host: "example.com", path: "/"}, "homepage kept");
eq(parseRule("   "), null, "blank");
eq(parseRule("not a host!"), null, "invalid");
eq(formatRule(parseRule("duckduckgo.com/?q")), "duckduckgo.com/?q", "round trip");
eq(defaultRules().length, BUILT_IN_RULES.length + 1, "built-ins plus auth");

// Beyond the plan's list: guards against rules that match everything, and odd input.
eq(parseRule("x.com"), {host: "x.com", path: ""}, "bare host has empty path");
eq(parseRule("*"), null, "bare star host");
eq(parseRule("*."), null, "empty wildcard host");
eq(parseRule("x.*.com"), null, "star inside host");
eq(parseRule("x.com:3000"), null, "port rejected");
eq(parseRule("x.com/a?q=1"), null, "param value rejected");
eq(parseRule("x.com/a?q&r"), null, "two params rejected");
eq(parseRule("x.com/a?"), null, "empty param rejected");
eq(parseRule("x.com/a#frag"), null, "fragment rejected");
eq(parseRule("x.com/a*"), null, "star inside segment");
eq(parseRule("x.com/a b"), null, "space in path");
eq(parseRule("ftp://x.com/a"), null, "non-web scheme");
eq(parseRule(undefined), null, "non-string");
eq(parseRule("x.com?q"), {host: "x.com", path: "?q"}, "host-wide param");
eq(parseRule("X.com/A/"), {host: "x.com", path: "/a"}, "lowercased, trailing slash dropped");
eq(matchRule(r("x.com?q"), p("https://x.com/a/b?q=1")), true, "host-wide param match");
eq(matchRule(r("x.com/a?q"), p("https://x.com/a/b?Q")), true, "param name case-insensitive");
eq(matchRule(r("x.com/a?q"), p("https://x.com/a/b?qq=1")), false, "param name exact");
eq(matchRule(r("x.com"), p("ftp://x.com/")), false, "non-web never matches");
eq(matchRule(r("x.com/"), p("https://x.com")), true, "homepage, empty path");
eq(matchRule(r("x.com/a"), p("https://x.com/a/")), true, "trailing slash in url");
eq(matchRule({id: "w", builtIn: false, words: []}, p("https://x.com/")), false, "empty word list");
eq(matchRule({id: "w", builtIn: false, words: [""]}, p("https://x.com/")), false, "blank word");
eq(matchRule({id: "w", builtIn: false, words: ["a.b"]}, p("https://x.com/axb")), false, "words escaped");
// Whole words as grep -w defines them: letters, digits, and _ are word characters.
eq(matchRule(auth, p("https://x.com/user_login")), false, "underscore is a word character");
eq(matchRule(auth, p("https://x.com/admin/app/macos_platform_sso/instance/1/")), false, "sso inside an app name");
eq(matchRule(auth, p("https://x.com/login2")), false, "digit is a word character");
eq(matchRule(auth, p("https://x.com/%C3%A9login")), false, "accented letter is a word character");
eq(matchRule(auth, p("https://x.com/%C3%A9/login")), true, "slash after accented letter is a boundary");
eq(matchRule(auth, p("https://x.com/a.sso-b")), true, "dot and hyphen are boundaries");
eq(matchRule(auth, p("https://x.com/oauth2/token")), true, "oauth2 is its own word");
eq(matchRule({id: "w", builtIn: false, words: ["oauth"]}, p("https://x.com/oauth2/token")), false, "oauth alone misses oauth2");
eq(matchRule(auth, p("https://x.com/sign-in")), true, "hyphenated word");
eq(matchRule(auth, p("https://x.com/LOGIN")), true, "auth case-insensitive");
eq(matchRule(auth, p("https://x.com/log%69n")), true, "auth on decoded path");
eq(matchRule(auth, null), false, "auth null");
eq(auth.words === AUTH_WORDS, false, "auth rule copies the word list");
eq(BUILT_IN_RULES.every((t) => parseRule(t) !== null && formatRule(parseRule(t)) === t), true, "built-ins parse and round trip");
eq(defaultRules().every((x) => x.builtIn === true && x.id.startsWith("builtin:")), true, "default ids and flag");
eq(defaultRules()[0], {id: "builtin:idmsa.apple.com", builtIn: true, host: "idmsa.apple.com", path: ""}, "default rule shape");
eq(defaultRules().at(-1).id, "builtin:auth", "auth rule id");
const rules = [r("x.com/a"), r("x.com")];
eq(firstMatch(rules, p("https://x.com/a/b")).id, "x.com/a", "first match in order");
eq(firstMatch(rules, p("https://y.com/")), null, "no match");
eq(firstMatch(rules, null), null, "first match null");
eq(matchingItems(rules, [{url: "https://x.com/z"}, {url: "https://y.com/"}, {url: "chrome://x.com/"}]),
    [{url: "https://x.com/z"}], "matching items");

// Task 9: rule text helpers.
eq(ruleFromUrl("https://www.linkedin.com/feed/"), "www.linkedin.com/feed", "toolbar prefill");
eq(ruleFromUrl("https://example.com/"), "example.com", "root page means whole host");
eq(ruleFromUrl("chrome://history/"), "", "non-web");
eq(parseRuleList("github.com/search\n\n https://X.com/a/ \nbad host!"),
    {rules: [{host: "github.com", path: "/search"}, {host: "x.com", path: "/a"}],
        invalid: ["bad host!"]}, "paste");

// Beyond the plan's list.
eq(ruleFromUrl("http://localhost:3000/a"), "localhost/a", "prefill drops the port");
eq(ruleFromUrl("https://x.com/a?q=1#f"), "x.com/a", "prefill drops query and fragment");
eq(ruleFromUrl("not a url"), "", "prefill garbage");
eq(ruleFromUrl("http://[::1]:8080/a"), "[::1]/a", "prefill an ipv6 host as text");
const roundTripMisses = JSON.parse(readFile("tests/fixtures/urls.json")).filter((url) => {
    if (!isWeb(p(url))) {
        return false;
    }
    const rule = parseRule(ruleFromUrl(url));
    return !rule || !matchRule({id: "t", builtIn: false, ...rule}, p(url));
});
eq(roundTripMisses, ["http://[::1]/", "http://[::1]:8080/a", "http://[2001:db8::1]/", "https://example.com./"],
    "prefill round trip over fixtures");
eq(parseRuleList("x.com/a\r\ny.com\r\n"), {rules: [{host: "x.com", path: "/a"}, {host: "y.com", path: ""}], invalid: []}, "paste crlf");
eq(parseRuleList("x.com\nhttps://X.com\nx.com/"), {rules: [{host: "x.com", path: ""}, {host: "x.com", path: "/"}], invalid: []}, "paste drops repeats");
eq(parseRuleList(""), {rules: [], invalid: []}, "paste empty");

// Task 11: the auth words row.
eq(parseWords(" Login  logout\nSSO login "), ["login", "logout", "sso"], "words lowercased, repeats dropped");
eq(parseWords("   "), [], "no words");

// Built-in duckduckgo.com/y.js (the user's decision, 2026-11-24): DuckDuckGo ad clicks.
eq(firstMatch(defaultRules(), p("https://duckduckgo.com/y.js?ad_domain=x.com&ad_provider=b&ad_type=t&u3=https%3A%2F%2Fx.com"))?.id,
    "builtin:duckduckgo.com/y.js", "built-in ddg ad click");
eq(firstMatch(defaultRules(), p("https://duckduckgo.com/about")), null, "other ddg pages stay");

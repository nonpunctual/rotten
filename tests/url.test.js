import {eq} from "./assert.js";
import {parseUrl, decodePath, isWeb} from "../extension/lib/url.js";

eq(parseUrl("https://WWW.Example.com:8443/A/b?x=1&y#frag"),
    {scheme: "https", host: "www.example.com", port: "8443", path: "/A/b",
        params: [["x", "1"], ["y", ""]], fragment: "frag"}, "full");
eq(parseUrl("https://example.com").path, "/", "empty path is /");
eq(parseUrl("https://x.com:443/").port, "", "default https port dropped");
eq(parseUrl("http://x.com:80/").port, "", "default http port dropped");
eq(parseUrl("http://127.0.0.1:3000/a").host, "127.0.0.1", "ip host");
eq(parseUrl("chrome://history/").scheme, "chrome", "chrome scheme");
eq(parseUrl("not a url"), null, "garbage");
eq(isWeb(parseUrl("about:blank")), false, "about is not web");
eq(decodePath("/sign%2Din"), "/sign-in", "decode");
eq(decodePath("/bad%E0%A4%A"), "/bad%E0%A4%A", "bad escape kept");

eq(parseUrl(undefined), null, "non-string is null");
eq(isWeb(null), false, "null is not web");
eq(isWeb(parseUrl("https://x.com/")), true, "https is web");
eq(parseUrl("https://u:p@x.com/a").host, "x.com", "userinfo dropped");
eq(parseUrl("http://[::1]:8080/a").host, "[::1]", "ipv6 host");
eq(parseUrl("http://[::1]:8080/a").port, "8080", "ipv6 port");
eq(parseUrl("http://x.com:abc/"), null, "bad port");
eq(parseUrl("http://"), null, "empty host");
eq(parseUrl("https://x.com/?a&&b=").params, [["a", ""], ["b", ""]], "empty pieces skipped");

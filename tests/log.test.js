import {eq} from "./assert.js";
import {logEntry} from "../extension/lib/log.js";

const throws = (fn) => {
    try {
        fn();
    } catch {
        return true;
    }
    return false;
};

eq(logEntry("https://a.com/", "rule", 5), {url: "https://a.com/", reason: "rule", time: 5}, "entry");
eq(throws(() => logEntry("https://a.com/", "nope", 5)), true, "bad reason throws");
eq(["duplicate", "rule", "bookmark"].map((reason) => logEntry("u", reason, 1).reason),
    ["duplicate", "rule", "bookmark"], "all three reasons");
eq(throws(() => logEntry("https://a.com/", undefined, 5)), true, "missing reason throws");

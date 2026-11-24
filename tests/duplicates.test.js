import {eq} from "./assert.js";
import {parseUrl} from "../extension/lib/url.js";
import {ID_PARAMS, baseUrl, groupDuplicates, hostSummary, planDeletes} from "../extension/lib/duplicates.js";

const b = (u) => baseUrl(parseUrl(u));
eq(b("https://x.com/a?sort=1#top"), "https://x.com/a", "query and fragment dropped");
eq(b("https://x.com/a#a") === b("https://x.com/a#b"), true, "fragment variants are duplicates");
eq(b("https://www.youtube.com/watch?v=abc&t=42s"), "https://www.youtube.com/watch?v=abc", "keep v");
eq(b("https://www.youtube.com/watch?v=a") === b("https://www.youtube.com/watch?v=b"), false, "videos differ");
eq(b("https://news.ycombinator.com/item?id=1&p=2"), "https://news.ycombinator.com/item?id=1", "keep id");
eq(b("http://localhost:3000/a"), "http://localhost:3000/a", "port kept");
const plan = planDeletes(new Map([
    ["https://x.com/a?v=2", [{visitTime: 5}, {visitTime: 9}]],
    ["https://x.com/a", [{visitTime: 7}, {visitTime: 1}]],
]));
eq(plan.deletes.map((v) => v.visitTime), [5, 7, 9], "oldest kept even on another variant");
eq(hostSummary(groupDuplicates([
    {url: "https://x.com/a", visitCount: 3},
    {url: "https://x.com/a?s=1", visitCount: 2},
    {url: "https://y.com/", visitCount: 1},
])), [{host: "x.com", duplicates: 4}], "summary");

// Beyond the plan's tests.
eq(Object.keys(ID_PARAMS), ["youtube.com/watch", "news.ycombinator.com/item"], "id params");
eq(b("https://youtube.com/watch?t=1&v=c"), "https://youtube.com/watch?v=c", "bare host keeps v");
eq(b("https://www.youtube.com/watch?t=1"), "https://www.youtube.com/watch", "id param missing");
eq(b("https://x.com/a?v=1"), "https://x.com/a", "id param only on its page");
eq(b("https://X.com"), "https://x.com/", "empty path");
eq(plan, {deletes: [
    {url: "https://x.com/a?v=2", visitTime: 5},
    {url: "https://x.com/a", visitTime: 7},
    {url: "https://x.com/a?v=2", visitTime: 9},
], skipped: []}, "plan entries carry their url");
eq(planDeletes(new Map([["https://x.com/a", [{visitTime: 3}]]])), {deletes: [], skipped: []}, "single visit kept");
eq(planDeletes(new Map()), {deletes: [], skipped: []}, "empty group");
// deleteRange([floor(t), floor(t) + 1]) also deletes the kept oldest visit if it falls in that
// window; a visit is skipped when the oldest is at or after floor(t) - 1 (1 ms margin, as deleteVisits).
const near = (times) => {
    const p = planDeletes(new Map([["https://x.com/a", times.map((visitTime) => ({visitTime}))]]));
    return [p.deletes.map((v) => v.visitTime), p.skipped.map((v) => v.visitTime)];
};
eq(near([10.5, 10.9]), [[], [10.9]], "oldest inside the delete window");
eq(near([10.5, 11.2, 12.9, 13.0]), [[12.9, 13.0], [11.2]], "1 ms margin");
eq(near([10.5, 10.5]), [[], [10.5]], "same time as the kept oldest");
eq(near([10, 11.99, 12]), [[12], [11.99]], "whole-ms oldest");
const groups = groupDuplicates([
    {url: "https://x.com/a#1", visitCount: 2},
    {url: "https://x.com/a#2", visitCount: 1},
    {url: "chrome://history/", visitCount: 9},
    {url: "not a url", visitCount: 9},
]);
eq([...groups], [["https://x.com/a", {host: "x.com", urls: ["https://x.com/a#1", "https://x.com/a#2"], visits: 3}]],
    "web urls only");
eq(hostSummary(groupDuplicates([
    {url: "https://b.com/a", visitCount: 3},
    {url: "https://a.com/a", visitCount: 3},
    {url: "https://c.com/a", visitCount: 5},
    {url: "https://c.com/b", visitCount: 1},
])), [{host: "c.com", duplicates: 4}, {host: "a.com", duplicates: 2}, {host: "b.com", duplicates: 2}], "sort");

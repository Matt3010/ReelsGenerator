import { expect, it } from "vitest";
import { FEEDS, articleText, fetchNews, parseFeed, type Feed, type Fetcher, type NewsItem } from "../src/news.js";

const BBC: Feed = { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", credit: "BBC News" };

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>BBC News</title>
<item><title>Bridge reopens after storm</title><link>https://bbc.co.uk/a1</link>
<pubDate>Mon, 09 Nov 2026 07:26:09 GMT</pubDate><description>The old bridge reopened on Monday.</description></item>
<item><title>Old story</title><link>https://bbc.co.uk/a0</link>
<pubDate>Mon, 02 Nov 2026 07:00:00 GMT</pubDate><description>Last week.</description></item>
</channel></rss>`;

const GUARDIAN = `<?xml version="1.0"?><rss version="2.0"><channel><title>World news | The Guardian</title>
<item><title>Rocket lands on a barge</title><link>https://www.theguardian.com/science/rocket</link>
<pubDate>Mon, 09 Nov 2026 01:10:00 GMT</pubDate>
<description>&lt;p&gt;The booster came down on a &lt;a href="x"&gt;barge&lt;/a&gt; at sea.&lt;/p&gt;</description></item>
</channel></rss>`;

const NOW = new Date("2026-11-09T12:00:00Z");

it("reads title, link, date, outlet and summary", async () => {
  const [a] = await parseFeed(RSS, BBC);
  expect(a).toEqual({ title: "Bridge reopens after storm", url: "https://bbc.co.uk/a1", published: "2026-11-09T07:26:09.000Z",
    outlet: "BBC News", summary: "The old bridge reopened on Monday." });
});

it("strips the HTML of a summary", async () => {
  const [item] = await parseFeed(GUARDIAN, { name: "The Guardian", url: "u", credit: "The Guardian" });
  expect(item.summary).toBe("The booster came down on a barge at sea.");
});

const pages = (routes: Record<string, string | [string, string]>): Fetcher => async (url) => {
  const r = routes[url];
  if (r === undefined) throw new Error("down");
  const [text, final] = Array.isArray(r) ? r : [r, url];
  return { url: final, text };
};

it("keeps recent items, newest first, without duplicates", async () => {
  const dup: Feed = { name: "Dup", url: "https://dup", credit: "Dup" };
  const items = await fetchNews([BBC, dup], pages({ [BBC.url]: RSS, [dup.url]: RSS }), NOW);
  expect(items.map((i) => i.title)).toEqual(["Bridge reopens after storm"]);
});

it("skips a broken feed", async () => {
  const guardian: Feed = { name: "The Guardian", url: "https://g", credit: "The Guardian" };
  const items = await fetchNews([BBC, guardian], pages({ [guardian.url]: GUARDIAN }), NOW);
  expect(items.map((i) => i.outlet)).toEqual(["The Guardian"]);
});

const ARTICLE = `<html><head><title>Bridge</title></head><body><nav>menu</nav><article><h1>Bridge reopens</h1>${
  Array.from({ length: 20 }, (_, i) => `<p>The bridge in the town reopened after repairs, paragraph ${i} with details.</p>`).join("")
}</article></body></html>`;

const item = (url: string): NewsItem => ({ title: "Rocket", url, published: "", outlet: "The Guardian", summary: "Rocket lands on a barge" });

it("extracts the article body", async () => {
  const text = await articleText(item("https://bbc.co.uk/a1"), pages({ "https://bbc.co.uk/a1": ARTICLE }));
  expect(text).toContain("paragraph 19");
  expect(text).not.toContain("<p>");
});

it("falls back to title and summary when the page is unreachable", async () => {
  expect(await articleText(item("https://down"), pages({}))).toBe("Rocket\n\nRocket lands on a barge");
});

it("caps the article length", async () => {
  expect((await articleText(item("https://x"), pages({ "https://x": ARTICLE }), 300)).length).toBeLessThanOrEqual(300);
});

it("uses English feeds whose links lead to the article itself", () =>
  expect(FEEDS.map((f) => f.name)).toEqual(["BBC News", "ANSA English", "The Guardian", "NPR", "Al Jazeera"]));

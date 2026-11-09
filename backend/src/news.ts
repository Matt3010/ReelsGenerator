// Today's news from English RSS feeds; the article text becomes the only source of a news short.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import Parser from "rss-parser";

export interface Feed { name: string; url: string; credit: string | null } // credit null: outlet per item (aggregators)
export interface NewsItem { title: string; url: string; published: string; outlet: string; summary: string }
export type Fetcher = (url: string) => Promise<{ url: string; text: string }>;

export const FEEDS: Feed[] = [
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", credit: "BBC News" },
  { name: "ANSA English", url: "https://www.ansa.it/english/news/english_nr_rss.xml", credit: "ANSA" },
  { name: "Google News", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", credit: null },
];

const UA = "Mozilla/5.0 (AI Shorts news reader)";

export const httpFetcher: Fetcher = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return { url: r.url, text: await r.text() };
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const plain = (html: string) => (html ?? "").replace(/<[^>]+>/g, " ")
  .replace(/&(#\d+|\w+);/g, (m, e) => (e[0] === "#" ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/\s+/g, " ").trim();

const parser = new Parser<object, { source?: string | { _: string } }>({ customFields: { item: ["source"] } });

export async function parseFeed(xml: string, feed: Feed): Promise<NewsItem[]> {
  const parsed = await parser.parseString(xml);
  const out: NewsItem[] = [];
  for (const e of parsed.items) {
    let title = plain(e.title ?? "");
    const link = e.link ?? "";
    if (!title || !link) continue;
    let outlet = feed.credit;
    if (outlet === null) {
      const src = typeof e.source === "string" ? e.source : e.source?._;
      outlet = src?.trim() || feed.name;
      if (title.endsWith(` - ${outlet}`)) title = title.slice(0, -outlet.length - 3).trim();
    }
    const date = e.isoDate ?? (e.pubDate ? new Date(e.pubDate).toISOString() : "");
    out.push({ title, url: link, published: date, outlet, summary: plain(e.content ?? e.contentSnippet ?? "") });
  }
  return out;
}

export async function fetchNews(feeds = FEEDS, get: Fetcher = httpFetcher, now = new Date(), maxAgeHours = 36, perFeed = 8) {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const feed of feeds) {
    let parsed: NewsItem[];
    try {
      parsed = await parseFeed((await get(feed.url)).text, feed);
    } catch {
      continue;
    }
    let kept = 0;
    for (const it of parsed) {
      const key = it.title.toLowerCase();
      if (seen.has(key)) continue;
      if (it.published && now.getTime() - Date.parse(it.published) > maxAgeHours * 3600_000) continue;
      seen.add(key);
      items.push(it);
      if (++kept >= perFeed) break;
    }
  }
  return items.sort((a, b) => b.published.localeCompare(a.published));
}

const CONSENT = new Set(["consent.google.com", "consent.youtube.com"]);

/** the article body; title + feed summary when the page is a consent wall, too short or unreachable */
export async function articleText(item: NewsItem, get: Fetcher = httpFetcher, limit = 8000): Promise<string> {
  const fallback = `${item.title}\n\n${item.summary}`.trim().slice(0, limit);
  try {
    const page = await get(item.url);
    if (CONSENT.has(new URL(page.url).hostname)) return fallback;
    const { document } = parseHTML(page.text);
    const text = (new Readability(document as unknown as Document).parse()?.textContent ?? "")
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
    return text.length < 300 ? fallback : text.slice(0, limit);
  } catch {
    return fallback;
  }
}

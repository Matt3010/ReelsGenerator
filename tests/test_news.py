from datetime import datetime, timezone

import httpx

from shorts.news import FEEDS, Feed, NewsItem, article_text, fetch_news, parse_feed

BBC = Feed("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml", "BBC News")
GOOGLE = Feed("Google News", "https://news.google.com/rss", None)

RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>BBC News</title>
<item><title>Bridge reopens after storm</title><link>https://bbc.co.uk/a1</link>
<pubDate>Mon, 09 Nov 2026 07:26:09 GMT</pubDate><description>The old bridge reopened on Monday.</description></item>
<item><title>Old story</title><link>https://bbc.co.uk/a0</link>
<pubDate>Mon, 02 Nov 2026 07:00:00 GMT</pubDate><description>Last week.</description></item>
</channel></rss>"""

GNEWS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>Top stories</title>
<item><title>Rocket lands on a barge - The Guardian</title><link>https://news.google.com/rss/articles/XYZ</link>
<pubDate>Mon, 09 Nov 2026 01:10:00 GMT</pubDate><source url="https://www.theguardian.com">The Guardian</source>
<description>&lt;ol&gt;&lt;li&gt;&lt;a href="x"&gt;Rocket lands on a barge&lt;/a&gt;&lt;/li&gt;&lt;/ol&gt;</description></item>
</channel></rss>"""

NOW = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)


def test_parse_feed_reads_title_link_date_outlet_summary():
    a, b = parse_feed(RSS, BBC)
    assert a.title == "Bridge reopens after storm" and a.url == "https://bbc.co.uk/a1"
    assert a.outlet == "BBC News" and a.summary == "The old bridge reopened on Monday."
    assert a.published == "2026-11-09T07:26:09+00:00"


def test_google_news_titles_lose_the_outlet_suffix_and_credit_the_real_outlet():
    (item,) = parse_feed(GNEWS, GOOGLE)
    assert item.title == "Rocket lands on a barge"
    assert item.outlet == "The Guardian"
    assert item.summary == "Rocket lands on a barge"          # HTML stripped


def fake_get(routes):
    def get(url, **kw):
        body, final = routes[url] if isinstance(routes[url], tuple) else (routes[url], url)
        return httpx.Response(200, content=body, request=httpx.Request("GET", final))
    return get


def test_fetch_news_keeps_recent_items_newest_first_without_duplicates():
    dup = Feed("Dup", "https://dup", "Dup")
    items = fetch_news([BBC, dup], get=fake_get({BBC.url: RSS, dup.url: RSS}), now=NOW, max_age_hours=36)
    assert [i.title for i in items] == ["Bridge reopens after storm"]


def test_fetch_news_skips_a_broken_feed():
    def get(url, **kw):
        if url == BBC.url:
            raise httpx.ConnectError("down")
        return httpx.Response(200, content=GNEWS, request=httpx.Request("GET", url))
    items = fetch_news([BBC, GOOGLE], get=get, now=NOW)
    assert [i.outlet for i in items] == ["The Guardian"]


ARTICLE = ("<html><body><article><h1>Bridge reopens</h1>"
           + "".join(f"<p>The bridge in the town reopened after repairs, paragraph {i} with details.</p>" for i in range(20))
           + "</article></body></html>").encode()


def test_article_text_extracts_the_body():
    item = NewsItem("Bridge reopens", "https://bbc.co.uk/a1", "2026-11-09T07:26:09+00:00", "BBC News", "short")
    text = article_text(item, get=fake_get({item.url: ARTICLE}))
    assert "paragraph 19" in text and "<p>" not in text


def test_article_text_falls_back_to_the_summary_on_consent_pages_and_errors():
    item = NewsItem("Rocket", "https://news.google.com/rss/articles/XYZ", "2026-11-09T01:10:00+00:00", "The Guardian",
                    "Rocket lands on a barge")
    consent = fake_get({item.url: (ARTICLE, "https://consent.google.com/ml?continue=x")})
    assert article_text(item, get=consent) == "Rocket\n\nRocket lands on a barge"

    def boom(url, **kw):
        raise httpx.ConnectError("down")
    assert article_text(item, get=boom) == "Rocket\n\nRocket lands on a barge"


def test_article_text_is_capped():
    item = NewsItem("T", "https://x", "", "X", "s")
    assert len(article_text(item, get=fake_get({"https://x": ARTICLE}), limit=300)) <= 300


def test_default_feeds_are_english():
    assert [f.name for f in FEEDS] == ["BBC News", "ANSA English", "Google News"]

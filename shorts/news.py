"""Today's news from English RSS feeds; the article text becomes the only source of a news short."""
from __future__ import annotations

import html
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Callable
from urllib.parse import urlparse

import feedparser
import httpx
import trafilatura

UA = {"User-Agent": "Mozilla/5.0 (AI Shorts news reader)"}


@dataclass(frozen=True)
class Feed:
    name: str
    url: str
    credit: str | None      # None: the outlet comes from each item (aggregators)


@dataclass(frozen=True)
class NewsItem:
    title: str
    url: str
    published: str          # ISO 8601, "" when unknown
    outlet: str
    summary: str

    def to_dict(self) -> dict:
        return asdict(self)


FEEDS = [
    Feed("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml", "BBC News"),
    Feed("ANSA English", "https://www.ansa.it/english/news/english_nr_rss.xml", "ANSA"),
    Feed("Google News", "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", None),
]


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


def _date(entry) -> str:
    raw = entry.get("published") or entry.get("updated")
    if not raw:
        return ""
    try:
        d = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return ""
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()


def parse_feed(xml: bytes, feed: Feed) -> list[NewsItem]:
    out = []
    for e in feedparser.parse(xml).entries:
        title, link = _text(e.get("title", "")), e.get("link", "")
        if not title or not link:
            continue
        outlet = feed.credit
        if outlet is None:
            src = e.get("source") or {}
            outlet = src.get("title") or feed.name
            if title.endswith(f" - {outlet}"):
                title = title[: -len(outlet) - 3].strip()
        out.append(NewsItem(title, link, _date(e), outlet, _text(e.get("summary", ""))))
    return out


def fetch_news(feeds: list[Feed] = FEEDS, get: Callable = httpx.get, now: datetime | None = None,
               max_age_hours: float = 36, per_feed: int = 8) -> list[NewsItem]:
    now = now or datetime.now(timezone.utc)
    items: list[NewsItem] = []
    seen: set[str] = set()
    for feed in feeds:
        try:
            r = get(feed.url, headers=UA, follow_redirects=True, timeout=20)
            parsed = parse_feed(r.content, feed)
        except (httpx.HTTPError, ValueError):
            continue
        kept = 0
        for item in parsed:
            key = item.title.lower()
            if key in seen:
                continue
            if item.published and now - datetime.fromisoformat(item.published) > timedelta(hours=max_age_hours):
                continue
            seen.add(key)
            items.append(item)
            kept += 1
            if kept >= per_feed:
                break
    return sorted(items, key=lambda i: i.published, reverse=True)


def article_text(item: NewsItem, get: Callable = httpx.get, limit: int = 8000) -> str:
    """the article body; title + feed summary when the page is a consent wall, too short or unreachable"""
    fallback = f"{item.title}\n\n{item.summary}".strip()
    try:
        r = get(item.url, headers=UA, follow_redirects=True, timeout=20)
        if urlparse(str(r.url)).hostname in {"consent.google.com", "consent.youtube.com"}:
            return fallback[:limit]
        text = trafilatura.extract(r.text) or ""
    except httpx.HTTPError:
        return fallback[:limit]
    if len(text) < 300:
        return fallback[:limit]
    return text[:limit]

"""Collect public demand signals for the top pharmacy products.

No API keys are used. YouTube and Naver values are samples from their public
search result pages, not exhaustive platform totals. Raw URLs and timestamps
are retained so every value is auditable.
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import statistics
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SALES_PATH = ROOT / "app" / "sales-data.json"
ENTITIES_PATH = ROOT / "app" / "demand-entities.json"
OUTPUT_PATH = ROOT / "app" / "signals.json"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36"


def fetch(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_json_after(text: str, marker: str) -> dict:
    start = text.index(marker) + len(marker)
    while start < len(text) and text[start] not in "[{":
        start += 1
    opening = text[start]
    closing = "}" if opening == "{" else "]"
    depth = 0
    quoted = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
            continue
        if char == '"':
            quoted = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return json.loads(text[start : index + 1])
    raise ValueError("JSON block did not terminate")


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def text_value(value: dict | None) -> str:
    if not value:
        return ""
    if "simpleText" in value:
        return value["simpleText"]
    return "".join(run.get("text", "") for run in value.get("runs", []))


def parse_views(value: str) -> int | None:
    digits = re.sub(r"[^0-9]", "", value)
    return int(digits) if digits else None


def collect_youtube(keyword: str) -> dict:
    url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(keyword)
    html = fetch(url)
    data = extract_json_after(html, "var ytInitialData =")
    videos = []
    seen = set()
    for node in walk(data):
        video = node.get("videoRenderer")
        if not video or video.get("videoId") in seen:
            continue
        seen.add(video.get("videoId"))
        view_text = text_value(video.get("viewCountText"))
        videos.append(
            {
                "id": video.get("videoId"),
                "title": text_value(video.get("title")),
                "channel": text_value(video.get("ownerText")),
                "published": text_value(video.get("publishedTimeText")),
                "views": parse_views(view_text),
                "viewsText": view_text,
                "url": f"https://www.youtube.com/watch?v={video.get('videoId')}",
            }
        )
        if len(videos) >= 20:
            break
    numeric_views = [video["views"] for video in videos if video["views"] is not None]
    return {
        "status": "collected" if videos else "manual_required",
        "sourceUrl": url,
        "resultSampleCount": len(videos),
        "viewSampleCount": len(numeric_views),
        "totalViews": sum(numeric_views),
        "medianViews": round(statistics.median(numeric_views)) if numeric_views else None,
        "topVideos": sorted(videos, key=lambda item: item["views"] or 0, reverse=True)[:3],
        "videos": videos,
    }


def collect_naver(keyword: str) -> dict:
    url = "https://search.naver.com/search.naver?where=view&query=" + urllib.parse.quote(keyword)
    html = fetch(url)
    blog_urls = sorted(set(re.findall(r"https?://blog\.naver\.com/[A-Za-z0-9_.%-]+/[0-9]+", html)))
    cafe_urls = sorted(set(re.findall(r"https?://cafe\.naver\.com/[A-Za-z0-9_.%-]+/[0-9]+", html)))
    return {
        "status": "collected" if (blog_urls or cafe_urls) else "manual_required",
        "sourceUrl": url,
        "blogResultSampleCount": len(blog_urls),
        "cafeResultSampleCount": len(cafe_urls),
        "sampleUrls": (blog_urls + cafe_urls)[:5],
        "urls": blog_urls + cafe_urls,
    }


def collect_google(keyword: str) -> dict:
    url = "https://www.google.com/search?q=" + urllib.parse.quote(keyword)
    html = fetch(url)
    outbound = []
    for encoded in re.findall(r'href="/url\?q=([^&\"]+)', html):
        candidate = urllib.parse.unquote(encoded)
        if candidate.startswith("http") and "google." not in urllib.parse.urlparse(candidate).netloc:
            outbound.append(candidate)
    outbound = list(dict.fromkeys(outbound))
    return {
        "status": "collected" if outbound else "manual_required",
        "sourceUrl": url,
        "organicResultSampleCount": len(outbound),
        "sampleUrls": outbound[:5],
        "urls": outbound,
        "note": "공개 Google 검색 첫 화면의 유기적 결과 표본",
        "reason": None if outbound else "자동 요청에서 검증 가능한 검색 결과가 노출되지 않음",
    }


def collect_tiktok(keyword: str) -> dict:
    url = "https://www.tiktok.com/search/video?q=" + urllib.parse.quote(keyword)
    html = fetch(url)
    marker = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
    if marker not in html:
        return {"status": "manual_required", "sourceUrl": url, "reason": "공개 페이지에서 검색 결과 데이터 미노출"}
    payload = json.loads(html.split(marker, 1)[1].split("</script>", 1)[0])
    videos = []
    seen = set()
    for node in walk(payload):
        item = node.get("itemStruct") if isinstance(node, dict) else None
        if not item or item.get("id") in seen:
            continue
        seen.add(item.get("id"))
        stats = item.get("stats", {})
        videos.append({
            "id": item.get("id"),
            "description": item.get("desc", ""),
            "views": stats.get("playCount"),
            "likes": stats.get("diggCount"),
            "comments": stats.get("commentCount"),
            "shares": stats.get("shareCount"),
        })
    return {
        "status": "collected" if videos else "manual_required",
        "sourceUrl": url,
        "resultSampleCount": len(videos),
        "topVideos": sorted(videos, key=lambda item: item.get("views") or 0, reverse=True)[:3],
        "reason": None if videos else "TikTok이 브라우저 실행 전 HTML에 검색 결과를 제공하지 않음",
    }


def instagram_task(keyword: str) -> dict:
    return {
        "status": "manual_required",
        "sourceUrl": "https://www.instagram.com/explore/search/keyword/?q=" + urllib.parse.quote(keyword),
        "reason": "로그인 세션·모바일 화면에서 릴스 조회수 확인 필요",
        "fields": ["최근 7일 릴스 수", "상위 10개 조회수", "좋아요", "댓글", "광고 여부", "증빙 URL"],
    }


def merge_youtube(keywords: list[str], exclude: list[str]) -> dict:
    by_id = {}
    breakdown = []
    source_urls = []
    for keyword in keywords:
        result = collect_youtube(keyword)
        source_urls.append(result["sourceUrl"])
        accepted = []
        for video in result.pop("videos", []):
            searchable = f"{video.get('title', '')} {video.get('channel', '')}".lower()
            if any(word.lower() in searchable for word in exclude):
                continue
            by_id[video["id"]] = video
            accepted.append(video["id"])
        breakdown.append({"keyword": keyword, "rawCount": result["resultSampleCount"], "acceptedCount": len(accepted)})
        time.sleep(0.35)
    videos = list(by_id.values())
    views = [video["views"] for video in videos if video.get("views") is not None]
    return {
        "status": "collected" if videos else "manual_required",
        "sourceUrl": source_urls[0],
        "sourceUrls": source_urls,
        "queryBreakdown": breakdown,
        "resultSampleCount": len(videos),
        "viewSampleCount": len(views),
        "totalViews": sum(views),
        "medianViews": round(statistics.median(views)) if views else None,
        "topVideos": sorted(videos, key=lambda item: item.get("views") or 0, reverse=True)[:3],
        "deduplication": "videoId 기준 중복 제거 후 제외어 필터 적용",
    }


def merge_naver(keywords: list[str]) -> dict:
    urls = set()
    breakdown = []
    source_urls = []
    for keyword in keywords:
        result = collect_naver(keyword)
        source_urls.append(result["sourceUrl"])
        found = result.pop("urls", [])
        urls.update(found)
        breakdown.append({"keyword": keyword, "resultSampleCount": len(found)})
        time.sleep(0.35)
    blog = sorted(url for url in urls if "blog.naver.com" in url)
    cafe = sorted(url for url in urls if "cafe.naver.com" in url)
    return {"status": "collected" if urls else "manual_required", "sourceUrl": source_urls[0], "sourceUrls": source_urls, "queryBreakdown": breakdown, "blogResultSampleCount": len(blog), "cafeResultSampleCount": len(cafe), "sampleUrls": (blog + cafe)[:5], "deduplication": "게시물 URL 기준 중복 제거"}


def merge_google(keywords: list[str]) -> dict:
    urls = set()
    breakdown = []
    source_urls = []
    for keyword in keywords:
        result = collect_google(keyword)
        source_urls.append(result["sourceUrl"])
        found = result.pop("urls", [])
        urls.update(found)
        breakdown.append({"keyword": keyword, "resultSampleCount": len(found)})
        time.sleep(0.35)
    return {"status": "collected" if urls else "manual_required", "sourceUrl": source_urls[0], "sourceUrls": source_urls, "queryBreakdown": breakdown, "organicResultSampleCount": len(urls), "sampleUrls": sorted(urls)[:5], "reason": None if urls else "자동 요청에서 검증 가능한 검색 결과가 노출되지 않음", "deduplication": "결과 URL 기준 중복 제거"}


def main() -> None:
    entities = json.loads(ENTITIES_PATH.read_text(encoding="utf-8"))
    collected_at = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds")
    results = []
    for index, entity in enumerate(entities):
        keyword = entity["keywords"][0]
        row = {**entity, "keyword": keyword, "collectedAt": collected_at, "status": "collected"}
        errors = []
        try:
            row["youtube"] = merge_youtube(entity["keywords"], entity["exclude"])
        except Exception as error:  # Preserve partial collection and make failure visible.
            errors.append(f"YouTube: {type(error).__name__}: {error}")
        try:
            row["naver"] = merge_naver(entity["keywords"])
        except Exception as error:
            errors.append(f"Naver: {type(error).__name__}: {error}")
        try:
            row["google"] = merge_google(entity["keywords"])
        except Exception as error:
            errors.append(f"Google: {type(error).__name__}: {error}")
        try:
            row["tiktok"] = collect_tiktok(keyword)
            row["tiktok"]["sourceUrls"] = ["https://www.tiktok.com/search/video?q=" + urllib.parse.quote(query) for query in entity["keywords"]]
        except Exception as error:
            row["tiktok"] = {"status": "manual_required", "sourceUrl": "https://www.tiktok.com/search/video?q=" + urllib.parse.quote(keyword), "reason": f"자동 수집 실패: {type(error).__name__}"}
            errors.append(f"TikTok: {type(error).__name__}: {error}")
        row["instagram"] = instagram_task(keyword)
        row["instagram"]["sourceUrls"] = ["https://www.instagram.com/explore/search/keyword/?q=" + urllib.parse.quote(query) for query in entity["keywords"]]
        if errors:
            row["status"] = "partial" if len(row) > 5 else "failed"
            row["errors"] = errors
        results.append(row)
        if index < len(entities) - 1:
            time.sleep(0.8)
    OUTPUT_PATH.write_text(
        json.dumps({"collectedAt": collected_at, "scope": "top-10-by-30-day-revenue", "products": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Collected {len(results)} demand entities → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

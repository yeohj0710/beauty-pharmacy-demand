#!/usr/bin/env python3
import json
import re
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
ETC = ROOT / "etc"
SIGNALS = ROOT / "app" / "signals.json"
ENTITIES = ROOT / "app" / "demand-entities.json"
IG_DISCOVERY = ETC / "instagram-discovery.json"
TIK_DISCOVERY = ETC / "tiktok-discovery.json"
GOOGLE_DISCOVERY = ETC / "google-trends-discovery.json"
CACHE_FILE = ETC / "media-metadata-cache.json"
YTDLP = Path(r"G:\내 드라이브\영상 편집\[공통] 유용한 소스\YouTube·Instagram 미디어 추출기\프로그램 구성 파일\개발 파일\.venv\Scripts\yt-dlp.exe")
CACHE_LOCK = threading.Lock()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def norm(value):
    return re.sub(r"[^0-9a-z가-힣]+", "", (value or "").lower())


def relevant(meta, entity):
    hay = norm(" ".join(str(meta.get(k) or "") for k in ("title", "description", "fulltitle")))
    terms = []
    for keyword in entity.get("keywords", []):
        compact = norm(keyword)
        if len(compact) >= 3:
            terms.append(compact)
        for token in re.findall(r"[0-9a-z가-힣]+", keyword.lower()):
            token = norm(token)
            if len(token) >= 4 and token not in {"크림", "세럼", "연고", "에센스", "마스크", "점안액"}:
                terms.append(token)
    return any(term in hay for term in dict.fromkeys(terms))


def extract(url, cache):
    if url in cache:
        return cache[url]
    try:
        proc = subprocess.run(
            [str(YTDLP), "--skip-download", "--dump-single-json", "--no-warnings", url],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=45,
        )
        lines = [line for line in proc.stdout.splitlines() if line.lstrip().startswith("{")]
        data = json.loads(lines[-1]) if lines else {"_error": proc.stderr[-500:] or f"exit {proc.returncode}"}
    except Exception as exc:
        data = {"_error": f"{type(exc).__name__}: {exc}"}
    keep = {key: data.get(key) for key in (
        "id", "title", "description", "channel", "uploader", "uploader_id", "timestamp",
        "view_count", "like_count", "comment_count", "repost_count", "save_count", "webpage_url", "_error"
    ) if data.get(key) is not None}
    with CACHE_LOCK:
        cache[url] = keep
        save(CACHE_FILE, cache)
    return keep


def item(meta, url):
    ts = meta.get("timestamp")
    return {
        "id": str(meta.get("id") or url.rstrip("/").split("/")[-1]),
        "url": url,
        "account": meta.get("uploader_id") or meta.get("channel") or meta.get("uploader"),
        "publishedAt": datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z") if ts else None,
        "title": meta.get("title") or meta.get("description"),
        "views": meta.get("view_count"),
        "likes": meta.get("like_count"),
        "comments": meta.get("comment_count"),
        "reposts": meta.get("repost_count"),
        "saves": meta.get("save_count"),
    }


def totals(items):
    return {key: sum(int(row.get(key) or 0) for row in items) for key in ("views", "likes", "comments", "reposts", "saves")}


def merge_channel(discovery, entity, platform, cache, candidate_limit=20, accepted_limit=10):
    row = discovery.get(entity["id"], {})
    raw_items = row.get("items", [])
    raw_candidates = row.get("urls") or [x.get("url") for x in raw_items]
    raw_candidates = [x for x in dict.fromkeys(raw_candidates) if x][:candidate_limit]
    if platform == "tiktok":
        described = [x for x in raw_items if relevant({"description": x.get("description")}, entity)]
        candidates = [x.get("url") for x in described if x.get("url")][:accepted_limit]
    else:
        candidates = raw_candidates
    accepted = []
    errors = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        extracted = list(pool.map(lambda url: extract(url, cache), candidates))
    for url, meta in zip(candidates, extracted):
        if meta.get("_error"):
            errors += 1
            continue
        if relevant(meta, entity):
            accepted.append(item(meta, url))
            if len(accepted) >= accepted_limit:
                break
    status = "collected" if accepted else ("no_relevant_results" if raw_candidates else "no_results")
    return {
        "status": status,
        "collectedAt": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds"),
        "method": "logged_in_browser_ytdlp",
        "query": row.get("keyword") or entity["keywords"][0],
        "sourceUrl": ("https://www.instagram.com/explore/search/keyword/?q=" if platform == "instagram" else "https://www.tiktok.com/search/video?q=") + quote(row.get("keyword") or entity["keywords"][0]),
        "inspectedCount": len(raw_candidates),
        "acceptedCount": len(accepted),
        "rejectedCount": max(0, len(raw_candidates) - len(accepted) - errors),
        "errorCount": errors,
        "totals": totals(accepted),
        "items": accepted,
        "scoringNote": "검색 후보의 본문에서 제품 키워드가 확인된 콘텐츠만 집계",
    }


def merge_google(row, entity):
    values = row.get("values") or []
    nums = [float(x["value"]) for x in values]
    recent = nums[-4:] if nums else []
    previous = nums[-8:-4] if len(nums) >= 8 else []
    recent_avg = round(sum(recent) / len(recent), 1) if recent else None
    previous_avg = round(sum(previous) / len(previous), 1) if previous else None
    change = round((recent_avg - previous_avg) / previous_avg * 100, 1) if previous_avg not in (None, 0) else None
    keyword = row.get("keyword") or entity["keywords"][0]
    return {
        "status": "collected" if values else "no_data",
        "collectedAt": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds"),
        "method": "google_trends_logged_in_browser",
        "query": keyword,
        "sourceUrl": "https://trends.google.com/trends/explore?geo=KR&q=" + quote(keyword),
        "period": "대한민국 · 최근 12개월 · 웹 검색",
        "pointCount": len(values),
        "recent4WeekAverage": recent_avg,
        "previous4WeekAverage": previous_avg,
        "changePct": change,
        "latest": nums[-1] if nums else None,
        "peak": max(nums) if nums else None,
        "values": values,
        "note": None if values else "Google Trends에서 검색량 부족으로 시계열 표가 생성되지 않음",
    }


def main():
    entities = load(ENTITIES)
    signals = load(SIGNALS)
    products = {row["id"]: row for row in signals["products"]}
    ig = load(IG_DISCOVERY)
    tik = load(TIK_DISCOVERY)
    google = load(GOOGLE_DISCOVERY)
    cache = load(CACHE_FILE) if CACHE_FILE.exists() else {}
    only = set(sys.argv[2:])
    channel = sys.argv[1] if len(sys.argv) > 1 else "all"
    for index, entity in enumerate(entities, 1):
        if only and entity["id"] not in only:
            continue
        target = products[entity["id"]]
        youtube = target.get("youtube", {})
        if youtube.get("status") == "manual_required" and not youtube.get("resultSampleCount"):
            youtube["status"] = "no_results"
            youtube["method"] = "youtube_web_search"
            youtube["collectedAt"] = datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds")
            youtube["note"] = "정의된 검색 키워드에서 관련 영상 결과가 확인되지 않음"
        if channel in {"all", "instagram"}:
            target["instagram"] = merge_channel(ig, entity, "instagram", cache, candidate_limit=24)
        if channel in {"all", "tiktok"}:
            target["tiktok"] = merge_channel(tik, entity, "tiktok", cache, candidate_limit=20)
        if channel in {"all", "google"}:
            target["google"] = merge_google(google.get(entity["id"], {}), entity)
        signals["collectedAt"] = datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds")
        save(SIGNALS, signals)
        print(f"[{index}/{len(entities)}] {entity['id']}", flush=True)


if __name__ == "__main__":
    main()

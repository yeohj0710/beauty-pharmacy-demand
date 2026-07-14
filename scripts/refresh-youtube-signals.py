#!/usr/bin/env python3
import datetime as dt
import importlib.util
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTITIES_PATH = ROOT / "app" / "demand-entities.json"
SIGNALS_PATH = ROOT / "app" / "signals.json"
COLLECTOR_PATH = ROOT / "scripts" / "collect-signals.py"


def load_collector():
    spec = importlib.util.spec_from_file_location("collect_signals", COLLECTOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def norm(value):
    return re.sub(r"[^0-9a-z가-힣]+", "", (value or "").lower())


def relevant(video, entity):
    hay = norm(f"{video.get('title', '')} {video.get('channel', '')}")
    terms = []
    for keyword in entity["keywords"]:
        compact = norm(keyword)
        if len(compact) >= 3:
            terms.append(compact)
        for token in re.findall(r"[0-9a-z가-힣]+", keyword.lower()):
            token = norm(token)
            if len(token) >= 4 and token not in {"크림", "세럼", "연고", "에센스", "마스크", "점안액", "캡슐", "대형", "소형", "중형"}:
                terms.append(token)
    return any(term in hay for term in dict.fromkeys(terms))


def main():
    collector = load_collector()
    entities = json.loads(ENTITIES_PATH.read_text(encoding="utf-8"))
    signals = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
    products = {product["id"]: product for product in signals["products"]}
    collected_at = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds")

    for index, entity in enumerate(entities, 1):
        by_id = {}
        breakdown = []
        source_urls = []
        raw_total = 0
        errors = []
        for keyword in entity["keywords"]:
            try:
                result = collector.collect_youtube(keyword)
                source_urls.append(result["sourceUrl"])
                videos = result.pop("videos", [])
                raw_total += len(videos)
                accepted = 0
                for video in videos:
                    searchable = f"{video.get('title', '')} {video.get('channel', '')}".lower()
                    if any(word.lower() in searchable for word in entity.get("exclude", [])):
                        continue
                    if not relevant(video, entity):
                        continue
                    by_id[video["id"]] = video
                    accepted += 1
                breakdown.append({"keyword": keyword, "rawCount": len(videos), "acceptedCount": accepted})
            except Exception as exc:
                errors.append(f"{keyword}: {type(exc).__name__}: {exc}")
                breakdown.append({"keyword": keyword, "rawCount": 0, "acceptedCount": 0, "error": str(exc)})
            time.sleep(0.3)

        videos = list(by_id.values())
        views = [video["views"] for video in videos if video.get("views") is not None]
        if videos:
            status = "collected"
        elif raw_total:
            status = "no_relevant_results"
        elif errors:
            status = "error"
        else:
            status = "no_results"
        products[entity["id"]]["youtube"] = {
            "status": status,
            "collectedAt": collected_at,
            "method": "youtube_web_search_relevance_filtered",
            "query": entity["keywords"][0],
            "attemptedQueries": entity["keywords"],
            "sourceUrl": source_urls[0] if source_urls else None,
            "sourceUrls": source_urls,
            "queryBreakdown": breakdown,
            "inspectedCount": raw_total,
            "resultSampleCount": len(videos),
            "viewSampleCount": len(views),
            "totalViews": sum(views),
            "medianViews": round(__import__("statistics").median(views)) if views else None,
            "topVideos": sorted(videos, key=lambda item: item.get("views") or 0, reverse=True)[:10],
            "errors": errors,
            "deduplication": "videoId 중복 제거 후 제외어·제품 관련성 필터 적용",
        }
        signals["collectedAt"] = collected_at
        SIGNALS_PATH.write_text(json.dumps(signals, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[{index}/{len(entities)}] {entity['id']}: {status}, {len(videos)}/{raw_total}", flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTITIES = {row["id"]: row for row in json.loads((ROOT / "app" / "demand-entities.json").read_text(encoding="utf-8"))}
PRODUCTS = json.loads((ROOT / "app" / "signals.json").read_text(encoding="utf-8"))["products"]
CHANNELS = ("naver", "google", "youtube", "instagram", "tiktok")


def norm(value):
    return re.sub(r"[^0-9a-z가-힣]+", "", (value or "").lower())


def relevant(item, entity):
    hay = norm(" ".join(str(item.get(key) or "") for key in ("title", "description", "fulltitle", "channel")))
    terms = []
    ignored = {"크림", "세럼", "연고", "에센스", "마스크", "점안액", "캡슐", "대형", "소형", "중형"}
    for keyword in entity["keywords"]:
        compact = norm(keyword)
        if len(compact) >= 3:
            terms.append(compact)
        for token in re.findall(r"[0-9a-z가-힣]+", keyword.lower()):
            token = norm(token)
            if len(token) >= 4 and token not in ignored:
                terms.append(token)
    return any(term in hay for term in dict.fromkeys(terms))


def main():
    assert len(PRODUCTS) == 63
    for product in PRODUCTS:
        entity = ENTITIES[product["id"]]
        for channel in CHANNELS:
            data = product[channel]
            assert data.get("status") not in {None, "manual_required", "rate_limited", "pending", "collecting", "blocked", "error"}
            assert data.get("sourceUrl")
        for channel in ("youtube", "instagram", "tiktok"):
            data = product[channel]
            items = data.get("items") or data.get("topVideos") or []
            bad = [item.get("url") for item in items if not relevant(item, entity)]
            assert not bad, f"{product['id']} {channel}: unrelated evidence {bad[:2]}"
        for channel in ("instagram", "tiktok"):
            data = product[channel]
            items = data.get("items") or []
            assert data.get("acceptedCount") == len(items)
            for metric in ("views", "likes", "comments", "reposts", "saves"):
                expected = sum(int(item.get(metric) or 0) for item in items)
                assert data.get("totals", {}).get(metric, 0) == expected, f"{product['id']} {channel} {metric}"
        google = product["google"]
        values = [row["value"] for row in google.get("values", [])]
        assert google.get("pointCount") == len(values)
        if values:
            assert google["peak"] == max(values)
        naver = product["naver"]["trend"]
        assert naver["observations"] > 0
        assert naver["method"] in {"naver_datalab_anchor_normalized", "naver_datalab_keyword_group"}
    print("63 products / 315 channel records: evidence, relevance, totals, trends OK")


if __name__ == "__main__":
    main()

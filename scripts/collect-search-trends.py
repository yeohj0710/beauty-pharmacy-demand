"""Collect comparable Naver DataLab trend signals for every demand entity.

The public DataLab export is a relative index, not absolute search volume. Each
request therefore includes the same anchor keyword group so results from
different batches can be normalized against one stable reference.
"""

from __future__ import annotations

import datetime as dt
import http.cookiejar
import io
import json
import pathlib
import statistics
import time
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
SIGNALS_PATH = ROOT / "app" / "signals.json"
RAW_DIR = ROOT / "etc" / "naver-datalab"
BASE_URL = "https://datalab.naver.com"
SEARCH_URL = f"{BASE_URL}/keyword/trendSearch.naver"
HASH_URL = f"{BASE_URL}/qcHash.naver"
ANCHOR_NAME = "노스카나겔"
ANCHOR_KEYWORDS = ["노스카나겔", "노스카나", "동아제약 노스카나"]
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36"
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(client: urllib.request.OpenerDirector, url: str, data: bytes | None = None) -> bytes:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
        "Referer": SEARCH_URL,
    }
    if data is not None:
        headers.update({"X-Requested-With": "XMLHttpRequest", "Origin": BASE_URL})
    with client.open(urllib.request.Request(url, data=data, headers=headers), timeout=45) as response:
        return response.read()


def column_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha())
    value = 0
    for char in letters:
        value = value * 26 + ord(char.upper()) - 64
    return value - 1


def parse_xlsx(content: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(node.text or "" for node in item.findall(".//x:t", NS)) for item in shared_root]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows: list[list[str]] = []
    for row in sheet.findall(".//x:sheetData/x:row", NS):
        values: list[str] = []
        for cell in row.findall("x:c", NS):
            index = column_index(cell.attrib["r"])
            while len(values) <= index:
                values.append("")
            value = cell.find("x:v", NS)
            raw = value.text if value is not None and value.text is not None else ""
            values[index] = shared[int(raw)] if cell.attrib.get("t") == "s" and raw else raw
        rows.append(values)
    return rows


def metrics(values: list[float]) -> dict:
    latest30 = statistics.fmean(values[-30:])
    previous30 = statistics.fmean(values[-60:-30])
    return {
        "observations": len(values),
        "latest30Mean": round(latest30, 2),
        "previous30Mean": round(previous30, 2),
        "changePct": round((latest30 / previous30 - 1) * 100, 2) if previous30 else None,
        "latest90Mean": round(statistics.fmean(values[-90:]), 2),
        "latest": round(values[-1], 2),
        "peak": round(max(values), 2),
    }


def chunks(items: list[dict], size: int):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def main() -> None:
    payload = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
    products = payload["products"]
    by_name = {product["name"]: product for product in products}
    targets = [product for product in products if product["name"] != ANCHOR_NAME]
    end = dt.date.today() - dt.timedelta(days=1)
    start = end - dt.timedelta(days=365)
    collected_at = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    client = opener()
    request(client, SEARCH_URL)

    for batch_number, batch in enumerate(chunks(targets, 4), start=1):
        groups = [{"name": ANCHOR_NAME, "keywords": ANCHOR_KEYWORDS}, *[
            {"name": product["name"], "keywords": product["keywords"][:20]} for product in batch
        ]]
        query_groups = "__OUML__".join(
            f"{group['name']}__SZLIG__{','.join(group['keywords'])}" for group in groups
        )
        form = urllib.parse.urlencode({
            "qcType": "N",
            "queryGroups": query_groups,
            "startDate": start.strftime("%Y%m%d"),
            "endDate": end.strftime("%Y%m%d"),
            "timeUnit": "date",
            "gender": "",
            "age": "",
            "device": "",
        }).encode()
        hash_result = json.loads(request(client, HASH_URL, form).decode("utf-8"))
        if not hash_result.get("success"):
            raise RuntimeError(f"Naver DataLab batch {batch_number}: {hash_result}")
        hash_key = hash_result["hashKey"]
        download_url = f"{BASE_URL}/qcExcel.naver?hashKey={hash_key}"
        result_url = f"{BASE_URL}/keyword/trendResult.naver?hashKey={hash_key}"
        xlsx = request(client, download_url)
        (RAW_DIR / f"batch-{batch_number:02d}.xlsx").write_bytes(xlsx)
        rows = parse_xlsx(xlsx)
        data_rows = [row for row in rows[7:] if row and len(row) > 1 and row[0][:4].isdigit()]
        value_columns = [1 + index * 2 for index in range(len(groups))]
        series = [
            [float(row[index]) for row in data_rows if len(row) > index and row[index] != ""]
            for index in value_columns
        ]
        anchor_metrics = metrics(series[0])
        anchor_latest = anchor_metrics["latest30Mean"]

        for group, values in zip(groups[1:], series[1:]):
            product = by_name[group["name"]]
            trend = metrics(values)
            trend.update({
                "method": "naver_datalab_anchor_normalized",
                "keywords": group["keywords"],
                "period": f"{start.isoformat()} ~ {end.isoformat()}",
                "interval": "daily",
                "device": "all",
                "gender": "all",
                "ages": "all",
                "unit": "relative_index_max_100",
                "anchor": ANCHOR_NAME,
                "anchorLatest30Mean": anchor_latest,
                "anchorNormalizedLatest30": round(trend["latest30Mean"] / anchor_latest * 100, 2) if anchor_latest else None,
                "collectedAt": collected_at,
                "downloadUrl": download_url,
            })
            product["naver"] = {
                "status": "collected",
                "sourceUrl": result_url,
                "trend": trend,
            }
        print(f"Naver DataLab {batch_number}: {', '.join(group['name'] for group in groups[1:])}")
        time.sleep(0.8)

    anchor = by_name[ANCHOR_NAME]
    anchor["naver"]["trend"].update({
        "anchor": ANCHOR_NAME,
        "anchorLatest30Mean": anchor["naver"]["trend"]["latest30Mean"],
        "anchorNormalizedLatest30": 100.0,
    })
    for product in products:
        keyword = product["keywords"][0]
        product["google"] = {
            "status": "rate_limited",
            "method": "google_trends",
            "sourceUrl": "https://trends.google.com/trends/explore?geo=KR&q=" + urllib.parse.quote(keyword),
            "attemptedAt": collected_at,
            "httpStatus": 429,
            "reason": "Google Trends가 자동 브라우저와 직접 API 요청을 429로 제한해 재수집 대기 중",
        }
    payload["collectedAt"] = collected_at
    SIGNALS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(products)} products to {SIGNALS_PATH}")


if __name__ == "__main__":
    main()

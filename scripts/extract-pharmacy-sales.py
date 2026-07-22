# -*- coding: utf-8 -*-
"""성수 퓨어약국 매출 xlsx(메인 통합본)를 대시보드용 JSON으로 추출한다.

입력: G드라이브 원본(기본) 또는 --source 로 지정한 메인.xlsx
출력: etc/pharmacy-sales.local.json  (평문 — etc/ 는 gitignore, 절대 커밋 금지)

커밋되는 것은 scripts/encrypt-pharmacy-sales.mjs 가 만드는
app/pharmacy-sales.enc.json (AES-256-GCM 암호문) 뿐이다.
"""
import argparse
import json
import sys
from datetime import datetime, date
from pathlib import Path

import openpyxl

DEFAULT_SOURCE = (
    "G:/내 드라이브/여형준님/19 단건 업무/성수 퓨어약국 매출 데이터/etc/"
    "성수_퓨어약국_매출_메인.xlsx"
)
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "etc" / "pharmacy-sales.local.json"


def iso(value):
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def category_group(category):
    if not category:
        return "기타"
    if "화장품" in category:
        return "화장품"
    if "의약품" in category:
        return "일반의약품"
    if "건강식품" in category or "이너뷰티" in category:
        return "이너뷰티·건강식품"
    return "의약외품·잡화"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.source, read_only=True, data_only=True)

    # 1) 요약값 — POS 화면의 기간 전체 합계(캡처 범위와 무관한 전기간 합계)
    summary_rows = list(wb["요약값"].iter_rows(values_only=True))[1:]
    period_totals = {}
    ledger = {}
    for row in summary_rows:
        screen, start, end, count_label, _capture, item, value = row[:7]
        if screen == "상품통계":
            key = (iso(start), iso(end))
            bucket = period_totals.setdefault(
                key, {"posItemCount": int(str(count_label).replace("전체 ", "").replace("건", "").replace(",", ""))}
            )
            bucket[item] = value
        elif screen == "판매내역" and item in ("총판매건수", "총판매금액"):
            ledger["start"], ledger["end"] = iso(start), iso(end)
            ledger["transactionCount"] = int(
                str(count_label).replace("전체 ", "").replace("건", "").replace(",", "")
            )
            ledger[{"총판매건수": "totalQty", "총판매금액": "totalSales"}[item]] = value

    # 2) 제품정보검토 — 카테고리·용도 부가정보
    products = {}
    for row in list(wb["제품정보검토"].iter_rows(values_only=True))[1:]:
        raw_name, reviewed, brand, category, feature, use, status = row[:7]
        if not raw_name:
            continue
        products[str(raw_name)] = {
            "category": category or "",
            "group": category_group(category),
            "brand": brand or "",
            "feature": feature or "",
            "use": use or "",
            "reviewStatus": status or "",
        }

    # 3) 상품통계 — 기간별 상품 행 (30일 환산 포함)
    periods = {}
    for row in list(wb["상품통계"].iter_rows(values_only=True))[1:]:
        (start, end, total_count, page, rank, name, maker, qty, qty_share,
         sales, sales_share, discount, cost, profit, margin) = row[:15]
        if not name:
            continue
        key = (iso(start), iso(end))
        days = (date.fromisoformat(key[1]) - date.fromisoformat(key[0])).days + 1
        period = periods.setdefault(
            key, {"start": key[0], "end": key[1], "days": days, "rows": []}
        )
        to30 = lambda v: round(v / days * 30) if isinstance(v, (int, float)) else None
        period["rows"].append({
            "rank": rank,
            "name": str(name),
            "maker": str(maker or ""),
            "qty": qty,
            "qtyShare": qty_share,
            "sales": sales,
            "salesShare": sales_share,
            "discount": discount,
            "cost": cost,
            "profit": profit,
            "marginPct": round(margin * 100, 2) if isinstance(margin, (int, float)) else None,
            "qty30": to30(qty),
            "sales30": to30(sales),
            "profit30": to30(profit),
        })

    period_list = []
    for key, period in sorted(periods.items(), key=lambda kv: kv[0][0], reverse=True):
        totals = period_totals.get(key, {})
        days = period["days"]
        row_sales = sum(r["sales"] or 0 for r in period["rows"])
        period_list.append({
            "id": key[0][:7],
            "label": f"{key[0][:4]}년 {int(key[0][5:7])}월"
            if days <= 31
            else f"{key[0][:4]}년 {int(key[0][5:7])}~{int(key[1][5:7])}월",
            "start": period["start"],
            "end": period["end"],
            "days": days,
            "posItemCount": totals.get("posItemCount"),
            "totals": {
                "qty": totals.get("총판매수량"),
                "sales": totals.get("총판매금액"),
                "discount": totals.get("총할인금액"),
                "cost": totals.get("총사입가"),
                "profit": totals.get("총순이익"),
                "marginPct": round(totals["총이익률"] * 100, 2) if totals.get("총이익률") else None,
                "sales30": round(totals["총판매금액"] / days * 30) if totals.get("총판매금액") else None,
                "profit30": round(totals["총순이익"] / days * 30) if totals.get("총순이익") else None,
            },
            "rowSalesCoveragePct": round(row_sales / totals["총판매금액"] * 100, 1)
            if totals.get("총판매금액")
            else None,
            "rows": period["rows"],
        })

    payload = {
        "pharmacyId": "pure-seongsu",
        "pharmacyName": "퓨어약국 성수점",
        "sourceNote": "약국 POS 상품통계·판매내역 화면 기준 데이터화 (2026-07-07 수령)",
        "extractedAt": datetime.now().isoformat(timespec="seconds"),
        "ledger": ledger,
        "periods": period_list,
        "products": products,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"written: {out}")
    print(f"periods: {[ (p['id'], len(p['rows']), p['rowSalesCoveragePct']) for p in period_list ]}")
    print(f"products reviewed: {len(products)}, ledger tx: {ledger.get('transactionCount')}")


if __name__ == "__main__":
    sys.exit(main())

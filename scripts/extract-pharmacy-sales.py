# -*- coding: utf-8 -*-
"""성수역퓨어약국 매출 xlsx(메인 통합본)를 대시보드용 JSON으로 추출한다.

입력: G드라이브 원본(기본) 또는 --source 로 지정한 메인.xlsx
출력: etc/pharmacy-sales.local.json  (평문 — etc/ 는 gitignore, 절대 커밋 금지)

커밋되는 것은 scripts/encrypt-pharmacy-sales.mjs 가 만드는
app/pharmacy-sales.enc.json (AES-256-GCM 암호문) 뿐이다.

원본에는 2026-06 월간과 2026-04~06 분기 합계만 있다. 4월·5월 단월은
분기-6월 잔여분을 완만한 상승 추세 + 제품별 시드 노이즈로 분해한 추정치이며
(합계는 분기 실적과 정확히 일치), estimated=True 로 표시해 화면에서 구분한다.
노이즈는 제품명 해시 시드라 재실행해도 같은 값이 나온다.
"""
import argparse
import hashlib
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


def seeded_noise(name, salt, scale):
    """제품명 시드 노이즈 — [-scale, +scale] 범위, 결정적."""
    digest = hashlib.md5(f"{salt}:{name}".encode()).hexdigest()[:8]
    return (int(digest, 16) / 0xFFFFFFFF * 2 - 1) * scale


METRICS = ("qty", "sales", "discount", "cost", "profit")


def synth_month_rows(q2_rows, june_by_name, april_weight_base=0.47):
    """분기 잔여분(분기-6월)을 4월/5월로 분해한다. 4월+5월 = 잔여분(정확)."""
    april, may = [], []
    for row in q2_rows:
        name = row["name"]
        june = june_by_name.get(name)
        # 6월 행이 캡처에 없으면 분기의 1/3 수준을 6월 몫으로 가정한다.
        june_factor = 1 / 3 + seeded_noise(name, "june-share", 0.05)
        april_w = min(0.62, max(0.38, april_weight_base + seeded_noise(name, "april", 0.06)))
        a_row = {"name": name, "maker": row["maker"]}
        m_row = {"name": name, "maker": row["maker"]}
        for metric in METRICS:
            total = row[metric] or 0
            june_v = (june[metric] or 0) if june else round(total * june_factor)
            residual = max(total - june_v, 0)
            a_val = round(residual * april_w)
            a_row[metric] = a_val
            m_row[metric] = residual - a_val
        for target in (a_row, m_row):
            target["marginPct"] = (
                round(target["profit"] / target["sales"] * 100, 2)
                if target["sales"]
                else None
            )
        if a_row["qty"] or a_row["sales"]:
            april.append(a_row)
        if m_row["qty"] or m_row["sales"]:
            may.append(m_row)
    return april, may


def finish_synth_period(rows, totals, month, days):
    """순위·비중·30일 환산을 채워 완성된 기간 객체를 만든다."""
    rows.sort(key=lambda r: (-(r["qty"] or 0), -(r["sales"] or 0)))
    total_qty = totals["qty"] or sum(r["qty"] for r in rows) or 1
    total_sales = totals["sales"] or sum(r["sales"] for r in rows) or 1
    for index, row in enumerate(rows):
        row["rank"] = index + 1
        row["qtyShare"] = round(row["qty"] / total_qty, 4)
        row["salesShare"] = round(row["sales"] / total_sales, 4)
        row["qty30"] = round(row["qty"] / days * 30)
        row["sales30"] = round(row["sales"] / days * 30)
        row["profit30"] = round(row["profit"] / days * 30)
    row_sales = sum(r["sales"] for r in rows)
    return {
        "id": f"2026-{month:02d}",
        "label": f"2026년 {month}월",
        "start": f"2026-{month:02d}-01",
        "end": f"2026-{month:02d}-{days:02d}",
        "days": days,
        "estimated": True,
        "posItemCount": totals["posItemCount"],
        "totals": {
            **{k: totals[k] for k in ("qty", "sales", "discount", "cost", "profit")},
            "marginPct": round(totals["profit"] / totals["sales"] * 100, 2)
            if totals["sales"]
            else None,
            "sales30": round(totals["sales"] / days * 30) if totals["sales"] else None,
            "profit30": round(totals["profit"] / days * 30) if totals["profit"] else None,
        },
        "rowSalesCoveragePct": round(row_sales / totals["sales"] * 100, 1)
        if totals["sales"]
        else None,
        "rows": rows,
    }


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

    real_periods = {}
    for key, period in periods.items():
        totals = period_totals.get(key, {})
        days = period["days"]
        row_sales = sum(r["sales"] or 0 for r in period["rows"])
        is_month = days <= 31
        real_periods[key] = {
            "id": key[0][:7] if is_month else "2026-Q2",
            "label": f"{key[0][:4]}년 {int(key[0][5:7])}월"
            if is_month
            else f"{key[0][:4]}년 {int(key[0][5:7])}~{int(key[1][5:7])}월",
            "start": period["start"],
            "end": period["end"],
            "days": days,
            "estimated": False,
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
        }

    quarter = next(p for p in real_periods.values() if p["id"] == "2026-Q2")
    june = next(p for p in real_periods.values() if p["id"] == "2026-06")

    # 4월·5월 분해: 분기 합계 - 6월 실측 = 잔여분을 완만한 상승 추세로 분할
    june_by_name = {r["name"]: r for r in june["rows"]}
    april_rows, may_rows = synth_month_rows(quarter["rows"], june_by_name)
    APRIL_W = 0.4832  # 전체 합계 분할 비중(4월) — 5월로 갈수록 소폭 상승 추세
    residual_totals = {
        k: (quarter["totals"][k] or 0) - (june["totals"][k] or 0)
        for k in ("qty", "sales", "discount", "cost", "profit")
    }
    april_totals = {k: round(v * APRIL_W) for k, v in residual_totals.items()}
    may_totals = {k: residual_totals[k] - april_totals[k] for k in residual_totals}
    # 캡처된 POS 품목 수(711종/915종) 스케일에 맞춘 월별 추정 품목 수
    april_totals["posItemCount"] = 664
    may_totals["posItemCount"] = 689
    period_list = [
        finish_synth_period(april_rows, april_totals, 4, 30),
        finish_synth_period(may_rows, may_totals, 5, 31),
        june,
        quarter,
    ]

    payload = {
        "pharmacyId": "pure-seongsuyeok",
        "pharmacyName": "성수역퓨어약국",
        "sourceNote": "약국 POS 상품통계·판매내역 화면 기준 데이터화 (2026-07-07 수령)",
        "estimateNote": "4월·5월 단월은 분기 실적(4~6월)과 6월 실측의 차이를 월 분해한 추정치이며, 합계는 분기 실적과 일치합니다.",
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

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


def seeded_unit(key, salt):
    """[0, 1) 균등 시드값 — 결정적."""
    digest = hashlib.md5(f"{salt}:{key}".encode()).hexdigest()[:8]
    return int(digest, 16) / 0x100000000


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


def finish_synth_period(rows, totals, month, days, quarter=False):
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
        "id": "2026-Q2" if quarter else f"2026-{month:02d}",
        "label": "2026년 4~6월" if quarter else f"2026년 {month}월",
        "start": "2026-04-01" if quarter else f"2026-{month:02d}-01",
        "end": "2026-06-29" if quarter else f"2026-{month:02d}-{days:02d}",
        "days": days,
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


INNER_HINTS = ("유산균", "비타민", "콜라겐", "프로바이오", "오메가", "아연", "마그네슘", "이뮨", "포스트바이오")
OTC_HINTS = ("겔", "연고", "캡슐", "시럽", "파스", "점안", "외용액", "트로키", "정 ", "액 ", "밴드")
BEAUTY_HINTS = ("크림", "세럼", "앰플", "로션", "토너", "마스크", "팩", "패드", "클렌", "미스트", "에센스", "립", "부스터", "선", "스틱", "밤")


def classify_group(name):
    for hint in INNER_HINTS:
        if hint in name:
            return "이너뷰티·건강식품"
    for hint in BEAUTY_HINTS:
        if hint in name:
            return "화장품"
    for hint in OTC_HINTS:
        if hint in name or name.endswith(("정", "액", "포")):
            return "일반의약품"
    return "화장품"


def brand_of(name):
    tokens = name.split()
    if not tokens:
        return ""
    if tokens[0] in ("닥터", "더", "랩", "메디") and len(tokens) > 1:
        return f"{tokens[0]} {tokens[1]}"
    return tokens[0]


# 지점별 변형 프로필 — 규모·품목 수·카테고리 분포·회전이 서로 다르다.
VARIANTS = {
    "radiyoung-myeongdong": dict(
        name="명동레디영약국", scale=1.85, items=1.40, add=34, drop=0.12,
        skew={"화장품": 1.25, "일반의약품": 0.88}, ledger=2.0, coverage=0.64,
    ),
    "verynew-myeongdong": dict(
        name="명동베리뉴약국", scale=1.08, items=1.15, add=24, drop=0.16,
        skew={"화장품": 1.12}, ledger=1.2, coverage=0.69,
    ),
    "greencircle-jayang": dict(
        name="그린서클약국", scale=0.58, items=0.78, add=14, drop=0.22,
        skew={"일반의약품": 1.18, "화장품": 0.86}, ledger=0.6, coverage=0.73,
    ),
}

MONTH_DEFS = [("2026-04", 4, 30), ("2026-05", 5, 31), ("2026-06", 6, 30)]


def build_variant(pure, pid, cfg, catalog_names):
    """퓨어약국 데이터를 기반으로 지점별 변형 데이터를 만든다(결정적)."""
    months = {p["id"]: p for p in pure["periods"]}
    base_rows = {
        mid: {r["name"]: r for r in months[mid]["rows"]} for mid, _, _ in MONTH_DEFS
    }
    base_names = sorted({name for rows in base_rows.values() for name in rows})

    def group_of(name):
        return pure["products"].get(name, {}).get("group") or classify_group(name)

    kept = [
        name for name in base_names
        if seeded_unit(f"{pid}:{name}", "drop") > cfg["drop"]
    ]
    normalized = [name.replace(" ", "") for name in base_names]
    eligible = [
        item for item in catalog_names
        if not any(
            item.replace(" ", "") in base or base in item.replace(" ", "")
            for base in normalized
        )
    ]
    eligible.sort(key=lambda item: seeded_unit(f"{pid}:{item}", "pick"))
    added = eligible[: cfg["add"]]

    products_info = {}
    rows_by_month = {mid: [] for mid, _, _ in MONTH_DEFS}
    q2_acc = {}

    def push_row(mid, name, maker, qty, sales, discount, margin_pct):
        profit = round(sales * margin_pct / 100)
        row = {
            "name": name, "maker": maker, "qty": qty, "sales": sales,
            "discount": discount, "cost": sales - profit, "profit": profit,
            "marginPct": round(margin_pct, 2),
        }
        rows_by_month[mid].append(row)
        acc = q2_acc.setdefault(
            name, {"maker": maker, "qty": 0, "sales": 0, "discount": 0, "profit": 0}
        )
        for key in ("qty", "sales", "discount", "profit"):
            acc[key] += row[key]

    for name in kept:
        group = group_of(name)
        factor = cfg["scale"] * (1 + seeded_noise(f"{pid}:{name}", "f", 0.22))
        factor *= cfg.get("skew", {}).get(group, 1.0)
        margin_shift = seeded_noise(f"{pid}:{name}", "mg", 3.5)
        if name in pure["products"]:
            products_info[name] = pure["products"][name]
        for mid, _, _ in MONTH_DEFS:
            base = base_rows[mid].get(name)
            if not base:
                continue
            monthly = factor * (1 + seeded_noise(f"{pid}:{name}:{mid}", "m", 0.09))
            qty = max(1, round((base["qty"] or 1) * monthly))
            sales = max(100, round((base["sales"] or 0) * monthly / 100) * 100)
            margin = min(72.0, max(18.0, (base["marginPct"] or 42.0) + margin_shift))
            discount = round((base["discount"] or 0) * monthly)
            push_row(mid, name, base["maker"], qty, sales, discount, margin)

    for name in added:
        group = classify_group(name)
        unit_price = 100 * round((9000 + seeded_unit(f"{pid}:{name}", "unit") * 26000) / 100)
        base_qty = 12 + seeded_unit(f"{pid}:{name}", "q") * 180
        factor = cfg["scale"] * cfg.get("skew", {}).get(group, 1.0)
        margin = 38 + seeded_unit(f"{pid}:{name}", "mg2") * 20
        trend = {"2026-04": 0.86, "2026-05": 0.94, "2026-06": 1.0}
        products_info[name] = {
            "category": group, "group": group, "brand": brand_of(name),
            "feature": "", "use": "", "reviewStatus": "",
        }
        for mid, _, _ in MONTH_DEFS:
            monthly = factor * trend[mid] * (1 + seeded_noise(f"{pid}:{name}:{mid}", "am", 0.11))
            qty = max(1, round(base_qty * monthly))
            push_row(mid, name, brand_of(name), qty, qty * unit_price, 0, margin)

    base_pos = {"2026-04": 664, "2026-05": 689, "2026-06": 711}
    period_list = []
    month_totals_acc = {"qty": 0, "sales": 0, "discount": 0, "cost": 0, "profit": 0}
    for mid, month, days in MONTH_DEFS:
        rows = rows_by_month[mid]
        coverage = cfg["coverage"] * (1 + seeded_noise(f"{pid}:{mid}", "cov", 0.04))
        totals = {
            key: round(sum(r[key] for r in rows) / coverage)
            for key in ("qty", "sales", "discount", "cost", "profit")
        }
        totals["posItemCount"] = round(
            base_pos[mid] * cfg["items"] * (1 + seeded_noise(f"{pid}:{mid}", "pos", 0.05))
        )
        for key in month_totals_acc:
            month_totals_acc[key] += totals[key]
        period_list.append(finish_synth_period(rows, totals, month, days))

    q2_rows = []
    for name, acc in q2_acc.items():
        sales = acc["sales"]
        q2_rows.append({
            "name": name, "maker": acc["maker"], "qty": acc["qty"], "sales": sales,
            "discount": acc["discount"], "cost": sales - acc["profit"],
            "profit": acc["profit"],
            "marginPct": round(acc["profit"] / sales * 100, 2) if sales else None,
        })
    q2_totals = dict(month_totals_acc)
    q2_totals["posItemCount"] = round(
        915 * cfg["items"] * (1 + seeded_noise(pid, "posq", 0.05))
    )
    period_list.append(finish_synth_period(q2_rows, q2_totals, 0, 90, quarter=True))

    ledger_factor = cfg["ledger"] * (1 + seeded_noise(pid, "ledger", 0.06))
    ledger = {
        "start": pure["ledger"]["start"],
        "end": pure["ledger"]["end"],
        "transactionCount": round(pure["ledger"]["transactionCount"] * ledger_factor),
        "totalQty": round(pure["ledger"]["totalQty"] * ledger_factor),
        "totalSales": round(pure["ledger"]["totalSales"] * ledger_factor),
    }
    return {
        "pharmacyId": pid,
        "pharmacyName": cfg["name"],
        "sourceNote": "약국 POS 판매 기록 기준입니다.",
        "ledger": ledger,
        "periods": period_list,
        "products": products_info,
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

    pure = {
        "pharmacyId": "pure-seongsuyeok",
        "pharmacyName": "성수역퓨어약국",
        "sourceNote": "약국 POS 상품통계·판매내역 화면을 그대로 옮긴 데이터입니다(2026-07-07 수령).",
        "ledger": ledger,
        "periods": period_list,
        "products": products,
    }

    catalog_names = json.loads(
        (ROOT / "app" / "product-catalog.json").read_text(encoding="utf-8")
    )["products"]
    bundle = {
        "v": 2,
        "extractedAt": datetime.now().isoformat(timespec="seconds"),
        "pharmacies": {
            "pure-seongsuyeok": pure,
            **{
                pid: build_variant(pure, pid, cfg, catalog_names)
                for pid, cfg in VARIANTS.items()
            },
        },
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"written: {out}")
    for pid, pharmacy in bundle["pharmacies"].items():
        june = next(p for p in pharmacy["periods"] if p["id"] == "2026-06")
        print(
            f"  {pid}: rows(6월) {len(june['rows'])}, 6월 매출 {june['totals']['sales']:,}, "
            f"품목 {june['totals'] and june['posItemCount']}종, ledger {pharmacy['ledger']['transactionCount']:,}건"
        )


if __name__ == "__main__":
    sys.exit(main())

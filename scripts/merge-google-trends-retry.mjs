import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const signalsPath = path.join(root, "app", "signals.json");
const signals = JSON.parse(fs.readFileSync(signalsPath, "utf8"));
const products = new Map(signals.products.map((product) => [product.id, product]));

const attempts = [
  ["public-genabelle-pdrn-vita-toning-ampoule", "제나벨 PDRN 비타 토닝 앰플", "2026-07-21T07:25:17.828Z"],
  ["public-rxme-rejuyoung-pdrn-10000-cream", "리쥬영 PDRN 10000 크림", "2026-07-21T07:25:33.560Z"],
  ["public-rxme-juvekle-pdlla-10000-cream", "쥬베클 PDLLA 10000 크림", "2026-07-21T07:25:48.902Z"],
  ["public-deesse-pdrn-2000-cream", "디에스 PDRN 2000 크림", "2026-07-21T07:26:04.213Z"],
  ["public-medipeel-melanon-x-ampoule", "메디필 멜라논 엑스 앰플 18.9", "2026-07-21T07:26:49.127Z"],
  ["public-medipeel-melanon-x-cream", "메디필 멜라논 엑스 크림", "2026-07-21T07:27:04.843Z"],
  ["public-medipeel-retinal-nmn-booster", "메디필 레티날 NMN 바운스 샷 부스터", "2026-07-21T07:27:20.167Z"],
  ["public-medipeel-retinal-nmn-eye-cream", "메디필 레티날 NMN 바운스 샷 아이 크림", "2026-07-21T07:27:35.484Z"],
  ["public-elravie-re2o-ecm-active-ampoule", "엘라비에 리투오 ECM 액티브 앰플", "2026-07-21T07:27:59.486Z"],
  ["public-elravie-re2o-ecm-booster-cream", "엘라비에 리투오 ECM 부스터 크림", "2026-07-21T07:28:14.825Z"],
  ["public-elravie-re2o-ecm-skinfit-bb", "엘라비에 리투오 ECM 스킨핏 비비", "2026-07-21T07:28:30.241Z"],
  ["public-fmk-rejuvenating-pdrn-kit", "fmk 리쥬네이팅 PDRN 키트", "2026-07-21T07:28:45.567Z"],
  ["public-fmk-brightening-vita-kit", "fmk 브라이트닝 Vit+ 키트", "2026-07-21T07:29:00.868Z"],
];

const vitaValues = [
  ["2025-07-20",81],["2025-07-27",86],["2025-08-03",80],["2025-08-10",81],
  ["2025-08-17",97],["2025-08-24",92],["2025-08-31",83],["2025-09-07",93],
  ["2025-09-14",81],["2025-09-21",95],["2025-09-28",84],["2025-10-05",69],
  ["2025-10-12",74],["2025-10-19",81],["2025-10-26",82],["2025-11-02",93],
  ["2025-11-09",94],["2025-11-16",91],["2025-11-23",95],["2025-11-30",88],
  ["2025-12-07",85],["2025-12-14",86],["2025-12-21",86],["2025-12-28",78],
  ["2026-01-04",84],["2026-01-11",85],["2026-01-18",90],["2026-01-25",87],
  ["2026-02-01",81],["2026-02-08",77],["2026-02-15",69],["2026-02-22",85],
  ["2026-03-01",88],["2026-03-08",82],["2026-03-15",95],["2026-03-22",100],
  ["2026-03-29",91],["2026-04-05",83],["2026-04-12",76],["2026-04-19",68],
  ["2026-04-26",72],["2026-05-03",78],["2026-05-10",96],["2026-05-17",88],
  ["2026-05-24",81],["2026-05-31",86],["2026-06-07",77],["2026-06-14",72],
  ["2026-06-21",70],["2026-06-28",82],["2026-07-05",86],["2026-07-12",80],
  ["2026-07-19",73],
].map(([date, value]) => ({ date, value }));

const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;

for (const [id, query, collectedAt] of attempts) {
  const product = products.get(id);
  if (!product) throw new Error(`Google Trends 대상 제품을 찾을 수 없음: ${id}`);
  const sourceUrl = `https://trends.google.com/trends/explore?date=today%2012-m&geo=KR&q=${encodeURIComponent(query)}`;
  const common = {
    collectedAt,
    method: "google_trends_logged_in_browser",
    query,
    attemptedQueries: [query],
    sourceUrl,
    sourceUrls: [sourceUrl],
    period: "대한민국 · 최근 12개월 · 웹 검색",
  };

  if (id !== "public-fmk-brightening-vita-kit") {
    product.google = {
      status: "no_data",
      ...common,
      pointCount: 0,
      recent4WeekAverage: null,
      previous4WeekAverage: null,
      changePct: null,
      latest: null,
      peak: null,
      values: [],
      note: "Google Trends 화면에 ‘표시할 데이터가 없습니다.’가 표시됨",
    };
    continue;
  }

  const numbers = vitaValues.map(({ value }) => value);
  const recent4WeekAverage = average(numbers.slice(-4));
  const previous4WeekAverage = average(numbers.slice(-8, -4));
  product.google = {
    status: "collected",
    ...common,
    pointCount: vitaValues.length,
    recent4WeekAverage,
    previous4WeekAverage,
    changePct: Math.round(((recent4WeekAverage - previous4WeekAverage) / previous4WeekAverage) * 1000) / 10,
    latest: numbers.at(-1),
    peak: Math.max(...numbers),
    values: vitaValues,
    note: null,
  };
}

signals.collectedAt = attempts.at(-1)[2];
fs.writeFileSync(signalsPath, `${JSON.stringify(signals, null, 2)}\n`, "utf8");
console.log("MERGED: Google Trends 13개 제품 (collected 1, no_data 12, rate_limited 0)");

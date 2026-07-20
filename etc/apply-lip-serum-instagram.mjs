import fs from "node:fs";

const path = new URL("../app/signals.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const product = data.products.find(
  (item) => item.id === "dr-rejuall-pdrn-lip-serum",
);

product.instagram = {
  status: "collected",
  collectedAt: "2026-07-14T19:08:20+09:00",
  method: "logged_in_browser",
  query: "#닥터리쥬올",
  sourceUrl: "https://www.instagram.com/explore/tags/닥터리쥬올/",
  inspectedCount: 21,
  acceptedCount: 4,
  totals: { likes: 237, comments: 4, reposts: 13 },
  independentTotals: { likes: 234, comments: 4, reposts: 13 },
  classificationCounts: { independent: 3, sponsored: 1, official: 0 },
  items: [
    {
      id: "DUH_Rf-EX85",
      url: "https://www.instagram.com/p/DUH_Rf-EX85/",
      account: "dailybeauty.drop",
      publishedAt: "2026-01-30T06:30:10.000Z",
      likes: 217,
      comments: 2,
      reposts: 13,
      classification: "independent_editorial",
      relevance: "PDRN 립 세럼의 전국 품절 반응을 소개한 뷰티 콘텐츠",
    },
    {
      id: "DTSWVsYEWsl",
      url: "https://www.instagram.com/p/DTSWVsYEWsl/",
      account: "central_yaksa",
      publishedAt: "2026-01-09T10:34:25.000Z",
      likes: 12,
      comments: 0,
      reposts: 0,
      classification: "independent_retailer",
      relevance: "약국이 PDRN 립 세럼 판매와 용도를 직접 안내한 콘텐츠",
    },
    {
      id: "DUFYrGEiQnq",
      url: "https://www.instagram.com/p/DUFYrGEiQnq/",
      account: "swstar_pharm",
      publishedAt: "2026-01-29T06:14:24.000Z",
      likes: 5,
      comments: 2,
      reposts: 0,
      classification: "independent_retailer",
      relevance: "약국이 PDRN 립 세럼을 포함한 제품군을 소개한 콘텐츠",
    },
    {
      id: "DV0aoDED4P3",
      url: "https://www.instagram.com/p/DV0aoDED4P3/",
      account: "jamsun__c",
      publishedAt: "2026-03-13T09:07:11.000Z",
      likes: 3,
      comments: 0,
      reposts: 0,
      classification: "sponsored",
      relevance: "#협찬이 명시된 닥터리쥬올 약국 립밤 콘텐츠",
    },
  ],
  scoringNote: "독립 콘텐츠만 수요 점수 후보로 사용하고 협찬 콘텐츠는 별도 표시",
};

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");

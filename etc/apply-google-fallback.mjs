import fs from "node:fs";

const path = new URL("../app/signals.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const evidence = {
  "도미나크림": [
    "https://www.newspim.com/news/view/20260227000083",
    "https://pandarank.net/contents/690b46dff4304f591f2cc188",
  ],
  "리안정안액 30튜브": [
    "https://pharmaresearch.co.kr/file_download.php?filename=9808450398.pdf&filepath=data&origin_filename=%5B%ED%8C%8C%EB%A7%88%EB%A6%AC%EC%84%9C%EC%B9%98%5D%EC%82%AC%EC%97%85%EB%B3%B4%EA%B3%A0%EC%84%9C2022.03.17.pdf",
    "https://www.eugenefn.com/common/files/amail/20240808_B3520_tena_1.pdf",
  ],
  "이지덤 뷰티": [
    "https://dpg.danawa.com/mobile/news/view?boardSeq=245&listSeq=5077424&past=Y",
    "https://toyoumylife.tistory.com/24",
  ],
  "이지덤밴드 뷰티 픽카밍 6매": [
    "https://catalog.11st.co.kr/pc/357764662?poc=pc&sortCds=DLV_INCLUDE",
    "https://alltimeprice.com/product/?pid=7828497644-91191806646",
  ],
};

for (const product of data.products) {
  const urls = evidence[product.name];
  if (!urls) continue;
  product.google = {
    status: "collected",
    method: "search_fallback_verified",
    collectedAt: "2026-07-14T19:22:00+09:00",
    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(product.name)}`,
    sourceUrls: [`https://www.google.com/search?q=${encodeURIComponent(product.name)}`],
    organicResultSampleCount: urls.length,
    sampleUrls: urls,
    deduplication: "검색 결과 URL 기준 중복 제거",
  };
}

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");

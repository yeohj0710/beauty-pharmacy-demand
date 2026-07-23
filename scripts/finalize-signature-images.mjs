// 선별된 시그니처 품목 이미지를 내려받아 app/signature-assets.json으로 확정한다.
// 후보 검색으로 공식 이미지를 얻지 못한 품목은 MANUAL에 직접 확인한 출처를 둔다.
import fs from "node:fs/promises";
import path from "node:path";

const picks = JSON.parse(
  await fs.readFile("etc/signature-image-picks.json", "utf8"),
);
const items = JSON.parse(
  await fs.readFile("scripts/signature-product-sources.json", "utf8"),
);

// 이미지 검색 후보에 공식/판매몰 결과가 없어 직접 확인한 출처
const MANUAL = {
  "sig-vt-riddle-shot": {
    sourcePageUrl: "https://vt-cosmetics.com/product/%EB%A6%AC%EB%93%A4%EC%83%B7-100/769",
    sourceImageUrl: "https://vt-cosmetics.com/web/product/big/202607/ed05f9a0a38720348c951d0c8c08b24f.jpg",
    sourceTitle: "리들샷 100 — 브이티코스메틱 공식몰",
    sourceType: "official-brand",
  },
  "sig-aronamin-gold": {
    sourcePageUrl: "https://www.thepharmacy.co.kr/%EC%95%84%EB%A1%9C%EB%82%98%EB%AF%BC-%EA%B3%A8%EB%93%9C",
    sourceImageUrl: "https://www.thepharmacy.co.kr/wp-content/uploads/2021/02/%EC%95%84%EB%A1%9C%EB%82%98%EB%AF%BC-%EA%B3%A8%EB%93%9C-WM-%EC%82%AC%EC%A7%8431.jpg",
    sourceTitle: "아로나민 골드 — 더파머시",
    sourceType: "retailer",
  },
  // 검색 1순위는 성분표 이미지였다. 공식몰의 단독 제품컷으로 교체한다.
  "sig-ludient-recode": {
    sourcePageUrl: "https://theludient.co.kr/BEST/?idx=14",
    sourceImageUrl:
      "https://cdn-optimized.imweb.me/thumbnail/20260408/ad066831886bb.jpg?w=800",
    sourceTitle: "RE-CODE CREAM — 루디언트 공식몰",
    sourceType: "official-brand",
  },
  "sig-impactamin": {
    sourcePageUrl: "https://barkiri.com/products/p16",
    sourceImageUrl:
      "https://imagedelivery.net/SJfchtznPkhOJzvVd6Drkw/barkiri/product/p16/w=1000,f=webp",
    sourceTitle: "임팩타민 프리미엄정 60정 — 발키리",
    sourceType: "retailer",
  },
};

const byId = new Map(picks.map((pick) => [pick.entityId, pick]));
// 검색 결과가 http로 오는 경우가 있어 https로 통일한다(모두 https로 접근 가능).
const https = (url) => url.replace(/^http:\/\//, "https://");
const assets = items.map((item) => {
  const manual = MANUAL[item.id];
  const pick = byId.get(item.id);
  const source = manual ?? pick;
  if (!source) throw new Error(`출처 없음: ${item.id}`);
  return {
    entityId: item.id,
    productName: item.name,
    brand: item.brand,
    sourcePageUrl: https(source.sourcePageUrl),
    sourceImageUrl: https(source.sourceImageUrl),
    sourceTitle: source.sourceTitle ?? "",
    sourceType: source.sourceType,
    localImagePath: "",
  };
});

const outputDir = "public/product-images";
const extensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);
await fs.mkdir(outputDir, { recursive: true });

// content-type을 제대로 주지 않는 서버가 있어 매직 바이트로 실제 포맷을 확인한다.
const sniff = (buffer) => {
  if (buffer.length < 12) return "";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return ".png";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return ".webp";
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") return ".gif";
  return "";
};

let failures = 0;
for (const asset of assets) {
  try {
    const attempt = (referer) =>
      fetch(asset.sourceImageUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0 Safari/537.36",
          ...(referer ? { referer } : {}),
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "accept-language": "ko-KR,ko;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
    // 일부 CDN은 리퍼러가 붙으면 차단하므로 리퍼러 없이 한 번 더 시도한다.
    const response = await attempt(asset.sourcePageUrl).catch(() => attempt(""));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = (response.headers.get("content-type") || "").split(";")[0];
    const body = Buffer.from(await response.arrayBuffer());
    const sniffed = sniff(body);
    if ((!type.startsWith("image/") && !sniffed) || body.length < 2_000) {
      throw new Error(`${type || "unknown"}, ${body.length} bytes`);
    }
    const ext =
      extensions.get(type) ||
      sniffed ||
      path.extname(new URL(response.url).pathname).toLowerCase() ||
      ".img";
    const file = `${asset.entityId}${ext}`;
    await fs.writeFile(path.join(outputDir, file), body);
    asset.localImagePath = `/product-images/${file}`;
    asset.downloadBytes = body.length;
    console.log(
      `OK   ${asset.entityId.padEnd(24)} ${Math.round(body.length / 1024)}KB ${asset.sourceType}`,
    );
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${asset.entityId} ${error.message}`);
  }
}

await fs.writeFile(
  "app/signature-assets.json",
  `${JSON.stringify(assets, null, 1)}\n`,
);
console.log(`\n확정 ${assets.length - failures}/${assets.length}건`);
if (failures) process.exitCode = 1;

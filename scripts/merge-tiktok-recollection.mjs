import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entitiesPath = path.join(root, "app", "demand-entities.json");
const signalsPath = path.join(root, "app", "signals.json");
const discoveryPath = path.join(root, "etc", "tiktok-recollection.json");
const reviewPath = path.join(root, "etc", "tiktok-recollection-review.json");
const dryRun = process.argv.includes("--dry-run");
const referenceNow = new Date();
const cutoff = new Date(referenceNow.getTime() - 180 * 86_400_000);

const entities = JSON.parse(fs.readFileSync(entitiesPath, "utf8"));
const discovery = JSON.parse(fs.readFileSync(discoveryPath, "utf8"));
const signals = JSON.parse(fs.readFileSync(signalsPath, "utf8"));
const products = new Map(signals.products.map((product) => [product.id, product]));

const normalize = (value) =>
  (value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "");

const tokens = (value) =>
  (value || "").normalize("NFC").toLowerCase().match(/[0-9a-z가-힣]+/g) || [];

const genericTokens = new Set([
  "크림", "세럼", "연고", "앰플", "마스크", "선스크린", "에센스", "로션", "겔", "젤",
  "액", "정제", "캡슐", "연질캡슐", "점안액", "키트", "패치", "스팟", "샷", "부스터",
  "아이", "비비", "선", "프로", "플러스", "데일리", "카밍", "릴리프", "파워", "글로우",
  "브라이트닝", "리쥬네이팅", "토닝", "액티브", "뷰티", "마일드", "쿨", "대형", "중형",
  "소형", "약국", "제품", "화장품", "pdrn", "피디알엔", "pdlla", "피디엘엘에이", "ecm",
  "nmn", "retinal", "레티날", "vitamin", "비타민", "콜라겐", "beauty", "clear", "rice",
  "beta", "glucan", "barrier", "centella", "calming", "daily", "cover", "scalp", "bio",
  "activating", "peptide", "serum", "moist", "tone", "sun", "brightening", "firming", "deep",
  "days", "pharmacy", "advance", "reedle", "15ml", "30ml",
]);

const tokenOwners = new Map();
for (const entity of entities) {
  const values = [entity.name, ...entity.keywords, ...(entity.sourceAliases || [])];
  for (const token of new Set(values.flatMap(tokens))) {
    if (token.length < 3 || genericTokens.has(token) || /^\d+$/.test(token)) continue;
    if (!tokenOwners.has(token)) tokenOwners.set(token, new Set());
    tokenOwners.get(token).add(entity.id);
  }
}

function parseVisibleCount(text) {
  if (!text) return null;
  const match = text.replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*(만|천|[KMB])?$/i);
  if (!match) return null;
  const multipliers = { 만: 10_000, 천: 1_000, k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  return Math.round(Number(match[1]) * (multipliers[(match[2] || "").toLowerCase()] || 1));
}

function parseVisibleDate(text, collectedAt, videoId) {
  let match;
  if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  if ((match = text.match(/^(\d{1,2})-(\d{1,2})$/))) {
    return `${referenceNow.getFullYear()}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  if (!/^(\d+)(시간|일|주) 전$/.test(text) || !/^\d+$/.test(videoId)) return null;
  // TikTok 동영상 ID 상위 32비트는 게시 Unix 초다. 상대 날짜를 추정하지 않고
  // 화면에 보이는 원본 URL의 ID에서 정확한 게시일(한국 시간)을 복원한다.
  const publishedMs = Number(BigInt(videoId) >> 32n) * 1000 + 9 * 3_600_000;
  return new Date(publishedMs).toISOString().slice(0, 10);
}

function classify(context, account, brand) {
  if (/협찬 광고 포함|#광고|#협찬|#제품제공|sponsored|paid partnership/i.test(context)) return "sponsored";
  const normalizedAccount = normalize(account);
  const normalizedBrand = normalize(brand);
  if (/official/i.test(account) || (normalizedBrand.length >= 4 && normalizedAccount.includes(normalizedBrand))) {
    return "official";
  }
  return "independent";
}

function identity(entity) {
  const exact = [
    entity.name,
    ...entity.keywords,
    ...(entity.sourceAliases || []),
    ...(entity.skuNames || []),
  ].map(normalize).filter((value) => value.length >= 4);
  return { exact };
}

function matchesApprovedAlias(entityId, context) {
  const haystack = normalize(context);
  switch (entityId) {
    case "catalog-045":
      return haystack.includes("타이레놀");
    case "public-boj-clear-rice-sunscreen":
      return haystack.includes("조선미녀") && haystack.includes("맑은쌀선크림");
    case "public-vt-retinal-pro-cream":
      return (haystack.includes("vt") || haystack.includes("브이티")) && haystack.includes("레티날프로크림");
    case "public-rxme-rejuyoung-pdrn-10000-cream":
      return haystack.includes("리쥬영") && (haystack.includes("pdrn") || haystack.includes("피디알엔"));
    default:
      return false;
  }
}

function matchesProductSpecificity(entityId, context) {
  const haystack = normalize(context);
  switch (entityId) {
    case "dr-rejuall-pdrn-cream":
      return (haystack.includes("rejuall") || haystack.includes("리쥬올")) &&
        ["pdrn", "피디알엔", "rejuvenating", "1200ppm", "purin", "푸린"].some((term) => haystack.includes(term));
    case "dr-rejuall-pdrn-lip-serum":
      return (haystack.includes("rejuall") || haystack.includes("리쥬올")) &&
        (haystack.includes("lipserum") || haystack.includes("립세럼"));
    case "melatoning-cream":
      return haystack.includes("멜라토닝크림");
    case "public-vt-retinal-peptide-serum":
      return (haystack.includes("vt") || haystack.includes("브이티")) &&
        haystack.includes("retinal") && haystack.includes("peptide") && haystack.includes("serum");
    case "public-vt-retinal-pro-cream":
      return (haystack.includes("vt") || haystack.includes("브이티")) &&
        (haystack.includes("retinalprocream") || haystack.includes("레티날프로크림"));
    default:
      return true;
  }
}

function mergeProduct(entity, draft) {
  const { exact } = identity(entity);
  const excluded = (entity.exclude || []).map(normalize).filter(Boolean);
  const candidates = [];
  const seen = new Set();
  let inspectedCount = 0;

  for (const query of draft.queries) {
    inspectedCount += query.reviewedCount;
    for (const raw of query.items) {
      if (seen.has(raw.url)) continue;
      seen.add(raw.url);
      const lines = raw.context.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const accountMatch = raw.url.match(/tiktok\.com\/@([^/]+)\/video\/(\d+)/);
      if (!accountMatch) continue;
      const [, account, id] = accountMatch;
      const publishedAt = parseVisibleDate(lines.at(-1) || "", query.collectedAt, id);
      const publishedDate = publishedAt ? new Date(`${publishedAt}T00:00:00+09:00`) : null;
      const haystack = normalize(raw.context);
      const exactMatch = exact.find((term) => haystack.includes(term));
      const aliasMatch = matchesApprovedAlias(entity.id, raw.context);
      const matched = exactMatch || aliasMatch;
      const hasExcludedTerm = excluded.some((term) => haystack.includes(term));
      if (!publishedDate || publishedDate < cutoff || !matched || hasExcludedTerm || !matchesProductSpecificity(entity.id, raw.context)) continue;

      candidates.push({
        id,
        url: raw.url,
        account,
        publishedAt,
        collectedAt: query.collectedAt,
        views: parseVisibleCount(raw.viewsText),
        likes: null,
        comments: null,
        reposts: null,
        saves: null,
        classification: classify(raw.context, account, entity.brand),
        _evidence: {
          query: query.query,
          rank: raw.rank,
          matchReason: exactMatch ? "exact_identifier" : "approved_alias_pattern",
          visibleText: raw.context,
        },
      });
    }
  }

  candidates.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a._evidence.rank - b._evidence.rank);
  const accepted = candidates.slice(0, 10);
  const items = accepted.map(({ _evidence, ...item }) => item);
  const totals = {
    views: items.reduce((sum, item) => sum + (item.views || 0), 0),
    likes: 0,
    comments: 0,
    reposts: 0,
    saves: 0,
  };
  const collectedAt = draft.queries.map((query) => query.collectedAt).sort().at(-1);
  const attemptedQueries = draft.queries.map((query) => query.query);
  return {
    record: {
      status: items.length ? "collected" : "no_relevant_results",
      collectedAt,
      method: "public_browser_visible_results",
      query: attemptedQueries[0],
      attemptedQueries,
      sourceUrl: draft.queries[0].sourceUrl,
      sourceUrls: draft.queries.map((query) => query.sourceUrl),
      inspectedCount,
      acceptedCount: items.length,
      rejectedCount: Math.max(0, seen.size - items.length),
      errorCount: 0,
      totals,
      items,
      scoringNote: "공개 TikTok 검색 화면에서 제품 식별어와 게시일을 확인한 최근 180일 결과만 집계",
    },
    review: {
      productId: entity.id,
      name: entity.name,
      attemptedQueries,
      uniqueCandidates: seen.size,
      acceptedCount: items.length,
      accepted: accepted.map((item) => ({ ...item._evidence, id: item.id, url: item.url, publishedAt: item.publishedAt, views: item.views, classification: item.classification })),
    },
  };
}

const reviews = [];
for (const entity of entities.filter((item) => item.keywords.length >= 2)) {
  const draft = discovery.products[entity.id];
  if (!draft) throw new Error(`TikTok 재수집 초안 누락: ${entity.id}`);
  const { record, review } = mergeProduct(entity, draft);
  reviews.push(review);
  if (!dryRun) products.get(entity.id).tiktok = record;
}

fs.writeFileSync(reviewPath, `${JSON.stringify(reviews, null, 2)}\n`, "utf8");
if (!dryRun) {
  signals.collectedAt = new Date().toISOString();
  fs.writeFileSync(signalsPath, `${JSON.stringify(signals, null, 2)}\n`, "utf8");
}

const accepted = reviews.reduce((sum, item) => sum + item.acceptedCount, 0);
const withResults = reviews.filter((item) => item.acceptedCount > 0).length;
const relativeDates = reviews.flatMap((item) => item.accepted).filter((item) => /전$/.test(item.visibleText.split(/\r?\n/).filter(Boolean).at(-1) || ""));
console.log(`${dryRun ? "DRY RUN" : "MERGED"}: 87개 제품, 채택 ${accepted}개, 결과 있음 ${withResults}개, 상대 날짜 ${relativeDates.length}개`);

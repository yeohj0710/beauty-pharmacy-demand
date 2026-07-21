import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entities = JSON.parse(fs.readFileSync(path.join(root, "app", "demand-entities.json"), "utf8"));
const signalsPath = path.join(root, "app", "signals.json");
const signals = JSON.parse(fs.readFileSync(signalsPath, "utf8"));
const discovery = JSON.parse(fs.readFileSync(path.join(root, "etc", "instagram-recollection.json"), "utf8"));
const details = JSON.parse(fs.readFileSync(path.join(root, "etc", "instagram-detail-metadata.json"), "utf8"));
const reviewPath = path.join(root, "etc", "instagram-recollection-review.json");
const dryRun = process.argv.includes("--dry-run");
const cutoff = new Date(Date.now() - 180 * 86_400_000);
const products = new Map(signals.products.map((product) => [product.id, product]));

const normalize = (value) =>
  (value || "").normalize("NFC").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");

function parseVisibleCount(text) {
  if (!text) return null;
  const match = text.replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*(만|천|[KMB])?$/i);
  if (!match) return null;
  const multipliers = { 만: 10_000, 천: 1_000, k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  return Math.round(Number(match[1]) * (multipliers[(match[2] || "").toLowerCase()] || 1));
}

function visibleMetrics(detail) {
  const labels = (detail.toolbar?.labels || []).filter((label) =>
    ["좋아요", "댓글 달기", "리포스트"].includes(label),
  );
  const values = (detail.toolbar?.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = { likes: null, comments: null, reposts: null };
  labels.forEach((label, index) => {
    const field = label === "좋아요" ? "likes" : label === "댓글 달기" ? "comments" : "reposts";
    result[field] = parseVisibleCount(values[index]);
  });
  return result;
}

function classify(caption, account, brand) {
  const commercialSale = /(?:\u53f0\u7063\u7e3d\u4ee3\u7406\u4f9b\u8ca8|\u6b63\u54c1\u4fdd\u8b49|\u514d\u904b)/i.test(caption)
    && /(?:\$\s*\d+|\+\s*1|\u50f9\u683c|\u7279\u50f9)/i.test(caption);
  if (commercialSale) return "sponsored";
  if (/유료 광고|광고 포함|(?:^|[\s(#])광고(?:[\s)#]|$)|#협찬|#제품제공|제품 제공|paid partnership|sponsored|gifted|#ad\b/im.test(caption)) {
    return "sponsored";
  }
  const normalizedAccount = normalize(account);
  const normalizedBrand = normalize(brand);
  if (/official/i.test(account) || (normalizedBrand.length >= 4 && normalizedAccount.includes(normalizedBrand))) {
    return "official";
  }
  return "independent";
}

function cleanCaptionLines(caption, account) {
  const lines = caption.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length && normalize(lines[0]) === normalize(account)) lines.shift();
  while (lines.length && /^(?:\uC218\uC815\uB428|[\u2022\u00B7]|\d+\s*(?:\uCD08|\uBD84|\uC2DC\uAC04|\uC77C|\uC8FC)(?:\s*\uC804)?)$/.test(lines[0])) {
    lines.shift();
  }
  return lines;
}

function mergeProduct(entity, draft) {
  const exactIdentifiers = [
    entity.name,
    ...entity.keywords,
    ...(entity.sourceAliases || []),
    ...(entity.skuNames || []),
  ].map(normalize).filter((value) => value.length >= 4);
  const excluded = (entity.exclude || []).map(normalize).filter(Boolean);
  const byUrl = new Map();
  let inspectedCount = 0;

  for (const query of draft.queries) {
    inspectedCount += query.reviewedCount;
    for (const raw of query.items) {
      if (!byUrl.has(raw.url)) byUrl.set(raw.url, { raw, query });
    }
  }

  const candidates = [];
  for (const [url, { raw, query }] of byUrl) {
    const detail = details.items[url];
    if (!detail?.publishedAt || !detail.caption) continue;
    const published = new Date(detail.publishedAt);
    if (Number.isNaN(published.getTime()) || published < cutoff) continue;
    const haystack = normalize(detail.caption);
    if (!exactIdentifiers.some((identifier) => haystack.includes(identifier))) continue;
    if (excluded.some((term) => haystack.includes(term))) continue;

    const metrics = visibleMetrics(detail);
    const viewLabel = (detail.viewLabels || [])[0] || raw.viewsText;
    const views = parseVisibleCount(viewLabel);
    const id = url.match(/\/(?:p|reel|reels)\/([^/]+)/)?.[1] || url;
    const captionLines = cleanCaptionLines(detail.caption, detail.account || "");
    const description = captionLines.join("\n") || detail.caption;
    candidates.push({
      item: {
        id,
        url,
        account: detail.account,
        publishedAt: detail.publishedAt,
        collectedAt: query.collectedAt,
        title: captionLines[0] || description.slice(0, 160),
        description,
        views,
        likes: metrics.likes,
        comments: metrics.comments,
        classification: classify(detail.caption, detail.account || "", entity.brand || ""),
      },
      evidence: {
        query: query.query,
        rank: raw.rank,
        contentType: raw.contentType,
        viewsText: viewLabel || null,
        toolbarText: detail.toolbar?.text || null,
        caption: detail.caption,
      },
    });
  }

  candidates.sort((a, b) =>
    b.item.publishedAt.localeCompare(a.item.publishedAt) || a.evidence.rank - b.evidence.rank,
  );
  const accepted = candidates.slice(0, 10);
  const items = accepted.map((entry) => entry.item);
  const attemptedQueries = draft.queries.map((query) => query.query);
  const collectedAt = draft.queries.map((query) => query.collectedAt).sort().at(-1);
  const totals = {
    views: items.reduce((sum, item) => sum + (item.views || 0), 0),
    likes: items.reduce((sum, item) => sum + (item.likes || 0), 0),
    comments: items.reduce((sum, item) => sum + (item.comments || 0), 0),
  };
  return {
    record: {
      status: items.length ? "collected" : "no_relevant_results",
      collectedAt,
      method: "logged_in_browser_visible_results",
      query: attemptedQueries[0],
      attemptedQueries,
      sourceUrl: draft.queries[0].sourceUrl,
      sourceUrls: draft.queries.map((query) => query.sourceUrl),
      inspectedCount,
      acceptedCount: items.length,
      rejectedCount: Math.max(0, byUrl.size - items.length),
      errorCount: 0,
      totals,
      items,
      scoringNote: "로그인된 Instagram 검색·상세 화면에서 제품 식별어와 게시일을 확인한 최근 180일 결과만 집계; 미표시 조회수는 null",
    },
    review: {
      productId: entity.id,
      name: entity.name,
      attemptedQueries,
      uniqueCandidates: byUrl.size,
      acceptedCount: items.length,
      accepted: accepted.map((entry) => ({ ...entry.evidence, ...entry.item })),
    },
  };
}

const reviews = [];
for (const [entityId, draft] of Object.entries(discovery.products)) {
  const entity = entities.find((item) => item.id === entityId);
  if (!entity) throw new Error(`Instagram 대상 제품을 찾을 수 없음: ${entityId}`);
  const { record, review } = mergeProduct(entity, draft);
  reviews.push(review);
  if (!dryRun) products.get(entityId).instagram = record;
}

fs.writeFileSync(reviewPath, `${JSON.stringify(reviews, null, 2)}\n`, "utf8");
if (!dryRun) {
  signals.collectedAt = new Date().toISOString();
  fs.writeFileSync(signalsPath, `${JSON.stringify(signals, null, 2)}\n`, "utf8");
}

const acceptedCount = reviews.reduce((sum, item) => sum + item.acceptedCount, 0);
const withResults = reviews.filter((item) => item.acceptedCount > 0).length;
const visibleViews = reviews.flatMap((item) => item.accepted).filter((item) => item.views !== null).length;
console.log(`${dryRun ? "DRY RUN" : "MERGED"}: 30개 제품, 채택 ${acceptedCount}개, 결과 있음 ${withResults}개, 조회수 표시 ${visibleViews}개`);

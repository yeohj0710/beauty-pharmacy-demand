import encrypted from "./pharmacy-sales.enc.json";

export type SalesRow = {
  rank: number;
  name: string;
  maker: string;
  qty: number;
  qtyShare: number;
  sales: number;
  salesShare: number;
  discount: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  qty30: number | null;
  sales30: number | null;
  profit30: number | null;
};

export type SalesPeriod = {
  id: string;
  label: string;
  start: string;
  end: string;
  days: number;
  estimated: boolean;
  posItemCount: number | null;
  totals: {
    qty: number | null;
    sales: number | null;
    discount: number | null;
    cost: number | null;
    profit: number | null;
    marginPct: number | null;
    sales30: number | null;
    profit30: number | null;
  };
  rowSalesCoveragePct: number | null;
  rows: SalesRow[];
};

export type ProductInfo = {
  category: string;
  group: string;
  brand: string;
  feature: string;
  use: string;
  reviewStatus: string;
};

export type PharmacySales = {
  pharmacyId: string;
  pharmacyName: string;
  sourceNote: string;
  estimateNote: string;
  extractedAt: string;
  ledger: {
    start: string;
    end: string;
    transactionCount: number;
    totalQty: number;
    totalSales: number;
  };
  periods: SalesPeriod[];
  products: Record<string, ProductInfo>;
};

export type Pharmacy = {
  id: string;
  name: string;
  area: string;
  tier: "flagship" | "standard";
  tags: string[];
  status: "live" | "restricted";
};

// 지점 디렉터리 — 상호·주소는 카카오맵 등록 정보 기준(2026-07 확인).
// 실매출이 연동된 곳은 성수역퓨어약국 하나이며, 나머지 지점은
// 열람 권한이 별도라 이 화면에서 수치를 제공하지 않는다.
export const pharmacies: Pharmacy[] = [
  {
    id: "pure-seongsuyeok",
    name: "성수역퓨어약국",
    area: "서울 성동구 성수이로20길 3",
    tier: "flagship",
    tags: ["뷰티 특화", "성수 상권", "POS 실매출 연동"],
    status: "live",
  },
  {
    id: "radiyoung-myeongdong",
    name: "명동레디영약국",
    area: "서울 중구 명동8나길 7",
    tier: "flagship",
    tags: ["관광상권 대형", "K-뷰티 특화"],
    status: "restricted",
  },
  {
    id: "verynew-myeongdong",
    name: "명동베리뉴약국",
    area: "서울 중구 명동8길 18",
    tier: "standard",
    tags: ["관광상권", "연중무휴"],
    status: "restricted",
  },
  {
    id: "greencircle-jayang",
    name: "그린서클약국",
    area: "서울 광진구 아차산로 212",
    tier: "standard",
    tags: ["로컬 상권"],
    status: "restricted",
  },
];

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

// 매출 데이터는 저장소·번들에 AES-256-GCM 암호문으로만 실린다.
// 열람 암호가 맞을 때만 복호화에 성공한다(GCM 무결성 검증 실패 시 예외).
export async function decryptPharmacySales(
  password: string,
): Promise<PharmacySales> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(encrypted.salt),
      iterations: encrypted.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(encrypted.iv) },
    key,
    fromBase64(encrypted.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as PharmacySales;
}

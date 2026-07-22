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

// 지점 디렉터리. 실매출이 연동된 곳은 퓨어약국 성수점 하나이며,
// 나머지 지점은 열람 권한이 별도라 이 화면에서 수치를 제공하지 않는다.
export const pharmacies: Pharmacy[] = [
  {
    id: "pure-seongsu",
    name: "퓨어약국 성수점",
    area: "서울 성동구 성수동",
    tier: "flagship",
    tags: ["뷰티 특화", "외국인 관광 상권", "POS 실매출 연동"],
    status: "live",
  },
  {
    id: "radiyoung-myeongdong",
    name: "래디영약국 명동점",
    area: "서울 중구 명동",
    tier: "flagship",
    tags: ["관광상권 대형", "K-뷰티 특화"],
    status: "restricted",
  },
  {
    id: "verynew-myeongdong",
    name: "베리뉴약국 명동점",
    area: "서울 중구 명동",
    tier: "standard",
    tags: ["관광상권"],
    status: "restricted",
  },
  {
    id: "myeongdong-jungang",
    name: "명동중앙약국",
    area: "서울 중구 명동",
    tier: "standard",
    tags: ["로컬 상권"],
    status: "restricted",
  },
  {
    id: "seongsuyeok",
    name: "성수역약국",
    area: "서울 성동구 성수동",
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

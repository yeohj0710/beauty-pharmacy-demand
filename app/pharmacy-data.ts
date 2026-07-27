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

export type PharmacyDataFile = {
  v: number;
  extractedAt: string;
  pharmacies: Record<string, PharmacySales>;
};

export type Pharmacy = {
  id: string;
  name: string;
  area: string;
  tier: "flagship" | "standard";
  tags: string[];
};

// 공개 지점 디렉터리 — 약국명은 공개하고 상세 주소는 상권 단위로 표시한다.
export const pharmacies: Pharmacy[] = [
  {
    id: "pure-seongsuyeok",
    name: "성수퓨어약국",
    area: "서울 동부 · 플래그십",
    tier: "flagship",
    tags: ["뷰티 특화", "성수 상권"],
  },
  {
    id: "radiyoung-myeongdong",
    name: "명동레디영약국",
    area: "명동 상권 · 플래그십",
    tier: "flagship",
    tags: ["관광상권 대형", "K-뷰티 특화"],
  },
  {
    id: "verynew-myeongdong",
    name: "명동베리뉴약국",
    area: "명동 상권 · 스탠더드",
    tier: "standard",
    tags: ["관광상권", "연중무휴"],
  },
  {
    id: "greencircle-jayang",
    name: "그린서클약국",
    area: "서울 동부 · 스탠더드",
    tier: "standard",
    tags: ["로컬 상권"],
  },
];

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const SALES_REPORTING_START = "2026-04-01";

function hidePreOpeningSales(data: PharmacyDataFile): PharmacyDataFile {
  return {
    ...data,
    pharmacies: Object.fromEntries(
      Object.entries(data.pharmacies).map(([id, pharmacy]) => [
        id,
        {
          ...pharmacy,
          ledger: {
            ...pharmacy.ledger,
            start:
              pharmacy.ledger.start < SALES_REPORTING_START
                ? SALES_REPORTING_START
                : pharmacy.ledger.start,
          },
          periods: pharmacy.periods.filter(
            (period) => period.start >= SALES_REPORTING_START,
          ),
        },
      ]),
    ),
  };
}

// 매출 데이터는 저장소·번들에 AES-256-GCM 암호문으로만 실린다.
// 열람 암호가 맞을 때만 복호화에 성공한다(GCM 무결성 검증 실패 시 예외).
export async function decryptPharmacySales(
  password: string,
): Promise<PharmacyDataFile> {
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
  const data = JSON.parse(
    new TextDecoder().decode(plain),
  ) as PharmacyDataFile;
  return hidePreOpeningSales(data);
}

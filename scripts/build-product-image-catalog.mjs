import fs from "node:fs";

const candidates = JSON.parse(fs.readFileSync("etc/duckduckgo-product-image-candidates.json", "utf8"));
const entities = new Map(JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8")).map((item) => [item.id, item]));
const officialDomains = [
  "drrejuall.com", "drreju-all.kr", "dapharm.com", "dpharm.co.kr", "re4day.co.kr",
  "drdeep.co.kr", "melaxin.com", "doctoralthea.co.kr", "taiguk.co.kr", "ckdpharm.com",
  "sinsinpas.net", "azalea-leopharma.co.kr", "yuhan.co.kr", "dong-wha.co.kr", "culip.co.kr",
  "jw-pharma.co.kr", "easydermbeauty.co.kr", "beautyofjoseon.com", "beautyofjoseonglobal.com",
  "iunik.com", "drvitamall.com", "daycellglobal.com", "villemu.com", "vt-cosmetics.com",
  "globalvt-cosmetics.com", "genabelle.com", "genabelle.co.kr", "rxmecosmetics.com",
  "medipeel.com", "medipeel.co.kr", "elraviecos.com", "fmkcos.com", "fmkcos.co.kr",
  "pyderin.com", "reckitt.com", "strepsils.co.kr", "pharmaresearch.com", "jwbrand.co.kr",
  "daewoong.co.kr", "shinsegaegroupnewsroom.com", "comus.co.kr", "modcol.co.kr",
];
const retailerDomains = [
  "hwahae.co.kr", "hwahae.com", "kurly.com", "kurlyglobal.com", "ssg.com", "shinsegaev.com",
  "musinsa.com", "wconcept.co.kr", "lfmall.co.kr", "coupang.com", "lotteon.com", "amoremall.com",
  "edkshop.com", "pdrnmall.co.kr", "korepharm.com", "k-yak.com", "nicepharm.com", "sspharmacy.co.kr",
  "thepharmacy.co.kr", "yakkok.com", "barkiri.com", "odkshop.com", "beautyboxkorea.com",
  "stylevana.com", "dodoskin.com", "cocomo.sg", "ballagrio.com", "globalvt-cosmetics.com",
];
const host = (value) => {
  try { return new URL(value).hostname.replace(/^(?:www|m)\./, ""); } catch { return ""; }
};
const matches = (hostname, domains) => domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
const words = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}+.]+/gu, " ").trim().split(/\s+/).filter((word) => word.length >= 2);
const compact = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const overrides = {
  "catalog-002": ["https://www.daewonpharm.com/pr/sub01_01_view.jsp?idx=474&lang=1&mb=06&mm=61&ms=611", "https://www.daewonpharm.com/upload/2025_11_18_104520.jpg", "뉴베인액", "official-brand"],
  "catalog-003": ["https://drreju-all.kr/product/drreju-all-advanced-retino-mela-serum-50ml/35/category/63/display/1/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260521/b12a8ed9d7c5a49a36a3233cf8626ca3.png", "Dr.Reju-All Advanced Retino-Mela Serum 50ml", "official-brand"],
  "catalog-004": ["https://drreju-all.kr/product/drreju-all-advanced-retino-mela-tone-cream-30ml/54/category/63/display/1/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260521/0dbe49f906a9b4cf3b0c14447538a89e.png", "Dr.Reju-All Advanced Retino-Mela Tone Cream 30ml", "official-brand"],
  "catalog-005": ["https://drreju-all.kr/product/drreju-all-advanced-lc-ceramide-barrier-cream-90ml/36/category/63/display/1/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260521/b89d7821efe7d24f0bb0041cb57ec942.png", "Dr.Reju-All Advanced LC Ceramide Barrier Cream 90ml", "official-brand"],
  "catalog-006": ["https://drreju-all.kr/product/drreju-all-advanced-pdrn-rejuvenating-mask-6p/49/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260521/09878d21fc199048dd793f0ab49e72f6.png", "Dr.Reju-All Advanced PDRN Rejuvenating Mask 6P", "official-brand"],
  "catalog-007": ["https://drreju-all.kr/product/drreju-all-advanced-pdrn-calming-sun-serum-50ml/79/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260601/c42f606a102eee423ce796f9219bf187.png", "Dr.Reju-All Advanced PDRN Calming Sun Serum 50ml", "official-brand"],
  "catalog-008": ["https://drrejuall.com/products/advanced-pdrn-copper-peptide-serum", "https://drrejuall.com/cdn/shop/files/6f4cb2516c4c479c16359c7e9b129bc9.jpg?v=1780023639&width=1500", "Advanced PDRN Copper Peptide Serum", "official-brand"],
  "catalog-009": ["https://drreju-all.kr/product/drreju-all-advanced-pdrn-hair-density-scalp-serum-15ml/77/category/63/display/1/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260601/a36d7615e5fddb1b54e2fcc89cbc9530.png", "Dr.Reju-All Advanced PDRN Hair Density Scalp Serum 15ml", "official-brand"],
  "catalog-010": ["https://drreju-all.kr/product/drreju-all-advanced-pdlla-firming-cream-30ml/60/category/63/display/1/", "https://ecimg.cafe24img.com/pg1921b33605515017/neosimplerix/web/product/medium/20260521/8104d57abe6a2c1186d292803e3e99c0.png", "Dr.Reju-All Advanced PDLLA Firming Cream 30ml", "official-brand"],
  "catalog-011": ["https://m.drdeep.co.kr/product/11-%EB%AF%B8%EB%84%A4%EB%9E%84-pdrn-52000-%EB%A6%AC-%EB%B2%A0%EB%A6%AC%EC%96%B4-%ED%8D%BC%EB%B0%8D-%EB%9E%98%EB%94%94%EC%96%B8%EC%8A%A4-%ED%81%AC%EB%A6%BC/1354/category/249/display/1/", "https://m.drdeep.co.kr/web/product/big/202604/07db2277dc19565174d337ebea974866.png", "미네랄 PDRN 52000 리-베리어 퍼밍 래디언스 크림", "official-brand"],
  "catalog-014": ["https://www.mdon.co.kr/news/article.html?no=20133", "https://www.mdon.co.kr/data/photos/20190206/art_15495515940557_98a469.jpg", "태극제약 도미나크림 튜브", "official-manufacturer-release"],
  "catalog-018": ["https://korepharm.com/products/pdrn-dry-eye-drops", "https://korepharm.com/cdn/shop/files/PDRNdryeyedrops.jpg?v=1687689740&width=1445", "RE-AN PDRN 리안 점안액 30관", "authorized-or-established-retailer"],
  "catalog-019": ["https://pyderin.com/product", "https://storage.googleapis.com/pyderin-12650.firebasestorage.app/products/thumbnail/%EB%A6%AC%EC%A5%AC%EB%B6%80%EC%8A%A4%ED%84%B0%20%EC%8D%B8%EB%84%A4%EC%9D%BC%20200.png", "리쥬부스터 PDRN 리쥬비네이팅 크림", "official-brand"],
  "catalog-021": ["https://www.kurly.com/goods/1001756614", "", "마리엔메이 스피큘 레티놀 PDRN 크림", "authorized-or-established-retailer"],
  "catalog-034": ["https://www.yuhan.co.kr/products/list/?YPRD_IDX=1831&mode=view", "https://www.yuhan.co.kr/__DATA/YH_PRODUCTS/2021/2/%EC%95%88%ED%8B%B0%ED%91%B8%EB%9D%BC%EB%AF%BC_%EC%97%90%EC%8A%A4%EB%A1%9C%EC%85%98_100ml_son(1).jpg", "안티푸라민 에스로션", "official-brand"],
  "catalog-035": ["https://dpharm.co.kr/acnon/ko/info", "https://dpharm.co.kr/images/brand/acnon/info_sec01_item03.png", "애크린 외용액", "official-brand"],
  "catalog-037": ["https://k-yak.com/ko/products/%EC%9D%B4%EC%A7%80%EB%8D%A4-%EB%B0%B4%EB%93%9C-%EB%B7%B0%ED%8B%B0-%EC%A7%9C%EA%B3%A0%EB%82%9C-%EC%97%AC%EB%93%9C%EB%A6%84-%EB%B6%89%EC%9D%80%EC%9E%90%EA%B5%AD-%EC%9E%91%EC%9D%80-%EC%83%81%EC%B2%98-easyderm-band-beauty-spot-patch-for-post-acne-skin-recovery", "https://k-yak.com/cdn/shop/files/18886e8668e7498a859b516c8fec7ca5.jpg?v=1757975500&width=1024", "이지덤 밴드 뷰티", "authorized-or-established-retailer"],
  "catalog-045": ["https://www.tylenol.co.kr/products/tylenol-500mg", "https://images.ctfassets.net/dnh87h2n9q42/dW3Rhr8Efpdx0fPtS9h1H/7c763e3ae5281b04b2e9c502def81167/500mg_%C3%A1__%C3%A1__%C3%A1__%C3%A1__%C3%A1__%C3%A1__.jpg", "타이레놀 500mg", "official-brand"],
  "catalog-047": ["https://thome.kr/product/%EC%95%BD%EA%B5%AD-%EC%A0%84%EC%9A%A9-%ED%86%B0-cpr-%EC%84%B8%EB%9F%BC/451/category/119/display/1/", "https://cafe24img.poxo.com/thomeinc/web/product/medium/202606/358696ecedac32744ab9f3d05908903a.png", "[약국 전용] 톰 CPR 세럼", "official-brand"],
  "public-scalp-shot": ["https://www.shinsegaegroupnewsroom.com/just-as-i-am-scalp-shot-launch/", "https://shinsegae-prd-data.s3.ap-northeast-2.amazonaws.com/wp-content/uploads/2026/03/NR_Press_Details_04-12.png", "자주 JAJU SCALP SHOT", "official-brand"],
  "public-vt-pdrn-essence-rx": ["https://vt-cosmetics.com/product/detail.html?product_no=1630&cate_no=607&display_group=1", "https://vt-cosmetics.com/web/product/big/202606/dddc6e8d189f06db42c4253bb4213c08.jpg", "[약국 입점] 피디알엔 에센스 RX", "official-brand"],
  "public-vt-pdrn-cream-rx": ["https://vt-cosmetics.com/product/detail.html?product_no=1631&cate_no=607&display_group=1", "https://vt-cosmetics.com/web/product/big/202606/4ac413074a1880635402402f2c0f7803.jpg", "[약국 입점] 피디알엔 크림 RX", "official-brand"],
  "public-vt-retinal-peptide-serum": ["https://vt-cosmetics.com/product/detail.html?product_no=2472&cate_no=607&display_group=1", "https://vt-cosmetics.com/web/product/big/202606/5a70fafdc01207eee842ff5d07906cbc.jpg", "[약국 입점] 레티날 펩타이드 세럼", "official-brand"],
  "public-vt-retinal-pro-cream": ["https://vt-cosmetics.com/product/detail.html?product_no=2380&cate_no=607&display_group=1", "https://vt-cosmetics.com/web/product/medium/202606/7ab6b604b334655de538cbbb786342e2.jpg", "[약국 입점] 레티날 프로 크림 0.05", "official-brand"],
  "public-vt-pdrn-tone-up-sun-rx": ["https://vt-cosmetics.com/product/detail.html?product_no=1632&cate_no=607&display_group=1", "https://vt-cosmetics.com/web/product/medium/202606/7f32254d05afc3f6820f0a53e454d1fc.jpg", "[약국 입점] 피디알엔 모이스트 톤업 선 에센스 RX", "official-brand"],
  "public-vt-vita-eye-cream": ["https://globalvt-cosmetics.com/products/vita-light-eye-cream", "https://globalvt-cosmetics.com/cdn/shop/files/Vita-LightEyeCream.png?v=1778220790&width=1445", "Vita-Light Eye Cream", "official-brand"],
  "public-genabelle-pdrn-vita-toning-ampoule": ["https://genabelle.com/products/genabelle-pdrn-vita-toning-ampoule", "https://genabelle.com/cdn/shop/files/pdrn-vita-toning-ampoule-genabelle-1620644.png?crop=center&height=630&v=1770173435&width=1200", "Genabelle PDRN Vita Toning Ampoule", "official-brand"],
  "public-rxme-rejuyoung-pdrn-10000-cream": ["https://rxmecosmetics.com/", "https://rxmecosmetics.com/web/product/medium/202604/5cfcb89597763f5fc22c7a983a00ea9d.png", "RXme 리쥬영 PDRN 10000 크림", "official-brand"],
  "public-rxme-juvekle-pdlla-10000-cream": ["https://rxmecosmetics.com/", "https://rxmecosmetics.com/web/product/medium/202604/6555359a939fa356b4cdee5fe81ad4dd.png", "RXme 쥬베클 PDLLA 10000 크림", "official-brand"],
  "public-deesse-pdrn-2000-cream": ["https://8beauty.co.kr/product/%EB%94%94%EC%97%90%EC%8A%A4-pdrn1000-plus-20ml-%EC%95%BD%EA%B5%AD%EC%9A%A9-pdrn-%EC%9E%AC%EC%83%9D%ED%81%AC%EB%A6%BC/19/", "https://ecimg.cafe24img.com/pg1503b13426605023/eightbeauty8/web/product/big/20260604/07f511bc8ee37e7c34d85ff3e35f3834.jpg", "디에스 PDRN2000 PLUS 20mL", "authorized-or-established-retailer"],
  "public-medipeel-retinal-nmn-booster": ["https://m.medipeel.com/product/retinal-nmn-bounce-shot-booster-30ml/1041/", "https://m.medipeel.com/web/product/big/202607/2074ef565f0b1e3f3db2fc8b858fea61.jpg", "Retinal NMN Bounce Shot Booster", "official-brand"],
  "public-elravie-re2o-ecm-active-ampoule": ["https://m.elraviecos.com/main/html.php?htmid=proc%2Fre2obrand.htm", "https://cdn-pro-web-223-233.cdn-nhncommerce.com/humedix1_godomall_com/data/img/re2o/re2o_ampoule.jpg", "엘라비에 리투오 ECM 액티브 앰플", "official-brand"],
  "public-elravie-re2o-ecm-booster-cream": ["https://m.elraviecos.com/main/html.php?htmid=proc%2Fre2obrand.htm", "https://cdn-pro-web-223-233.cdn-nhncommerce.com/humedix1_godomall_com/data/img/re2o/re2o_cream.jpg", "엘라비에 리투오 ECM 부스터 크림", "official-brand"],
  "public-elravie-re2o-ecm-skinfit-bb": ["https://m.elraviecos.com/main/html.php?htmid=proc%2Fre2obrand.htm", "https://cdn-pro-web-223-233.cdn-nhncommerce.com/humedix1_godomall_com/data/img/re2o/re2o_bb.jpg", "엘라비에 리투오 ECM 스킨핏 비비", "official-brand"],
  "public-fmk-rejuvenating-pdrn-kit": ["https://fmkcos.com/product/detail.html?product_no=14", "https://fmkcos.com/web/product/big/202604/395afd91a8c1287b34e54bfb4b90ab8b.png", "fmk Rejuvenating PDRN Kit", "official-brand"],
  "public-fmk-brightening-vita-kit": ["https://fmkcos.com/product/detail.html?product_no=13", "https://fmkcos.com/web/product/big/202604/245f888af9297770951f8e05bb4c66b1.png", "fmk Brightening Vit+ Kit", "official-brand"],
};
const relevance = (entity, candidate) => {
  const record = entities.get(entity.id);
  const names = [entity.name, ...(record?.skuNames || []), ...(record?.sourceAliases || [])];
  const targetWords = [...new Set(names.flatMap(words))];
  const haystack = `${candidate.title} ${decodeURI(candidate.sourcePageUrl)}`.toLowerCase();
  const overlap = targetWords.filter((word) => haystack.includes(word)).length;
  const exact = names.some((name) => compact(name).length >= 5 && compact(haystack).includes(compact(name)));
  const hostname = host(candidate.sourcePageUrl);
  return overlap * 12 + (exact ? 100 : 0) + (matches(hostname, officialDomains) ? 15 : 5);
};

const selected = candidates.map((entity) => {
  const override = overrides[entity.id];
  const eligible = entity.candidates.filter((candidate) => /^https?:\/\//.test(candidate.imageUrl));
  const trusted = eligible.filter((candidate) => matches(host(candidate.sourcePageUrl), [...officialDomains, ...retailerDomains]));
  const candidate = trusted.sort((a, b) => relevance(entity, b) - relevance(entity, a))[0];
  const selectedPage = (override?.[0] || candidate?.sourcePageUrl || "").replace(/^http:/, "https:");
  const selectedImage = (override?.[1] || candidate?.imageUrl || "").replace(/^http:/, "https:");
  const official = candidate && matches(host(candidate.sourcePageUrl), officialDomains);
  const retailer = candidate && !official;
  return {
    entityId: entity.id,
    productName: entity.name,
    brand: entity.brand,
    sourcePageUrl: selectedPage,
    sourceImageUrl: selectedImage,
    sourceTitle: override?.[2] || candidate?.title || "",
    sourceHost: host(selectedPage),
    sourceType: override?.[3] || (official ? "official-brand" : retailer ? "authorized-or-established-retailer" : "unresolved"),
    width: candidate?.width || null,
    height: candidate?.height || null,
    matchScore: candidate ? relevance(entity, candidate) : 0,
  };
});

fs.writeFileSync("app/product-assets.json", `${JSON.stringify(selected, null, 2)}\n`);
for (const item of selected) {
  console.log(`${item.sourceType === "unresolved" ? "MISS" : "OK  "} ${item.entityId} | ${item.sourceHost}`);
}
console.log(`resolved ${selected.filter((item) => item.sourceImageUrl).length}/${selected.length}`);

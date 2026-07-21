# 재수집 작업 명세 (2026-07 3차)

이 문서는 `app/signals.json` 재수집을 수행하는 에이전트를 위한 **단일 기준
명세**다. 작업 전에 [AGENTS.md](../AGENTS.md)와
[collection-protocol.md](./collection-protocol.md)를 먼저 읽는다. 이 문서와
충돌하면 이 문서가 우선한다.

## 배경

2026-07-21 통계 감사에서 다음 결함이 확인됐다. 이번 재수집의 목적은 이
결함을 데이터 차원에서 해소하는 것이다.

1. TikTok 수집이 **전 제품에서 검색어 1개만** 시도됨 → 제품 간 비교 불공정
2. Instagram 30개 제품이 검색어 일부만 시도됨, **조회수가 전 제품 0**(수집
   누락) → 참여 지표만으로 점수 계산 중
3. Google Trends 13개 제품이 429(rate_limited)로 실패
4. 기간 밖 콘텐츠 다수(TikTok 뷰의 53%가 180일 밖) — 점수에서는 자동
   제외되지만, 기간 내 표본이 부족해짐

## 작업 우선순위

### P1 — TikTok 전체 검색어 재수집 (대상: 검색어 2개 이상인 87개 제품)

- 제품마다 `keywords`의 **모든 검색어**로 검색한다(현재는 1개만 시도됨).
- 검색어별 상위 20개 검토 → 관련성 통과 자연 결과 **최근 180일** 최대 10개 채택.
- 기존 tiktok 레코드를 **교체**한다(새 `collectedAt`, `attemptedQueries`에
  실제 시도한 검색어 전부 기록).

### P2 — Instagram 보강 (대상: 아래 30개 제품 + 조회수 확보)

검색어 일부만 시도된 30개 제품:

노스카나겔 · 애크논크림 · 멜라토닝크림 · 애크린겔 · 올인원 우먼플러스 ·
노스엣 센스액 · 딥콜라겐 파워부스팅 마스크 · 멜라노사 크림 · 센텔리안24
마데카 크림 타임 리버스 · 안티푸라민 에스 로션 · 애크린 외용액 · 이지덤
뷰티 · 큐립 연고 · Cica Mela Repair Cream · VT PDRN Cream RX · VT Retinal
Peptide Serum · VT PDRN Reedle Shot 100 · 제나벨 PDRN 비타 토닝 앰플 ·
RXme 리쥬영 PDRN 10000 크림 · RXme 쥬베클 PDLLA 10000 크림 · 디에스 PDRN
2000+ 크림 · 메디필 멜라논 엑스 앰플 18.9 · 메디필 멜라논 엑스 크림 ·
메디필 레티날 NMN 바운스 샷 부스터 · 메디필 레티날 NMN 바운스 샷 아이 크림 ·
엘라비에 리투오 ECM 액티브 앰플 · 엘라비에 리투오 ECM 부스터 크림 ·
엘라비에 리투오 ECM 스킨핏 비비 · fmk 리쥬네이팅 PDRN 키트 · fmk
브라이트닝 Vit+ 키트

- 전체 검색어로 재검색하고, **Reel은 화면에 조회수가 표시되면 반드시
  `views`에 기록**한다(현재 전 제품 views가 0/null — 이번 재수집의 핵심).
  화면에 보이지 않으면 `null`(0 아님).
- 일반 게시물(사진)은 조회수가 없으므로 `views: null`이 정상이다.

### P3 — Google Trends 429 재시도 (대상: 아래 13개 제품)

제나벨 PDRN 비타 토닝 앰플 · RXme 리쥬영 PDRN 10000 크림 · RXme 쥬베클
PDLLA 10000 크림 · 디에스 PDRN 2000+ 크림 · 메디필 멜라논 엑스 앰플 18.9 ·
메디필 멜라논 엑스 크림 · 메디필 레티날 NMN 바운스 샷 부스터 · 메디필
레티날 NMN 바운스 샷 아이 크림 · 엘라비에 리투오 ECM 액티브 앰플 ·
엘라비에 리투오 ECM 부스터 크림 · 엘라비에 리투오 ECM 스킨핏 비비 · fmk
리쥬네이팅 PDRN 키트 · fmk 브라이트닝 Vit+ 키트

- 요청 간 충분한 대기 시간을 두고 순차 수집한다. 다시 429가 나면 해당
  제품은 `rate_limited` 상태 그대로 두고 넘어간다(점수에서 무벌점 처리됨).
- 검색량이 실제로 부족해 그래프가 안 나오면 `status: "no_data"`로 기록한다
  (0점 처리됨 — 이것도 유효한 결과다).

### P4 (선택) — 검색어 1개뿐인 9개 제품의 검색어 보강

도미나크림 · 디판버그겔 · 디판큐어크림 · 리쥬비넥스크림 · 모드코프 ·
아젤리아크림 · 페리덱스연고 · 플로리진 · D-판테놀연고

- 소비자 통칭·별칭을 조사해 `keywords`에 2~4개로 보강한 뒤, 보강된
  검색어로 해당 제품의 소셜 채널을 재수집한다.

## 절대 규칙 (위반 시 데이터 폐기)

1. **추정 금지.** 화면에 보이는 숫자만 기록한다. 안 보이면 `null`. 빈 값을
   0으로 만들지 않는다. 문자열("1.2만")이 아니라 파싱된 숫자(12000)로
   기록하되, 파싱 근거 원문은 `viewsText` 같은 보조 필드에 남겨도 된다.
2. **관련성 기준 준수.** 성분·효능만 같고 대상 제품을 특정할 수 없는
   콘텐츠(예: "PDRN 크림 10종 비교")는 채택하지 않는다. 애매하면 빼고
   `relevance: uncertain` 후보로만 남긴다. — 이전 수집의 최대 결함이었다.
3. **광고·협찬·공식 계정은 삭제하지 말고 플래그로 분리**한다
   (`classification: independent | sponsored | official`).
4. **증거 필수.** 모든 채택 항목에 원본 URL, 게시일(ISO), 수집 시각을
   기록한다. `publishedAt` 없는 항목은 검증기가 ERROR로 거부한다.
5. **로그인·보안 확인 화면을 만나면 자동으로 넘어가려 하지 말고 멈춘 뒤
   사용자에게 해당 브라우저에서의 로그인을 요청**한다. CAPTCHA를 대신
   풀지 않는다. 비밀번호·쿠키·세션 저장소를 읽지 않는다.
6. **합계는 계산값.** `totals`는 items 합과 일치해야 하고
   `acceptedCount == items.length`여야 한다(검증기가 강제).
7. **부분 갱신.** 재수집한 채널의 레코드만 교체하고 다른 채널·다른 제품
   레코드는 건드리지 않는다. 루트 `collectedAt`은 작업 완료 시각으로 갱신.
8. **생성 파일 수동 편집 금지.** `app/signal-quality.json`은
   `npm run audit:signals`가 만든다. 직접 고치지 않는다.

## 레코드 형식

`collection-protocol.md`의 "조사 레코드" 절과 기존 `signals.json`의 같은
채널 레코드 구조를 그대로 따른다. 새 필드를 임의로 추가하지 말고, 기존
필드명을 재사용한다. (tiktok items: `id, url, account, publishedAt, views,
likes, comments, reposts, saves, classification` / instagram items: `id, url,
account, publishedAt, title, description, views, likes, comments,
classification`)

## 완료 파이프라인 (순서 고정)

```bash
npm run validate:signals   # ERROR 0건이 될 때까지 수정 (WARNING은 참고)
npm run audit:signals      # signal-quality.json 재생성 (필수)
npm run test:unit          # 19+ 테스트 전부 통과 확인
```

세 명령이 모두 성공한 상태에서만 커밋한다. 커밋 메시지에 재수집 범위
(P1/P2/P3 중 무엇을 얼마나)와 남은 격차를 적는다. 배포는 요청받은 경우에만
`npx vercel --prod`로 한다.

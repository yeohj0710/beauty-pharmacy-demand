# 정기 수요 조사 실행 절차

`C:\dev\product-demand-dashboard`의 수요 데이터를 갱신하는 상시 절차다.
"데이터 조사해줘" 요청을 받으면 이 문서 하나만 따라가면 된다.

## 0. 준비

```bash
cd C:\dev\product-demand-dashboard
git pull github main
npm install
npm run plan:recollection
```

`plan:recollection`이 **오늘 무엇을 수집해야 하는지** 우선순위별로 출력한다.
제품 명단은 이 스크립트가 현재 데이터에서 계산하므로, 문서에 적힌 옛 명단을
찾지 말고 항상 이 출력값을 작업 목록으로 삼는다. (`-- --json`을 붙이면 기계가
읽는 형식으로 나온다.)

## 1. 무엇을 수집하나

제품 96개 × 5개 채널의 **공개 웹 관심 신호**다. 내부 매출·판매량·이익
데이터는 읽지도 저장하지도 않는다.

| 채널 | 수집 대상 | 기간 |
| --- | --- | --- |
| 네이버 | DataLab 검색어 트렌드 (공통 기준어 대비 상대지수) | 최근 1년 |
| Google | Google Trends 관심도 (대한민국) | 최근 12개월 |
| YouTube | 검색 결과 영상의 조회·게시일 | 최근 365일 |
| Instagram | 게시물·Reel의 좋아요·댓글·조회 | 최근 180일 |
| TikTok | 영상의 조회·좋아요·댓글·공유·저장 | 최근 180일 |

검색어별 상위 20개를 검토해 관련성을 통과한 자연 결과를 **최대 10개** 채택한다.

## 2. 우선순위 (planner 출력과 동일)

- **P0 수집 실패 재시도** — `rate_limited` 등으로 비어 있는 채널. 요청 간격을
  충분히 두고 다시 시도한다. 재차 실패하면 상태를 그대로 두고 넘어간다.
- **P1 대표 검색어 보강** — `keywords`가 1개뿐인 제품. 소비자 통칭·별칭·영문
  표기를 조사해 2~4개로 늘린 뒤, 그 제품의 소셜 채널을 재수집한다. 검색어가
  빈약하면 아무리 수집해도 표본이 안 늘어나므로 수집보다 먼저 한다.
- **P2 미적용 검색어로 재검색** — 등록된 검색어 중 일부만 시도된 채널. 남은
  검색어로 추가 검색해 표본을 채운다.
- **P3 표본 부족 채널** — 기간 내 표본이 5개 미만이라 신뢰도가 `low`인 채널.
  검색어를 바꿔가며 보강하되, 관련 없는 콘텐츠로 숫자를 채우지 않는다.
- **전체 갱신** — 마지막 수집으로부터 30일이 지나면 planner가 알려준다. 이때는
  5개 채널을 전부 다시 수집한다.

## 3. 절대 규칙

위반하면 검증기(`validate:signals`)가 막거나, 통과하더라도 데이터를 폐기한다.

1. **추정 금지.** 화면에 보이는 숫자만 기록한다. 안 보이면 `null`이고 `0`이
   아니다. 빈 값을 0으로 채우면 "관심 없음"이라는 잘못된 정보가 된다.
2. **관련성 우선.** 성분·효능만 같고 대상 제품을 특정할 수 없는 콘텐츠(예:
   "PDRN 크림 10종 비교")는 채택하지 않는다. 애매하면 뺀다. 표본을 늘리려고
   범용 콘텐츠를 넣으면 여러 제품에 같은 콘텐츠가 잡혀 점수가 오염된다.
3. **광고·협찬·공식 계정은 지우지 말고 분리한다.** `classification`을
   `independent` / `sponsored` / `official` 중 하나로 표시한다.
4. **증거 필수.** 채택 항목마다 원본 URL(https), ISO 게시일(`publishedAt`),
   수집 시각을 남긴다. 게시일 없는 항목은 검증기가 거부한다.
5. **시도한 검색어를 전부 기록한다.** `attemptedQueries`가 실제 검색과 달라지면
   제품 간 비교가 불공정해진다.
6. **합계는 계산값.** `totals`는 items 합과 일치하고
   `acceptedCount == items.length`여야 한다.
7. **부분 갱신.** 이번에 재수집한 채널 레코드만 교체한다. 다른 채널·다른 제품은
   건드리지 않는다. 작업을 마치면 루트 `collectedAt`을 완료 시각으로 갱신하되
   **KST 오프셋(+09:00)으로 기록**한다.
8. **로그인·보안 확인 화면에서 멈춘다.** CAPTCHA를 대신 풀거나 우회하지 않고,
   사용자에게 해당 브라우저에서의 로그인을 요청한다. 비밀번호·쿠키·세션
   저장소를 읽지 않는다.
9. **생성 파일을 손대지 않는다.** `app/signal-quality.json`은
   `npm run audit:signals`가 만든다. 직접 편집 금지.

## 4. 레코드 형식

`app/signals.json`의 기존 같은 채널 레코드 구조를 그대로 따른다. 새 필드를
임의로 만들지 말고 기존 필드명을 재사용한다.

- TikTok items: `id, url, account, publishedAt, views, likes, comments,
  reposts, saves, classification`
- Instagram items: `id, url, account, publishedAt, title, description, views,
  likes, comments, classification`
- YouTube topVideos: `id, url, title, channel, published, views, viewsText`
- 채널 공통: `status, collectedAt, method, query, attemptedQueries, sourceUrl,
  sourceUrls, inspectedCount, acceptedCount, totals`

상세 정의는 [collection-protocol.md](./collection-protocol.md)에 있다.

## 5. 완료 파이프라인 (순서 고정)

```bash
npm run validate:signals   # 데이터 계약 검증 — ERROR 0건이 될 때까지 수정
npm run audit:signals      # 통계 보정 파일 재생성 (필수)
npm run test:unit          # 회귀 테스트 전부 통과
```

- `validate:signals`의 ERROR 메시지는 무엇을 고쳐야 하는지 제품·채널 단위로
  알려준다. WARNING은 품질 참고용이며 커밋을 막지 않는다.
- 세 명령이 모두 성공한 뒤에만 커밋한다.

## 6. 커밋과 보고

```bash
git add -A
git commit -m "데이터 재수집: <범위 요약>"
git push github main
```

배포(`npx vercel --prod`)는 **요청받았을 때만** 한다.

작업을 마치면 다음을 보고한다.

- 채널별 재검색한 제품 수 / 검색어 수 / 채택 콘텐츠 수
- 검증 결과 (ERROR 건수), 감사 파일 재생성 여부, 테스트 통과 수
- 커밋 해시
- **남은 격차** — 관련 결과가 없어 비운 채널, 재시도해도 실패한 채널,
  검색어를 못 찾은 제품

## 7. 데이터가 어떻게 쓰이는지 (판단 기준)

수집값은 그대로 순위가 되지 않는다. `audit:signals`가 다음 보정을 적용한다.

- 같은 콘텐츠가 여러 제품에 채택되면 조회·반응을 제품 수로 나눠 배분
- 수집 기간 밖 콘텐츠는 점수에서 제외
- 검색어 시도 횟수 차이로 생기는 표본 편향은 상위 5개 합계로 상한
- 기간 내 표본 5개 미만은 신뢰도 `low`, 채널 2개 이상이 `medium` 이상이어야
  "판단 가능" 판정

즉 **관련 없는 콘텐츠를 많이 넣는 것보다, 관련 있는 콘텐츠를 정확히 넣는
것이 점수와 신뢰도를 올린다.** 억지로 채우지 않아도 된다.

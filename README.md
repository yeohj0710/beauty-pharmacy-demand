# 뷰티 약국 수요 데이터

뷰티 약국의 실매출과 온라인 관심 신호를 한곳에서 보는 수요 인텔리전스입니다.

- **약국 실매출(메인)** — 파트너 약국 POS 판매 데이터를 지점·기간·제품 단위로
  집계합니다. 매출 데이터는 열람 암호로 잠긴 암호문으로만 저장소에 실립니다.
- **온라인 수요 신호(부가)** — 제품별 온라인 관심 신호를 수집하고 원본 근거와
  함께 검토합니다.

## 데이터 범위

- 등록 제품명과 수요 개체
- YouTube, Instagram, TikTok, 네이버, Google의 공개 검색 결과
- 조사자가 직접 확인한 콘텐츠 지표와 원본 URL
- 파트너 약국 POS 실매출 — `app/pharmacy-sales.enc.json`(AES-256-GCM 암호문)
  으로만 커밋하며, 평문과 열람 암호는 커밋하지 않습니다.
- 온라인 신호 수집 파이프라인은 실매출 데이터를 읽지 않습니다.

## 실행

```bash
npm install
npm run dev
```

## 약국 실매출 데이터 갱신

원본 xlsx(G드라이브)에서 추출 후 암호화까지 한 번에 실행합니다. 평문은
`etc/pharmacy-sales.local.json`(gitignore)에만 남습니다.

```bash
PHARMACY_DATA_PASSWORD=<열람암호> npm run data:pharmacy
```

## 통계 보정

`app/signals.json`을 갱신한 뒤에는 반드시 감사 스크립트를 실행해
`app/signal-quality.json`을 다시 생성합니다. 대시보드 점수는 이 파일의
보정 지표(교차 제품 분할, 기간 필터, 신뢰도 등급)를 사용합니다.

```bash
npm run audit:signals
```

## 정기 조사

데이터를 갱신할 때는 아래 한 줄로 조사 규칙과 오늘의 작업 목록을 받는다.

```bash
npm run brief
```

## 조사 기준

- 에이전트 실행 절차: [AGENTS.md](./AGENTS.md)
- 정기 조사 절차: [docs/recollection-runbook.md](./docs/recollection-runbook.md)
- 플랫폼별 표본·판정·점수 기준: [docs/collection-protocol.md](./docs/collection-protocol.md)
- 통계 보정·판정 신뢰도 규칙: [docs/collection-protocol.md](./docs/collection-protocol.md)의 "통계 보정과 판정 신뢰도" 절

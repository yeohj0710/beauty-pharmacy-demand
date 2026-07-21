# 제품 수요 대시보드

제품별 온라인 관심 신호를 수집하고 원본 근거와 함께 검토하는 대시보드입니다.

## 데이터 범위

- 등록 제품명과 수요 개체
- YouTube, Instagram, TikTok, 네이버, Google의 공개 검색 결과
- 조사자가 직접 확인한 콘텐츠 지표와 원본 URL
- 내부 매출·판매량·순이익·이익률은 사용하지 않습니다.

## 실행

```bash
npm install
npm run dev
```

## 통계 보정

`app/signals.json`을 갱신한 뒤에는 반드시 감사 스크립트를 실행해
`app/signal-quality.json`을 다시 생성합니다. 대시보드 점수는 이 파일의
보정 지표(교차 제품 분할, 기간 필터, 신뢰도 등급)를 사용합니다.

```bash
npm run audit:signals
```

## 조사 기준

- 에이전트 실행 절차: [AGENTS.md](./AGENTS.md)
- 플랫폼별 표본·판정·점수 기준: [docs/collection-protocol.md](./docs/collection-protocol.md)
- 통계 보정·판정 신뢰도 규칙: [docs/collection-protocol.md](./docs/collection-protocol.md)의 "통계 보정과 판정 신뢰도" 절

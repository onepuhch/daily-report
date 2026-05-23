# Component Notes

## Shell

- 큰 흰색 캔버스를 회색 배경 위에 띄우는 구조가 핵심입니다.
- Desktop에서는 좌측 sidebar + 우측 content. Tablet/mobile에서는 sidebar를 축약합니다.
- 운영 리포트 특성상 랜딩 페이지처럼 과한 hero보다, 대시보드가 첫 화면에 바로 보여야 합니다.

## Sidebar

- Active 메뉴는 `#f0f7ff` 배경과 `#197bbd` 텍스트.
- 아이콘은 단색, 작은 크기, 텍스트와 함께 배치합니다.
- V2에서는 `Overview`, `Indicators`, `Classic`, `Admin` 정도만 유지합니다.

## Cards

- 카드 배경은 흰색, border는 매우 얇게, 그림자는 넓고 약하게.
- Radius는 18px 내외. 기존 프로젝트 기준 8px보다 크지만 이 레퍼런스의 핵심 톤이라 V2에서는 유지합니다.
- 테이블은 카드 안에서 행 구분선을 아주 옅게 쓰고 hover만 약하게 줍니다.

## Buttons

- Primary button: 파란색 `#197bbd`, 흰색 텍스트, 34-40px 높이.
- Date pill: active 상태도 강한 검정이 아니라 연한 파란 배경으로 처리합니다.
- Floating AI button은 primary blue + soft shadow.

## Color Usage

- Blue: 주요 액션, 핵심 값, active state.
- Yellow: comment, publish/review status, attention area.
- Red/Blue: 금융 등락 컬러. 국내 관례를 유지해 상승은 빨강, 하락은 파랑.
- Green/Orange/Teal: 카드별 보조 tone. 한 화면이 단일 파란색만 되지 않도록 섞습니다.

## Daily Report Fit

- `final_comment`는 별도 comment card로 유지해야 합니다. 담당자 검토/발행 상태가 보이는 운영 핵심입니다.
- 검증 mismatch나 stale warning이 생기면 추후 V2 상단 또는 comment card 주변에 warning strip으로 붙이는 것이 좋습니다.
- 기존 자동화/검증/API 흐름은 디자인보다 중요합니다. V2는 `/report-v2`에서 dogfooding 후 `/report`로 승격하는 방식이 안전합니다.
## 2026-05-23 V2 적용 메모

- Figma의 rounded white dashboard shell, soft card shadow, blue primary accent, yellow attention panel을 `/report-v2`에 적용했다.
- 화면 구성은 레퍼런스를 그대로 복제하지 않고 데일리 리포트 목적에 맞춰 `Market tickers -> 운영 상태 -> Daily brief -> 지표 카드` 순서로 재구성했다.
- 운영 상태는 공개 리포트 V2에서만 먼저 노출한다. 기존 `/report`는 회귀 리스크를 줄이기 위해 유지한다.
- 모바일에서는 sidebar menu를 숨기고 ticker를 1열로 내려 안정적인 육안 확인을 우선했다.
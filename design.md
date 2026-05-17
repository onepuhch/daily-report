# Design System: Daily Market Report

## Overview

이 디자인 시스템은 자금운용본부의 데일리 마켓 리포트 웹 앱을 위한 것이다. 참고 레퍼런스는 **Stripe**(refero.design 기준)와 **KIS 리서치 / FnGuide / 이데일리 마켓포인트** 같은 한국 증권사 리서치 페이지. 카카오뱅크 브랜드 색은 컴플라이언스 상 미사용, 중립적 금융 대시보드 팔레트를 사용한다.

핵심 원칙은 **정보 밀도 우선**이다. Notion·마케팅 사이트의 너른 여백, 큰 히어로, 부드러운 카드 곡선은 모두 부적합. 한 뷰포트에 가능한 많은 시장 데이터를 표시하면서도 가독성을 유지한다. 사용자는 PC와 모바일(카카오톡 인앱 브라우저 포함) 양쪽에서 본다.

**핵심 특성**
- 밝은 배경(`#fafbfc` ~ `#ffffff`) + 얇은 1px 보더 + 컴팩트 패딩
- 한국 금융 색상 관례: **상승 빨강(`#d92d20`), 하락 파랑(`#1570ef`)** — 미국식과 반대
- Stripe 블루(`#1f4ed8`)를 액센트로 사용 (링크, 포커스 링, primary CTA)
- Pretendard 또는 시스템 폰트
- 둥근 모서리는 4–6px (카드 12px → 6px로 축소)
- 표 행 28px, 폰트 13px, tabular-nums로 숫자 정렬

---

## Colors

### Surface
- **`--bg`** `#fafbfc` — 페이지 배경 (살짝 차가운 흰색)
- **`--surface`** `#ffffff` — 카드·표·헤더 표면
- **`--surface-elevated`** `#ffffff` — 모달·드롭다운 (그림자로 차별화)
- **`--border`** `#e6e8eb` — 1px 디바이더, 카드 보더
- **`--border-strong`** `#d1d5db` — 입력 필드, 강조 디바이더

### Text
- **`--text`** `#1a1f2e` — 본문 (warm dark navy, 순흑 X)
- **`--text-strong`** `#0a0e1a` — 헤드라인, 강조 숫자
- **`--muted`** `#6b7280` — 보조 텍스트, 라벨
- **`--subtle`** `#9ca3af` — 비활성, 자리표시자

### Accent (Stripe 블루)
- **`--accent`** `#1f4ed8` — 링크, 포커스, primary CTA 배경
- **`--accent-hover`** `#1846c4` — hover/pressed
- **`--accent-soft`** `#eef2ff` — 활성 탭 배경, 강조 셀 배경

### Semantic (한국 금융 관례)
- **`--up`** `#d92d20` — 상승 (빨강)
- **`--up-soft`** `#fef3f2` — 상승 셀 배경 (필요 시)
- **`--down`** `#1570ef` — 하락 (파랑)
- **`--down-soft`** `#eff8ff` — 하락 셀 배경 (필요 시)
- **`--flat`** `#6b7280` — 변동 없음
- **`--warning`** `#b54708` — 경고
- **`--error`** `#b42318` — 에러

### Status (코멘트 워크플로)
- **`--status-draft`** `#6b7280`
- **`--status-reviewed`** `#1f4ed8`
- **`--status-published`** `#067647`

---

## Typography

### Font Family
**Pretendard** (primary, 한국어 최적화). Fallback 체인:
```
Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo",
"Noto Sans KR", system-ui, sans-serif
```

숫자는 **tabular figures** 필수: `font-variant-numeric: tabular-nums;` — 표에서 자릿수 정렬되도록.

### Hierarchy

| 토큰 | 크기 | 굵기 | 행간 | 용도 |
|---|---|---|---|---|
| `display-md` | 24px | 700 | 1.25 | 페이지 헤더 (리포트 날짜) |
| `display-sm` | 20px | 700 | 1.30 | 카테고리 카드 헤더 |
| `body-lg` | 15px | 500 | 1.50 | 코멘트 본문, primary 버튼 |
| `body-md` | 14px | 400 | 1.50 | 일반 본문, 라벨 |
| `body-sm` | 13px | 400 | 1.45 | 표 셀, 보조 정보 |
| `caption` | 12px | 500 | 1.40 | 보조 라벨, 메타데이터 |
| `caption-bold` | 11px | 600 | 1.30 | 카테고리 태그, 상태 배지 |

### Principles
- 헤드라인은 작게 (24px 최대). 마케팅 사이트와 달리 콘텐츠가 주인공.
- 본문은 14px 기본. 표 셀은 13px로 더 컴팩트.
- 숫자는 항상 tabular-nums + 우측 정렬.
- 한국어 단어 단위 줄바꿈을 위해 `word-break: keep-all;` 본문에 권장.

---

## Layout

### Spacing
4px 베이스, 8/12/16/24/32 주요 단계. 마케팅 사이트의 64/96/120px 같은 큰 단위는 사용 X.

- `space-1` = 4px (셀 내부 패딩)
- `space-2` = 8px (카드 내 행 간격, 컴팩트 여백)
- `space-3` = 12px (카드 패딩 작은 쪽)
- `space-4` = 16px (카드 패딩 큰 쪽, 카드 간 gap)
- `space-5` = 24px (섹션 사이)
- `space-6` = 32px (페이지 좌우 패딩 최대값)

### Grid & Container
- **공개 리포트**: max-width 1440px (1280·1440·1920 뷰포트 모두 지원). 좌우 패딩 16~24px.
- **3열 카테고리 그리드**: `grid-template-columns: 1fr 1fr 1fr; gap: 16px;` — 1080px 이상에서 활성, 그 이하는 1열로 폴드.
- **Admin 페이지**: 사이드바 240px + 메인 영역. 메인은 데이터(70%) + 코멘트(30%) 분할 또는 stepper 단계별.
- **Sticky 헤더**: 48px 높이. `position: sticky; top: 0; z-index: 10;` 핵심지표 칩 5개.

### Whitespace Philosophy
**여백 = 정보 손실**. 보이지 않게 정보를 묶어주는 최소 패딩만 사용. 마케팅 사이트가 호흡과 휴식을 주는 거라면, 금융 리포트는 정보를 빠르게 스캔하는 도구.

---

## Elevation

| 레벨 | 그림자 | 용도 |
|---|---|---|
| 0 (flat) | none + 1px border | 기본 카드, 표 |
| 1 (subtle) | `0 1px 2px rgba(15, 23, 42, 0.04)` | sticky 헤더, hover 카드 |
| 2 (card) | `0 4px 12px rgba(15, 23, 42, 0.08)` | 모달, AI 바 펼침 |
| 3 (overlay) | `0 12px 32px rgba(15, 23, 42, 0.16)` | 드롭다운, 풀스크린 모달 |

대부분 컴포넌트는 레벨 0 (플랫 + 보더). 그림자는 명확한 z-축 분리가 필요한 곳에만.

---

## Shapes

### Border Radius
| 토큰 | 값 | 용도 |
|---|---|---|
| `radius-xs` | 2px | 인라인 태그, 칩 |
| `radius-sm` | 4px | 버튼, 입력, 표 |
| `radius-md` | 6px | 카드, 패널, 모달 |
| `radius-lg` | 8px | AI 바 펼침 패널 (max) |
| `radius-full` | 9999px | 상태 배지, 핵심지표 칩 |

Notion의 12·16·20·24px 같은 큰 곡선은 사용 X. 금융 도구는 정직한 직각·작은 곡선이 어울린다.

---

## Components

### Header — Sticky 핵심지표 띠

공개 리포트 페이지 상단 고정. 48px 높이.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 2025-12-23 │ KOSPI 2,503 ▲0.4%  USD/KRW 1,463 ▼0.2%  US10Y 4.18%   │
│ Daily      │   WTI $73.4 ▲1.1%  GOLD $2,067 ▼0.3%                  │
└──────────────────────────────────────────────────────────────────────┘
```

- 좌측: 날짜 + "Daily" 작은 라벨
- 우측: 5개 핵심지표 칩 — 지표명, 값, 1D 변화율
- 변화율 색상: 빨/파, 글자색만 (배경 X)
- 모바일: 가로 스크롤 허용 (`overflow-x: auto`)

### Comment Card

코멘트 1단락. max-height 120px, 넘으면 "더보기" 토글.
- 배경 `--surface`, 패딩 16px, 보더 1px `--border`, radius 6px
- 본문 `body-lg`, 행간 1.55

### Category Card

3열 그리드의 각 셀.
- 헤더 1줄: 카테고리명 (`display-sm`) + 우측 작은 메타 ("6 metrics")
- 내부: 컴팩트 표
- 카드 자체: 패딩 12px, 보더 1px, radius 6px, 배경 `--surface`
- 카드 사이 별도 디바이더 X (gap 16px이면 충분)

### Data Row (표 행)

```
┌──────────────────────────────────────────────────┐
│ 국고채 3년    3.18%   +5bp   -42bp   ╱╲╲╱╱      │
│ 국고채 10년   3.42%   +3bp   -28bp   ╱╲╲╱╲      │
└──────────────────────────────────────────────────┘
```

- 행 높이 28px (헤더 26px)
- 폰트 `body-sm` (13px)
- 셀 좌우 패딩 8px, 첫·마지막 셀은 12px
- 지표명 좌측 정렬, 값·변화율·스파크라인 우측 정렬
- `font-variant-numeric: tabular-nums;` 필수
- hover 시 행 배경 `--accent-soft` (선택)
- 스파크라인: 50×16 인라인 SVG, 마지막 점 색상은 1D 방향

### Buttons

**Primary** (저장·발행 등)
- 배경 `--accent`, 글자 흰색, 패딩 8px 14px, radius 4px, `body-md` 500
- hover: `--accent-hover`
- disabled: 배경 `--border-strong`, 글자 `--muted`

**Secondary**
- 배경 투명, 보더 1px `--border-strong`, 글자 `--text`, 동일 사이즈

**Ghost**
- 배경 투명, 글자 `--text`, hover 시 `--accent-soft` 배경

**Danger**
- 배경 `--error`, 글자 흰색

### Inputs / Textarea
- 보더 1px `--border-strong`, radius 4px
- 패딩 8px 12px
- 포커스 시 보더 2px `--accent`, 옅은 ring `0 0 0 3px rgba(31, 78, 216, 0.08)`
- placeholder 색 `--subtle`

### Status Badges
- 작은 캡슐 (`radius-full`), 패딩 2px 8px
- `caption-bold` 11px
- draft = 회색 배경 + `--status-draft`
- reviewed = `--accent-soft` + `--status-reviewed`
- published = 옅은 녹색 + `--status-published`

### AI Question Bar (하단 고정)

- 평소: 우하단 fixed, 폭 360px, 높이 40px, 보더 1px, radius 6px, 그림자 레벨 1
- 안에 입력칸 + 작은 검색 아이콘
- 클릭 / 포커스: 폭 동일, 높이 320px로 슬라이드업, 답변 영역 노출
- ESC / 외부 클릭으로 접힘
- 모바일: 화면 풀폭, bottom 0 고정

### Sparkline (인라인 SVG)
- 50×16 SVG, `<polyline>` stroke 1.5px
- 색상 `--muted` 기본, 마지막 1D 방향에 따라 마지막 셀에 컬러 도트(반지름 1.5px)
- 데이터 없으면 `--` 텍스트로 graceful fallback

---

## Responsive

### Breakpoints
| 이름 | 폭 | 핵심 변경 |
|---|---|---|
| Mobile | < 640px | 3열 → 1열, AI 바 풀폭, sticky 칩 가로 스크롤 |
| Tablet | 640 – 1023px | 1열 유지 또는 2열 (테스트 후 결정) |
| Desktop | 1024 – 1439px | 3열 그리드 활성 |
| Wide | ≥ 1440px | 3열 + 최대 max-width 적용 |

### Mobile 핵심 변경
- 카테고리 그리드: 1열 카드 스택
- 핵심지표 칩: `overflow-x: auto; -webkit-overflow-scrolling: touch;`
- AI 바: `width: 100%; left: 0; right: 0;`
- Admin 코멘트 패널: 사이드 패널이 아닌 풀스크린 모달로
- 스파크라인 유지 (작아도 의미 있음)

---

## Do's and Don'ts

### Do
- 한국 금융 관례 색상(상승=빨강, 하락=파랑) 일관 적용
- 숫자에 `tabular-nums` 적용해 자릿수 정렬
- 표 행 28px, 폰트 13px로 컴팩트 유지
- 작은 패딩(8~16px), 작은 곡선(4~6px) 사용
- 색상으로 1차 시각 정보 전달 (배경 보다 글자색 위주)
- 카드 사이 보더·구분선 대신 gap만으로 분리

### Don't
- Notion 마케팅 스타일(여백 많음, 큰 헤드라인, 둥근 곡선) 재도입 금지
- 미국식 색상(green up / red down) 사용 금지
- 모든 변화율 셀에 배경색 채우기 (정신없음 — 글자색만)
- 표 안에 또 다른 표·복잡한 중첩 그리드
- 카카오뱅크 브랜드 색 임의 사용 (컴플라이언스)
- 6단계 이상 깊은 시각 위계
- 큰 그림자나 두꺼운 보더

---

## CSS Token Reference

```css
:root {
  /* Surface */
  --bg: #fafbfc;
  --surface: #ffffff;
  --border: #e6e8eb;
  --border-strong: #d1d5db;

  /* Text */
  --text: #1a1f2e;
  --text-strong: #0a0e1a;
  --muted: #6b7280;
  --subtle: #9ca3af;

  /* Accent (Stripe blue) */
  --accent: #1f4ed8;
  --accent-hover: #1846c4;
  --accent-soft: #eef2ff;

  /* Semantic (한국 금융 관례) */
  --up: #d92d20;
  --up-soft: #fef3f2;
  --down: #1570ef;
  --down-soft: #eff8ff;
  --flat: #6b7280;
  --warning: #b54708;
  --error: #b42318;

  /* Status */
  --status-draft: #6b7280;
  --status-reviewed: #1f4ed8;
  --status-published: #067647;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Radius */
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* Elevation */
  --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-2: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-3: 0 12px 32px rgba(15, 23, 42, 0.16);

  /* Type */
  --font-sans: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI",
               "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
}
```

---

## Implementation Notes

- 토큰은 위 CSS 블록을 두 곳에 동일하게 두어야 한다:
  1. `src/daily_report/admin/styles.css` — Admin 및 Archive 페이지 (`/admin/styles.css` 라우트)
  2. `src/daily_report/admin/server.mjs::buildReviewHtml()` 내부 inline `<style>` 블록 — 공개 리포트 페이지
- 두 곳을 동시에 갱신하지 않으면 페이지 간 시각 불일치 발생.
- Pretendard 폰트는 CDN 또는 self-host 결정 후 일관 적용.

> 이전 Notion 마케팅 디자인 시스템은 `docs/DECISIONS.md` D-004 에서 폐기 결정됨. 이 문서가 새 SSOT.

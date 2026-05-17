# 데일리 마켓 리포트 UI 리디자인 플랜

> 이 파일은 `~/.claude/plans/linked-booping-tarjan.md` 의 저장소용 사본입니다.
> 다른 도구·PC에서도 접근 가능하도록 저장소 안에 동일 내용을 유지합니다.
> 플랜이 갱신되면 양쪽 모두 동기화해야 합니다.

## Context

자금운용본부의 데일리 마켓 리포트 자동화 프로젝트. Codex가 1차 구현을 완료해 로컬 서버에서 동작 중(`http://127.0.0.1:4173/admin`, `/reports`)이지만, 다음 문제가 사용자에 의해 식별됨:

1. **레이아웃 철학 오류**: 현재 `design.md`는 Notion의 마케팅 사이트 디자인 시스템(여백 많은 호흡 긴 페이지)을 따랐는데, 금융 데일리 리포트는 정보 밀도가 생명. 좌우 여백이 많아 위아래 스크롤이 길어짐.
2. **Admin 코멘트 패널 비효율**: textarea 4개(자동초안/참고메모/최종/SQL출력)가 세로로 쌓여있고 저장 버튼이 2개 중복.
3. **"선택 지표 추이" 큰 차트는 불필요**: 데일리 리포트의 가치는 오늘의 스냅샷이지 트렌드 차트가 아님.
4. **AI 질문창이 화면 중앙에 큼직하게**: 보조 기능이므로 하단 컴팩트 바가 적절.
5. **모바일 미고려**: 실제로는 카카오톡으로 공유받아 출퇴근 시 모바일로 보는 케이스 많음.

목표 결과물: Stripe(refero.design 참고) + KIS 리서치 스타일 혼합의 **밝은 배경 금융 대시보드**. PC·모바일 둘 다 지원. 한 뷰포트에 한눈에 들어오는 정보 밀도. 카카오뱅크 브랜드 색은 컴플라이언스상 미사용, 중립 팔레트.

사용자 선택: 모든 Phase 한 번에 진행. PNG/PDF 내보내기는 차기 범위.

---

## 핵심 설계 결정

- **Evolve 방식**: 데이터 레이어 보존, 시각 레이어만 재작성. 기존 API(`/api/reports`, `/api/comments`, `/api/ask`, `/api/metrics/{key}/series`)와 데이터 처리 함수(`fetchSupabaseReport`, `computeChange`, `formatChange`)는 그대로 사용.
- **색상 규칙**: 한국 금융 관례 — 상승 빨강(`#d92d20`), 하락 파랑(`#1570ef`). 미국식과 반대.
- **스파크라인**: 외부 라이브러리 없이 인라인 SVG. 기존 시계열 API 활용.
- **AI 바**: 3개 페이지(admin / report / archive) 공통 마크업·스타일. 평소 40px 접힘, 클릭 시 320px 팝업.
- **반응형**: `@media (max-width: 768px)` 기준 3열 → 1열 카드 스택. AI 바는 풀폭.
- **`design.md` 교체**: 현재 Notion 문서 전체 삭제, "Financial Dashboard System" 문서로 갱신.

---

## Phase별 실행 계획

### Phase A — 디자인 시스템 정립

**수정 파일**
- `design.md` (전체 교체)
- `src/daily_report/admin/styles.css` (`:root` CSS 변수 갱신)
- `src/daily_report/admin/server.mjs::buildReviewHtml()` 내부 inline `<style>` 블록

**디자인 토큰**
```
--bg:        #fafbfc    /* 페이지 배경 */
--surface:   #ffffff    /* 카드 표면 */
--border:    #e6e8eb    /* 1px 디바이더 */
--text:      #1a1f2e    /* 본문 */
--muted:     #6b7280    /* 보조 텍스트 */
--accent:    #1f4ed8    /* 링크/포커스 (Stripe blue) */
--up:        #d92d20    /* 상승 (한국 규칙: 빨강) */
--down:      #1570ef    /* 하락 (한국 규칙: 파랑) */
--flat:      #6b7280
```
폰트: `Pretendard, -apple-system, "Segoe UI", system-ui, sans-serif`
모서리: 4–6px (Notion의 12px보다 작게)
간격 스케일: 4 / 8 / 12 / 16 / 24 / 32

**검증**: admin 페이지에서 색·폰트 적용 확인. 기존 컴포넌트 안 깨지는지.

---

### Phase B — 공개 리포트 페이지 (가장 중요)

**수정 파일**
- `src/daily_report/admin/server.mjs` — `buildReviewHtml()` 함수(363–738줄) 전체 HTML 빌더 부분 재작성. 데이터 추출 헬퍼는 위쪽에 그대로 유지.

**새 구조 (위→아래)**

1. **Sticky 헤더 띠 (48px)**: 좌측 날짜·제목 / 우측 5개 핵심지표 압축 칩 — KOSPI, USD/KRW, US10Y, WTI, GOLD. 각 칩에 값 + 1D% 표시, 색상 강조.
2. **요약 코멘트 카드**: 폭 100%, max-height 120px, "더보기" 토글. 기존 1.45:0.55 코멘트/주요변동 그리드 폐기.
3. **3열 카테고리 그리드** (`grid-template-columns: 1fr 1fr 1fr`, gap 16px, max-width 1440px):
   - **열 1 — 국내**: 국내금리(6) + 국내주식(3) + 크레딧(2)
   - **열 2 — 해외 금리·주식**: 해외금리(5) + 해외주식(7)
   - **열 3 — 외환·원자재·암호**: 환율(4) + 상품(6) + 암호화폐(2)
4. **카테고리 카드 내부**: 헤더 1줄(카테고리명) + 컴팩트 표. 행 = `지표명 | 값 | 1D% | YTD% | 스파크라인(미니 SVG)`. 행 높이 28px, 폰트 13px, `font-variant-numeric: tabular-nums`.
5. "선택 지표 추이" 큰 차트 섹션 **삭제**.

**재사용**: `extractMetrics`, `formatChange`, Supabase 페치 로직, AI 질문 fetch.

**구현 포인트**
- 한 뷰포트(1080px 높이) 안에 핵심 정보 들어오도록 패딩 최소화
- 카드 `overflow:hidden`, 내부 표 스크롤 금지
- 표 헤더는 카드당 1줄, 카테고리 카드 사이에 별도 구분선 불필요

**검증**: `/reports/2025-12-23` 열어 1280 / 1440 / 1920 뷰포트에서 위아래 스크롤 한 번 이내, 좌우 스크롤 0 확인. DevTools로 카드 높이 측정.

---

### Phase C — Admin 코멘트 워크플로 재설계 (참고메모-first)

> **2026-05-17 갱신**: D-009 결정 반영. 기존 "숫자 기반 초안 → 메모" 흐름을 폐기하고 "참고 자료 → AI 초안 → 최종" 흐름으로 변경.

**수정 파일**
- `src/daily_report/admin/index.html` (코멘트 패널 마크업 전면 교체)
- `src/daily_report/admin/app.js` (워크플로 상태 재구성)
- `src/daily_report/admin/styles.css` (stepper 컴포넌트 스타일 추가)

**변경 내용 — 3단 stepper**

**Step 1 — 참고 자료** (맨 위, 가장 큰 영역)
- 단일 textarea: 텔레그램 본문 / 뉴스 요약 / 자유 메모 모두 붙여넣기
- placeholder 안내: "텔레그램 메시지, 뉴스 기사, 자유 메모 등 코멘트 작성에 참고할 자료를 붙여 넣으세요. URL은 차기 버전에서 자동 파싱 예정."
- "전일 뉴스 가져오기" 버튼 placeholder (disabled, tooltip: "차기 Phase에서 구현 — D-011")

**Step 2 — AI 초안 생성**
- 버튼 "메모 기반 초안 생성" → 현재는 `/api/comments/{date}/draft` 호출 (reference_note 전달). 실제 LLM 호출은 차기 (D-010).
- 안내 배너: "LLM 미연동 — 현재는 숫자 기반 초안. AI provider 결정 후 메모 기반 LLM 초안으로 교체 예정."
- textarea: 생성된 초안 표시, 편집 가능

**Step 3 — 최종 작성 & 발행**
- textarea: 최종 코멘트
- 상태 드롭다운 (draft / reviewed / published)
- 단일 "저장 및 발행" 버튼 → `/api/supabase/reports/{date}` POST

**제거**
- "SQL 출력" textarea
- "저장 SQL 생성" 버튼 (Supabase 저장만 유지)

**재사용**: `/api/comments/{date}/draft` (reference_note 파라미터 이미 존재), `/api/supabase/reports/{date}`. `comment` 객체 스키마(`auto_comment`, `reference_note`, `final_comment`, `status`) 유지.

**검증**: 참고 메모 입력 → 초안 생성 버튼 → 최종 다듬기 → 저장 후 공개 페이지 반영.

---

### Phase D — AI 질문 하단 고정 바

**수정 파일**
- `src/daily_report/admin/index.html` (하단 마크업 추가)
- `src/daily_report/admin/archive.html` (동일 마크업 추가)
- `src/daily_report/admin/server.mjs::buildReviewHtml()` 끝부분에 동일 마크업 + inline 스크립트
- 신규 파일: `src/daily_report/admin/ai-bar.js`, `src/daily_report/admin/ai-bar.css`
- `server.mjs` 정적 라우트는 이미 존재하므로 추가 작업 없음

**동작**
- 평소: 화면 우하단 40px 높이 컴팩트 바 ("AI에게 물어보기" 입력칸 + 검색 아이콘)
- 클릭/포커스: 320px 패널로 슬라이드업, 답변 영역 노출
- ESC 또는 외부 클릭: 다시 접힘
- `/api/ask` 호출 → 결과 렌더링

**재사용**: `/api/ask` 엔드포인트.

**검증**: 3개 페이지 모두 우하단 바 표시. 동일하게 펼침/접힘. 질문 전송 시 응답 표시.

---

### Phase E — 인라인 스파크라인

**수정 파일**
- `src/daily_report/admin/server.mjs::buildReviewHtml()` 끝부분에 클라이언트 부트 스크립트 추가

**구현**
- 페이지 로드 후 모든 행의 `data-metric-key` 수집
- `Promise.all`로 `/api/metrics/{key}/series?days=7` 36개 병렬 호출
- 응답을 받아 각 행 마지막 셀에 50×16 인라인 SVG `<polyline>` 주입
- min/max 정규화, 마지막 점에 컬러 도트 (1D 변화 방향에 따라 빨/파)
- 데이터 부족 시(과거 리포트 없을 때) `--` 표시로 graceful fallback

**현재 한계**: 리포트가 2025-12-23 1건뿐이라 7일치 시계열이 거의 안 채워짐. 초기엔 빈 스파크라인이 정상. 누적될수록 시각적 가치 증가.

**검증**: 네트워크 탭에서 36개 병렬 요청. 표 우측 미니 차트 렌더링.

---

### Phase F — 모바일 반응형

**수정 파일**
- 위 Phase에서 손댄 모든 CSS (`styles.css`, `buildReviewHtml` 내 `<style>`, `ai-bar.css`)

**브레이크포인트: `max-width: 768px`**
- 3열 카테고리 그리드 → 1열 카드 스택
- 헤더 핵심지표 칩 → 가로 스크롤 허용
- AI 바 → 풀폭, 패널 펼침 시 화면 60% 차지
- Admin 코멘트 패널 → 풀스크린 모달 (사이드 패널 X)
- 스파크라인 유지 (작아도 의미 있음)

**검증**: Chrome DevTools에서 375px(iPhone SE), 412px(Galaxy S20) 확인. 카카오톡 인앱 브라우저 UA에서도 정상.

---

### Phase G (차기 범위 — 1차 미포함)

PNG/PDF 내보내기. 이번 리디자인 안정화 후 별도 진행. html2canvas + 인쇄 CSS 활용 예정.

### Phase H — LLM 통합 (차기 범위)

D-010 결정. Phase C의 "메모 기반 초안 생성" placeholder를 실제 LLM 호출로 교체.
- AI provider 결정 (OpenAI / Anthropic / 사내 LLM) 필요
- `server.mjs::generateAutoComment` 함수에 LLM 호출 로직 추가
- 입력: `reference_note` (참고 자료) + 오늘 시장 숫자 → 출력: 채권 운용 관점 코멘트 초안
- 프롬프트 설계 + 토큰 비용 관리

### Phase I — 뉴스 자동 수집 (차기 범위)

D-011 결정. 전일 채권 관련 뉴스를 자동 수집해 참고 자료 textarea에 시드.
- 데이터 소스 후보: RSS (한경·이데일리) / 인포맥스 채권 섹션 스크래핑 / 유료 뉴스 API
- ToS·저작권 검토 필요
- 채권 키워드 필터: 금리, 채권, 국고채, 회사채, FOMC, 한은, 기준금리 등
- Phase C의 "전일 뉴스 가져오기" placeholder 버튼을 활성화

---

## 작업 순서 권장

병렬 진행 불가능한 의존 관계 있음:

1. **Phase A** (디자인 토큰) 먼저 — 모든 페이지가 의존
2. **Phase B, C, D** 동시 진행 가능 (서로 다른 파일/영역)
3. **Phase E** (스파크라인) — Phase B 완료 후
4. **Phase F** (반응형) — A~E 완료 후 통합 마무리

예상 작업량: 4~5일 (1인 풀타임 기준).

---

## Critical Files

- `src/daily_report/admin/server.mjs` (Phase B 가장 큰 변경)
- `src/daily_report/admin/styles.css` (Phase A, F)
- `src/daily_report/admin/index.html` (Phase C, D)
- `src/daily_report/admin/app.js` (Phase C)
- `src/daily_report/admin/archive.html` (Phase D)
- `design.md` (Phase A, 전체 교체)
- 신규: `src/daily_report/admin/ai-bar.js`, `src/daily_report/admin/ai-bar.css` (Phase D)

## 재사용 가능한 기존 자산

- API 라우트 (`server.mjs`): `/api/reports`, `/api/reports/{date}`, `/api/comments/{date}`, `/api/comments/{date}/draft`, `/api/supabase/reports/{date}`, `/api/ask`, `/api/metrics/{key}/series` — 변경 없이 사용
- 데이터 헬퍼: `extractMetrics`, `formatChange`, `computeChange`, `fetchSupabaseReport`
- 상태관리: `app.js` / `archive.js`의 fetch 로직 보존, DOM 렌더링만 재작성
- 인포맥스 추출 스크립트(`scripts/Export-MarketDailyCachedValues.ps1` 등): 그대로 사용

---

## 진행 기록 메커니즘

**`HANDOFF.md` (저장소 루트)** — 진행 현황, 의사결정 기록, 작업 일지가 모두 통합된 단일 인수인계서. 새 세션·다른 PC·다른 AI 도구로 이어받을 때 이 파일 하나만 읽으면 즉시 진입 가능 (D-012).

이 `REDESIGN_PLAN.md` 는 Phase A~I 상세 플랜만 보존하는 **참고 자료**. 실시간 추적은 `HANDOFF.md` 에서 수행.

### 핵심 원칙

**토큰이 갑자기 끊겨도 다음 도구가 즉시 이어할 수 있어야 한다.**

- 작업 끝나면 `HANDOFF.md` 의 "지금 바로 할 일" 갱신 + "작업 일지" 최상단 1줄 추가
- 새 결정 있으면 "의사결정 기록"에 D-XXX append
- 자주 commit (작업 단위 작아도 OK), 가능하면 자주 push

### 세션 시작 체크리스트

1. `git pull` — 최신 동기화
2. `HANDOFF.md` 만 읽으면 충분 — 진행 현황 / 다음 할 일 / 의사결정 / 작업 일지 모두 포함
3. 작업 진행
4. 작업 끝나면 `HANDOFF.md` 갱신 + commit + push

### 커밋 규칙

- **자주** 커밋 (작업 단위가 작아도 OK)
- 패턴: `phase B(report): sticky 헤더 마크업 + 핵심지표 칩`
- 진행 기록 파일 갱신은 코드 변경과 같은 커밋에 포함 가능
- `.env`는 절대 커밋 X

---

## 검증 시나리오 (End-to-End)

1. 로컬 서버 기동: `node src/daily_report/admin/server.mjs` (또는 `scripts/03_start_admin.cmd`)
2. **Admin** (`http://127.0.0.1:4173/admin`): 2025-12-23 리포트 선택 → 3단 stepper 표시, 저장 한 번에 완료, SQL textarea 없음
3. **공개 리포트** (`http://127.0.0.1:4173/reports`): sticky 헤더 5개 핵심지표, 3열 그리드, 위아래 스크롤 1회 이내, 좌우 스크롤 0, 스파크라인, 우하단 AI 바
4. **아카이브** (`http://127.0.0.1:4173/archive`): AI 바 동일 동작
5. **모바일** (DevTools 375px): 1열 스택, 풀폭 AI 바, 가로 스크롤 핵심지표
6. **카카오톡 시뮬레이션**: 로컬 IP로 휴대폰 인앱 브라우저 확인

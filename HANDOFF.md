# 인수인계서 (이 파일 하나만 보면 됩니다)

## 2026-05-18 Codex update

- Pulled `origin/master` to `512348f`.
- Reapplied the local stash and resolved `src/daily_report/admin/server.mjs` in favor of the upstream API/data flow.
- Phase B public report page work is implemented in `buildReviewHtml()`:
  - 48px sticky report header with five market ticker chips.
  - Compact commentary card capped at 120px.
  - Three-column metric grid with domestic, overseas, and FX/commodity/crypto columns.
  - Existing API/data helpers are preserved.
- Next recommended entry point: Phase E inline SVG sparklines for rows with `data-metric-key`.

> 다른 PC·다른 AI 도구(Codex/Claude/Gemini 등)로 작업을 이어받을 때 이 파일만 읽으면 즉시 진입 가능.
> 작업 끝나면 **반드시 이 파일을 갱신**하고 commit + push.

---

## 한 줄 요약
Phase B (공개 리포트 페이지 재작성) 진입할 차례.

## 지금 바로 할 일

**Phase B — 공개 리포트 페이지 (`/reports/{date}`) 재작성**

- 파일: `src/daily_report/admin/server.mjs`
- 함수: `buildReviewHtml()` (대략 363–738줄)
- 데이터 헬퍼(`extractMetrics`, `formatChange`, `computeChange`, `fetchSupabaseReport`)는 **변경 금지**, HTML 빌더 부분만 재작성.
- 새 구조 (위→아래):
  1. **Sticky 헤더 48px**: 좌측 날짜·제목 / 우측 5개 핵심지표 칩(KOSPI, USD/KRW, US10Y, WTI, GOLD) — 값 + 1D% + 컬러
  2. **요약 코멘트 카드**: 100% 폭, max-height 120px, "더보기" 토글
  3. **3열 카테고리 그리드** (`1fr 1fr 1fr`, gap 16, max-width 1440):
     - 열 1: 국내금리(6) + 국내주식(3) + 크레딧(2)
     - 열 2: 해외금리(5) + 해외주식(7)
     - 열 3: 환율(4) + 상품(6) + 암호화폐(2)
  4. **카테고리 카드 내부**: 컴팩트 표, 행 = `지표명 | 값 | 1D% | YTD% | 스파크라인자리(Phase E)`. 행 높이 28px, 폰트 13px, `font-variant-numeric: tabular-nums`.
  5. "선택 지표 추이" 큰 차트 섹션 **삭제**.
- 인라인 스타일은 새 디자인 토큰 사용 (`--up`, `--down`, `--accent`, `--surface`, `--border`, `--text`, `--muted`)
- 검증: `/reports/2025-12-23` 에서 1280 / 1440 / 1920 뷰포트 위아래 스크롤 1회 이내, 좌우 스크롤 0

---

## 절대 건드리지 말 것

- **`scripts/` 폴더** — Excel + 인포맥스 add-in 매크로 파이프라인. Codex가 세팅한 데이터 추출 코어.
- **`.env`** — 커밋 금지 (`.gitignore` 등록됨). Supabase URL/Key 들어있음.
- **카카오뱅크 브랜드 색상** — 컴플라이언스. 중립 팔레트(Stripe blue + 한국식 빨/파)만 사용.
- **데이터 API 라우트와 헬퍼 함수** — `/api/reports`, `/api/comments/*`, `/api/ask`, `/api/metrics/*`, `extractMetrics`, `formatChange` 등은 그대로 사용.

---

## 진행 현황

| Phase | 상태 | 내용 |
|---|---|---|
| A | ✓ done | 디자인 토큰 + Pretendard 폰트 |
| B | → next | 공개 리포트 페이지 재작성 |
| C | ✓ done (골격) | Admin 3단 stepper (참고메모 → AI 초안 → 발행) |
| D | pending | AI 질문 하단 고정 바 (40px / 320px) |
| E | pending | 인라인 SVG 스파크라인 (Phase B 의존) |
| F | pending | 모바일 반응형 (`max-width: 768px`) |
| G | ⏸ 보류 | PNG/PDF 내보내기 |
| H | ⏸ 보류 | LLM 실제 연동 (provider 미정) |
| I | ⏸ 보류 | 뉴스 자동 크롤링 |

전체 6단계 자세한 플랜: `docs/REDESIGN_PLAN.md`

---

## 의사결정 기록 (왜 이렇게 했는가)

> append-only. 결정 번복 시 새 항목 추가 + 기존 항목에 "Superseded by D-XXX" 표시.

### D-001 — Evolve 방식 (전면 재작성 X)
데이터 레이어(API, 헬퍼) 보존, 시각 레이어만 재작성.
- **Why**: API 계약·변환 로직 이미 안정적. 시각만 재작성하면 위험·작업량 동시 감소.
- **영향**: 전체 Phase. `server.mjs` 데이터 헬퍼는 변경 안 함.

### D-002 — 한국 금융 색상 (상승 빨강 / 하락 파랑)
`--up: #d92d20`, `--down: #1570ef`. 미국식과 반대.
- **Why**: 한국 모든 금융 단말기·뉴스·증권사 리서치 관례. 자금운용본부 직관 일치.
- **영향**: CSS 토큰 `--up`/`--down`, 헤더 칩, 데이터 행, 스파크라인 도트 색.

### D-003 — 스파크라인 외부 라이브러리 미사용
Chart.js / D3 안 씀. 인라인 SVG `<polyline>` 자체 구현.
- **Why**: 36개 × 7일 단순 추세선만 필요. 번들 크기·CSP·CDN 의존성 회피. 50줄 이하면 충분.
- **영향**: Phase E. `buildReviewHtml` 끝 부트 스크립트.

### D-004 — design.md 전면 교체
Notion 마케팅 디자인 → 금융 대시보드.
- **Why**: Notion식 1280px max + 80px 히어로 + 96px 섹션은 마케팅 호흡 페이지용. 데일리 리포트는 정보 밀도가 생명, 정반대 철학. 토큰 부분 교체로는 부족, 시스템 자체 교체.
- **영향**: Phase A. `design.md` 전체.

### D-005 — AI 질문창 → 하단 컴팩트 바
중앙 큰 영역 → 우하단 40px(접힘) / 320px(펼침).
- **Why**: AI 답변은 보조. 메인 콘텐츠(시장 데이터) 가시성 침해 X. Bloomberg 터미널 표준 패턴.
- **영향**: Phase D. admin/report/archive 3페이지 공통.

### D-006 — 모든 Phase 한 번에 진행, PNG/PDF는 차기
Phase A~F 한 번에. G(PNG/PDF)는 1차 제외.
- **Why**: 작은 단위 끊으면 중간 상태 어색·일관성 깨짐. 모바일 반응형 잘 되면 PNG/PDF는 카카오톡 링크로 대체 가능.
- **영향**: 작업 순서. G는 안정화 후 별도.

### D-007 — 3열 카테고리 그리드 (단일 테이블 X)
36 지표를 3열 그리드로 배치 (국내 11 / 해외 금리·주식 12 / 외환·원자재·암호 12).
- **Why**: "한 페이지에 한눈에" 요구. 단일 컬럼은 세로 스크롤 길어짐. 3열로 가로 폭 활용 + 한 뷰포트 내 거의 모든 지표 표시.
- **영향**: Phase B. `buildReviewHtml` HTML 빌더 구조.

### D-008 — 추적 인프라 파일 기반 (메모리 의존 X) [Superseded by D-012]
~~`docs/STATUS.md` + `REDESIGN_LOG.md` + `DECISIONS.md` + `AGENTS.md` 4종 파일에 실시간 기록.~~
- **Why (당시)**: 토큰 끊김·PC 이동·도구 전환 시 컨텍스트 손실 방지.
- **Superseded**: 4개 파일로 분산되어 "다 읽어보세요"가 됨 → 인수인계 본래 목적 훼손. D-012로 단일 파일 통합.

### D-009 — Admin 워크플로: 참고메모-first
~~숫자 기반 자동 초안~~ → **참고 자료(맨 위) → AI 초안 → 최종 작성/발행**.
- **Why**: 채권 데스크 실제 업무 흐름. 매일 텔레그램·뉴스에서 정보 수집 → 그걸 시드로 코멘트. 숫자 기반 초안은 사용자가 이미 아는 정보 재가공이라 가치 낮음.
- **영향**: Phase C 전면 재설계. `index.html` 코멘트 패널 교체, `app.js` 정리, `styles.css` stepper 추가.

### D-010 — LLM 통합은 차기 Phase로 분리
Phase C는 골격만. 실제 LLM 호출은 Phase H에서.
- **Why**: AI provider(OpenAI/Anthropic) 미결정. 회사 컴플라이언스 검토 필요. 골격 먼저 만들고 provider 결정 후 한 곳 갈아끼움.
- **현 동작**: "메모 기반 초안 생성" 버튼은 기존 숫자 기반 draft API 호출 (reference_note 함께 전달). UI에 "LLM 미연동" 안내 배너 노출.

### D-011 — 뉴스 크롤링은 별도 Phase로 분리
"전일 채권 뉴스 자동 수집"은 본 리디자인 1차 제외. Phase I.
- **Why**: 데이터 소스(RSS / 한경·이데일리 / 인포맥스 채권 섹션) 결정 + ToS·저작권 검토 + 키워드 필터링 별도 작업.
- **주의**: 연합인포맥스 단말기 = 별도 데이터 소스. `.env`의 챗봇용 인포맥스 API 자리와 **혼동 금지**.
- **현 단계**: 참고 메모 textarea에 사용자가 수동 복붙. "전일 뉴스 가져오기" 버튼은 disabled placeholder.

### D-012 — 인수인계 단일 파일 통합 (HANDOFF.md)
~~4종 파일 분산~~ → **`HANDOFF.md` 하나로 통합**.
- **Why**: D-008의 4종 파일은 "다 읽어야 함"이 되어 인수인계 본래 목적 훼손. 다른 도구한테 "HANDOFF.md 읽고 이어해줘" 한 줄로 끝나도록 단일 진입점 확보.
- **삭제 파일**: `docs/STATUS.md`, `docs/REDESIGN_LOG.md`, `docs/DECISIONS.md`
- **보존 파일**: `docs/REDESIGN_PLAN.md` (전체 6단계 상세 플랜, 참고용)
- **갱신 파일**: `AGENTS.md`, `README.md`, `design.md` (참조 링크 단일화)
- **운영 규칙**: 작업 끝나면 (1) "지금 바로 할 일" 갱신 (2) 새 결정 있으면 "의사결정 기록"에 D-XXX 추가 (3) "작업 일지" 최상단에 1줄 추가 (4) commit + push.

---

## 작업 일지 (최근 5건만 유지, 시간 역순)

> 그 이전 history는 `git log` 로 충분. 이 섹션은 항상 최신 5건으로 잘라쓰기.

### 2026-05-17 — Claude (집 PC) — 인수인계 단일 파일 통합
4종 추적 파일 → `HANDOFF.md` 하나로 통합. 기존 `docs/STATUS.md`, `docs/REDESIGN_LOG.md`, `docs/DECISIONS.md` 삭제. `AGENTS.md`/`README.md`/`design.md` 참조 갱신. D-012 추가. **다음**: Phase B 진입.

### 2026-05-17 — Claude (집 PC) — Phase C 골격 완료
참고메모-first 3단 stepper 구현. `index.html` 코멘트 패널 교체, `app.js` SQL 저장 경로 제거, `styles.css` stepper 추가. LLM·뉴스는 Phase H/I로 분리.

### 2026-05-17 — Claude (집 PC) — Phase A 완료
디자인 시스템 정립. `design.md` 전면 재작성, `styles.css`/`server.mjs` 토큰 + Pretendard 동기화. 백워드 호환 alias로 점진적 마이그레이션 보장.

### 2026-05-17 — Claude (집 PC) — 플랜 + 추적 인프라 구축
Phase A~G 분해, D-001~D-006 결정. 추적 파일 4종 신설 (D-008 — 이후 D-012로 단일화).

### 2026-05-17 — Codex (집 PC) — 1차 구현 완료 + GitHub push
Excel + 인포맥스 add-in 데이터 추출 → HTML 리포트 → Admin 화면 → Supabase 저장 파이프라인 작동. 디자인 철학 오류 5개 식별되어 리디자인 시작.

---

## 세션 시작 체크리스트

1. `git pull`
2. 이 파일 (`HANDOFF.md`) **"지금 바로 할 일"** 항목 확인
3. **"절대 건드리지 말 것"** 항목 숙지
4. 필요 시 **"의사결정 기록"**에서 관련 D-XXX 항목 참고
5. 작업 진행
6. 작업 끝나면:
   - "지금 바로 할 일" 갱신 (다음 사람이 무엇부터 할지)
   - 새 결정 있으면 D-XXX 항목 append
   - "작업 일지" 최상단에 1줄 추가 (옛 항목 밀어내기, 5건 유지)
   - `git add -A && git commit -m "..." && git push`

## 토큰 갑자기 끊긴 경우 (사용자용)

```powershell
git add -A
git commit -m "WIP: phase X 중단"
git push
```
다음 세션이 HANDOFF.md 보고 이어감.

---

## 더 깊은 맥락이 필요하면 (선택)

- `docs/REDESIGN_PLAN.md` — Phase A~I 전체 상세 플랜, 파일별 변경 영역
- `design.md` — 디자인 시스템 SSOT (토큰·컴포넌트·반응형)
- `AGENTS.md` — 프로젝트 전반 규칙 (데이터 원천, 산출물 정의)
- `git log` — 모든 작업 history

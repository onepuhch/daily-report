# Daily Report Handoff

## 2026-06-11 Collaborator-feature revert reconciliation (read this first)

History decision record:

- **2026-06-08**: User reviewed the features ported from the collaborator repo (`pllayer223-create/Daily-report`) and judged most of them duplicated/cluttered ("admin 페이지도 없고 중복 기능 덕지덕지"). Master was force-pushed back to `b40571f` plus one cleanup commit `b397774` (path-traversal fix `isPathInside`, 500-error message masking, static cache-control, removal of unused `@anthropic-ai/sdk`/`dotenv` deps).
- **Dropped by the revert** (7 commits, `795d1f5`..`5645efb`): report-v2 dashboard tabs, ops dashboard cards, dark/light toggle, economic-events calendar (+ API route + `db/economic_events*.sql`), multi-metric Trend workspace, KRX/NYSE holiday badges, and the `da78f24` dead-code/UTC-date fixes. Their work-log entries were moved to `docs/HANDOFF_ARCHIVE.md`.
- **2026-06-11**: This machine still had the pre-revert history; user confirmed the revert is canonical. Local audit-day commits were rebased onto `b397774` and the calendar-dependent pieces were removed again (see below). The UTC-prone `toISOString().slice(0,10)` date fallback in `report_v2/app.js` was re-fixed with a local-date helper because that bug fix was lost in the revert.

Leftover to be aware of:

- Supabase still has the `economic_events` table and June 2026 seed rows (user ran the SQL on 2026-06-05), but nothing in the product reads it anymore. Decide later: drop the table, or keep it for a future calendar reintroduction.

## 2026-06-11 Metric definition single source, startup guard, first automated tests

Full-project audit follow-up. Implemented the remaining recommendations:

- Added `scripts/metric_definitions.json` as the single source of truth for all 59 metric definitions (key/name/category/sheet/column/unit/change_mode/value_multiplier).
  - `scripts/import_historical_market_data.py` now loads `METRICS` from the JSON instead of the inline 59-entry list.
  - `scripts/Export-MarketDailyCachedValues.ps1` `Get-MetricDefinitions` now loads from the same JSON.
  - Adding a metric now requires editing only `metric_definitions.json`; PowerShell and Python stay in sync automatically.
- Added a fail-closed startup guard `checkStartupSafety()` to `src/daily_report/admin/server.mjs`: the server refuses to start when binding `0.0.0.0` in write mode without Basic Auth credentials. Defense-in-depth for Render; local `127.0.0.1` runs are unaffected.
- Added the first automated test suite: `tests/metric-definitions.test.mjs` (7 tests — array shape, 59-count, unique keys, required fields, valid categories/change_modes, positive multipliers). New `npm test` script (`node --test tests/*.test.mjs`).
- Render dashboard confirmed by user: `DAILY_REPORT_BASIC_AUTH_USER`/`PASSWORD` are actually filled in.

Validation:

- `npm test` — 7/7 pass.
- `node --check src\daily_report\admin\server.mjs` pass.
- `scripts\verify-pipeline.cmd` — all checks pass (latest `2026-06-08`, observations 59, KOSPI 299 points).
- Python JSON-loading logic verified inline (59 `MetricDef` instances, unique keys).

Same-day follow-up (agreed priority items):

1. **Done** — Telegram failure alert: `Send-FailureAlert` in `Run-DailyMarketUpdate.ps1`, hooked into every `Record-JobRun -Status failed` path. Activates when `.env` has `DAILY_REPORT_ALERT_TELEGRAM_BOT_TOKEN`/`CHAT_ID`; silently skips otherwise. Verified: parser OK, skip path OK, invalid-token send fails gracefully without breaking the batch. Setup steps in `docs/OPERATOR_GUIDE.md`.
2. **Removed after the revert decision** — A monthly `economic_events` seed routine was built, then deleted the same day because the 06-08 revert removed the economic calendar from the product entirely.
3. **Done** — HANDOFF.md archive split: May 2026 work logs moved to `docs/HANDOFF_ARCHIVE.md` (~1,200 lines). This file keeps the current entries + the core 인수인계서 sections. 지금 바로 할 일/진행 현황/작업 일지 refreshed to current state (59 metrics, Render deployed).
4. **Pending** — Gradual module split of `server.mjs` / `report_v2/app.js` when next features land.

#  인수인계서 (이 파일 하나만 보면 됩니다)

## MVP 정의 (2026-05-20 확정)

자금운용본부 내부에서 매일 데이터 → 코멘트 → 발행이 끊김 없이 도는 상태를 1차 MVP로 한다.

단계:
- 1단계 — 데이터 적재 MVP: 매일 아침 엑셀 데이터가 검증된 채 DB에 들어가고, 실패 시 운영자가 알아채고 수동 재실행할 수 있다.
- 2단계 — Admin 운영 MVP: 운영자가 DB 데이터를 확인·검증·코멘트 수정해 발행한다.
- 3단계 — 공개 리포트 MVP: 외부 독자가 안정적으로 HTML 리포트를 받는다.
- 4단계 — AI/챗봇/크롤링: 인터페이스만 유지 (`AI_CONTEXT_CONTRACT.md`), 구현은 나중.

디자인 정교화, 사이드 패널 고도화, 시각화 실험은 4단계까지 끝난 뒤 별도 사이클로 진행한다.

## 2026-05-20 현재 목표와 MVP 기준

MVP 정의: **자금운용본부 내부에서 매일 데이터 → 코멘트 → 발행이 끊김 없이 도는 상태**.

제품 목표는 시니어 수준의 개발자가 만든 내부 운영 도구처럼 데일리 리포트 작성과 발행을 자동화하는 것이다.

MVP에 포함되는 것:
- 인포맥스 Excel add-in을 우선 원천으로 사용한다.
- Excel을 열고 일정 시간 대기해 각 시트 데이터 갱신이 완료되면 수치 데이터를 추출한다.
- 엑셀 원본 `MARKET DAILY.xlsm`의 `MARKET DAILY` 시트에 있는 항목이 DB/리포트에서 누락되지 않았는지 점검한다.
- Supabase 업로드 전 검증을 통과한 데이터만 DB에 적재한다.
- 검증 결과는 운영자가 화면에서 확인할 수 있어야 하며, 승인 UI는 실제 사용하면서 기준을 다듬는다.
- 리포트 코멘트는 관리자 페이지에서 수정/입력한다.
- Supabase 수치 데이터와 최종 코멘트를 기준으로 공개 HTML 리포트를 조회한다.
- 자동 실행 실패 시 로그와 오류 내용을 사람이 확인할 수 있어야 한다.

MVP 이후로 미루는 것:
- AI가 뉴스 데이터, 지정 텔레그램/참고 메모, 수치 데이터, 과거 코멘트를 기반으로 코멘트 초안을 작성한다.
- 단, 향후 사용자가 부재중인 날에는 AI 코멘트를 자동 발행할 수 있는 운영 모드가 필요하다.
  - 기본값은 수동 검토 모드.
  - 자동 발행 모드는 별도 설정/스케줄 조건으로 켠다.
  - 자동 발행 시에는 초안 생성 근거, 사용 데이터, 발행 상태, 작업 로그를 반드시 남긴다.
- AI API 기반 챗봇은 공개 리포트/관리자 화면의 선택 지표 문맥과 연결한다.
- 최종 리포트 디자인과 시각화는 계속 개선하되, 1단계 MVP 안정화 전에는 큰 디자인 재구성을 중단한다.

현재 방향 판단:
- 방향은 맞다.
- 아직 완성품은 아니고, 작동하는 프로토타입에서 운영 가능한 내부 도구로 올리는 단계다.
- 과거 PNG/PDF OCR은 초기 백필 1회 작업이다. 추가 과거 파일이 생기지 않는 한 일일 자동화 경로에는 포함하지 않는다.
- D-003 정리(Chart.js/D3 제거, 인라인 SVG 유지)는 이미 결정된 기술부채 정리이므로 디자인 중단 예외로 1단계에 포함한다.

현재 DB/자동화 상태:
- `reports`: 286건 (`2025-04-14` ~ `2026-05-18`)
- `market_observations`: 9,834건
- `report_comments`: 286건
- `source_documents`: 194건 (`2025-07-15` ~ `2026-05-18`)
- Windows 작업 스케줄러 `Market Daily Supabase Upload` 등록 완료, 매일 07:00 실행.
- 상태 점검은 `scripts/07_check_pipeline_status.cmd`로 확인한다.
- `job_runs` 테이블 생성 완료. `scripts/Run-DailyMarketUpdate.ps1` 실행 시 `started/success/failed` 로그가 DB에 기록된다.
- 2026-05-19 08:30 자동 실행은 Excel COM 저장 단계에서 1회 실패했으나, 남은 Excel 프로세스를 종료하고 `Run-DailyMarketUpdate.ps1 -Visible -LookbackDays 10`로 재실행해 성공 처리했다.
- 다른 PC/다른 사람이 수동 복구할 때는 `scripts/08_manual_reupload.cmd`를 실행한다.
  - 실패 시 최근 로그와 마지막 오류를 화면에 출력한다.
  - 상태 확인은 `scripts/07_check_pipeline_status.cmd`.
  - 데이터 검증은 `scripts/09_validate_daily_data.cmd`.
- 최신 검증 프로세스:
  - 로컬 JSON 핵심 지표 존재/숫자 여부 확인.
  - Supabase `reports`, `market_observations`, `report_comments` 반영 여부 확인.
  - Yahoo Finance 기준 KOSPI, USD/KRW, WTI, US 10Y 경고 수준 크로스체크.
  - 외부 가격 비교는 시차/종가 기준 차이가 있으므로 당장은 경고로만 사용한다.

## 자동화 실패 시 대응

1. Admin → 자동화 로그 탭에서 실패 날짜와 `failed` 상태를 확인한다.
2. 실패 행의 메시지를 읽고, `로그 보기`를 눌러 팝업의 운영자 요약과 다음 조치를 확인한다.
3. 원문 로그는 개발자/운영 지원용이다. 운영자는 팝업 상단 요약을 먼저 따른다.
4. 로그 팝업에 파일 없음/로드 실패가 표시되면 해당 자동화가 다른 PC에서 실행됐거나 로컬 로그 파일이 삭제된 상태일 수 있다.
5. 엑셀이 열려 있거나 멈춘 상태라면 Excel을 정상 종료한 뒤 다시 시도한다.
6. 수동 재실행은 Admin → 자동화 로그에서 실패 행 체크 → `선택 항목 재실행`을 우선 사용한다. 동일한 작업을 PowerShell에서 직접 실행해야 한다면:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\Run-DailyMarketUpdate.ps1 -LookbackDays 2
```

7. 이미 엑셀 데이터가 갱신되어 있고 업로드만 다시 해야 한다면 시스템이 실패 메시지 기준으로 `-SkipRefresh` 재실행을 자동 선택한다. PowerShell에서 직접 실행해야 한다면:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\Run-DailyMarketUpdate.ps1 -SkipRefresh -LookbackDays 2
```

8. 재실행 뒤 Admin → 자동화 로그 탭에서 최신 실행이 `success`인지 확인한다.
9. 그래도 실패하면 `scripts\07_check_pipeline_status.cmd`와 `scripts\09_validate_daily_data.cmd` 결과를 함께 확인한다.

1단계 우선순위:
1. 엑셀 원본 항목 누락 여부 점검: `MARKET DAILY.xlsm`의 `MARKET DAILY` 시트 기준으로 DB/리포트 누락 항목을 확인한다.
2. D-003 정리 완료 확인: 공개 리포트 차트/스파크라인은 Chart.js/D3 없이 인라인 SVG로 유지한다.
3. 검증 pre-upload gate 운영화: 업로드 전 검증 실패 시 Supabase 적재를 막고, 실패 사유를 로그와 관리자 화면에서 확인한다.
4. 승인 UI dogfooding: 검증 차이에 대한 승인/무시 흐름을 실제 운영에서 써보며 필요한 기준만 남긴다.
5. 자동화 로그 화면 보강: 성공/실패, 실행 시간, 오류 메시지, 수동 재실행 방법을 운영자가 바로 볼 수 있게 한다.
6. 관리자 화면 한글 문구와 탭 구조 정리: 데이터/코멘트/검증/미리보기/자동화 로그의 일일 발행 흐름만 우선 안정화한다.

---

> 다른 PC·다른 AI 도구(Codex/Claude/Gemini 등)로 작업을 이어받을 때 이 파일만 읽으면 즉시 진입 가능.
> 작업 끝나면 **반드시 이 파일을 갱신**하고 commit + push.

---

## 한 줄 요약
일일 자동 발행 파이프라인(07:00 배치 → 검증 → Supabase → Admin 코멘트 → 공개 V2)이 59개 지표로 작동 중이고, Render 데모 배포까지 완료된 상태다. 지금은 새 기능보다 운영 안정화(실패 알림, 월간 캘린더 갱신, 점진 모듈 분리)를 우선한다.

---

## 지금 바로 할 일

1. **Telegram 실패 알림 활성화** — 코드는 들어가 있다(`Run-DailyMarketUpdate.ps1`의 `Send-FailureAlert`). 운영자가 `.env`에 `DAILY_REPORT_ALERT_TELEGRAM_BOT_TOKEN` / `DAILY_REPORT_ALERT_TELEGRAM_CHAT_ID`를 채우면 끝. 절차는 `docs/OPERATOR_GUIDE.md`의 "자동 실행 실패 알림" 참조.
2. **Supabase `economic_events` 테이블 처분 결정** — 2026-06-08 원복으로 경제 캘린더 UI/API가 제거됐지만 Supabase에는 테이블과 6월 시드 데이터가 남아 있다. 캘린더를 재도입할 계획이 없으면 SQL editor에서 `drop table public.economic_events;`로 정리, 재도입 예정이면 그대로 둔다.
3. **needs_review 과거 코멘트 정리 (선택, 틈틈이)** — `data\historical_ocr\cleaned_comments\needs_review.json`의 항목을 `boxes\*.comment_box.png` 원본과 대조해 승인 폴더로 이동.
4. **다음 기능 추가 시 모듈 분리 시작** — `server.mjs`(~98KB)는 라우트 단위, `report_v2/app.js`(~87KB)는 기능 단위로, 새 코드를 별도 모듈로 빼는 것부터 시작한다. 빅뱅 리팩토링은 하지 않는다.

---

## 절대 건드리지 말 것

- **`scripts/` 폴더** — Excel + 인포맥스 add-in 매크로 파이프라인. Codex가 세팅한 데이터 추출 코어.
- **`.env`** — 커밋 금지 (`.gitignore` 등록됨). Supabase URL/Key 들어있음.
- **카카오뱅크 브랜드 색상** — 컴플라이언스. 중립 팔레트(Stripe blue + 한국식 빨/파)만 사용.
- **데이터 API 라우트와 헬퍼 함수** — `/api/reports`, `/api/comments/*`, `/api/ask`, `/api/metrics/*`, `extractMetrics`, `formatChange` 등은 그대로 사용.

---

## 진행 현황

| 영역 | 상태 | 내용 |
|---|---|---|
| 데이터 적재 | 안정 운영 | 07:00 배치 → 추출 → 검증 → Supabase 업로드 작동. 59개 지표(투자자 동향 15개 포함). 실패 시 Telegram 알림 코드 추가(.env 설정 필요). |
| 지표 매핑 | 단일화 완료 | `scripts/metric_definitions.json`이 단일 진실 소스. Python/PowerShell 양쪽이 여기서 로드. `npm test`로 검증. |
| 검증 gate | 작동 중 | pre-upload 검증 실패 시 업로드 차단, post-upload DB 검증, `job_runs` 기록. |
| 자동화 로그 | 작동 중 | `job_runs` 기록, Admin 로그 보기 팝업, 실패 행 재실행. |
| Admin | 작동 중 | 단일 report 화면(상태바 → 데이터 → 코멘트 → 발행) + 자동화 로그 뷰. Supabase 우선 조회. |
| 공개 리포트 V2 | 작동 중 | 2x2 카드 + 투자자 동향 + 날짜 달력 팝오버 구성(2026-06-08 원복 후 기준). Render 데모 배포 완료(Basic Auth + startup 가드 + 정적 서빙 경로 검증). |
| 과거 데이터 백필 | 1회 완료 | PNG OCR 코멘트/투자자 동향 백필 완료. `needs_review` 코멘트 정리만 남음. |
| AI/뉴스/챗봇 | 보류 | rule_based provider + `AI_CONTEXT_CONTRACT.md` 경계 유지. provider-backed LLM은 D-017 비교 후 연결. |

이전 리디자인 상세 플랜은 참고용으로만 본다: `docs/REDESIGN_PLAN.md`

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

### D-013 — MVP 1단계 범위 고정
1단계는 “자금운용본부 내부에서 매일 데이터 → 코멘트 → 발행이 끊김 없이 도는 상태”를 만드는 데 집중한다.
- **Why**: 데이터 적재, 검증, Admin, 공개 리포트, AI, 디자인을 동시에 확장하면 우선순위가 흐려진다. 운영 가능한 일일 발행 흐름이 먼저 안정되어야 한다.
- **포함**: 엑셀 원본 항목 누락 점검, pre-upload 검증, 승인 UI dogfooding, 자동화 로그, D-003 인라인 SVG 정리.
- **보류**: 큰 디자인 재구성, AI 챗봇 고도화, 뉴스/텔레그램 자동 수집, 자동 발행 모드.
- **영향**: 다음 작업은 1단계 우선순위 밖의 새 UI/AI 기능보다 운영 안정화 항목을 먼저 처리한다.

### D-014 — 공개 리포트 1단계는 상세 패널 없음
옵션 C(Chart.js 하이브리드)를 폐기하고 옵션 A로 전환한다. 공개 리포트 1단계에서는 지표 상세 패널을 제거하고, Chart.js/D3 없이 인라인 SVG만 사용한다.
- **Why**: 1단계 MVP의 목적은 데이터 적재/검증/발행 안정화다. 상세 패널과 hover tooltip은 현재 운영 가치보다 범위 확장 비용이 크다.
- **영향**: `src/daily_report/report/index.html`, `app.js`, `styles.css`에서 metric detail panel 제거. 챗봇 payload는 `selected_metric: null`을 허용한다.
- **향후**: 4단계 이후 지표 상세/시각화 사이클에서 필요성이 검증되면 별도 설계로 재도입한다.

### D-015 — Admin/공개 리포트 조회는 Supabase 우선
`/api/reports`, `/api/reports/:date`, `/api/history`, `/api/metrics/:metric_key/series`는 Supabase를 우선 조회하고 로컬 `data/processed` JSON은 fallback으로만 사용한다.
- **Why**: 일일 자동화는 Supabase에 최신 데이터를 적재하지만, Admin 날짜 목록이 로컬 processed 파일만 보면 최신 리포트가 화면에 나타나지 않는다.
- **영향**: 화면 라우트 계약은 유지한다. 내부 조회 소스만 Supabase 우선으로 바꾸고, 코멘트 저장은 기존 Supabase report row의 `report_comments`/`reports.status`를 직접 갱신한다.
- **주의**: Supabase 설정이 없거나 비어 있는 개발 환경에서는 기존 로컬 JSON fallback을 계속 사용한다.

### D-016 — 수신자 채널은 기존 카톡 단톡방 + PNG 하이브리드
재무실 50명 배포는 기존 카톡 단톡방을 그대로 사용한다. 자동 생성 PNG(운영자가 텔레그램 또는 Admin에서 받아 수동 forward) + 핵심 숫자 텍스트 요약 + "자세히 보기" 웹 링크.
- **결정일**: 2026-05-23
- **Why**: 카카오 비즈니스 계정이 회사 정책상 발급되지 않아 자동 카톡 게시는 불가능하다. 50명에게 텔레그램/슬랙 이전을 요구하는 것은 수신자 행동 변화 비용이 과하다. 기존 캡처-단톡방 흐름을 그대로 유지하면서 동시에 검색 가능한 웹 아카이브를 누적한다.
- **영향**: D-006의 "PNG/PDF 1차 제외"를 일일 배포 경로에 한해 뒤집는다. Admin에 Puppeteer 기반 PNG 생성 엔드포인트와 "오늘 PNG" 버튼이 필요하다. 웹 링크는 검색 가능한 아카이브 용도로 계속 살린다.
- **Cross-messenger 한계**: 어떤 봇도 카톡 단톡방에 자동 게시할 수 없다. "운영자가 수동 forward" 단계는 prototype 단계에서 유지한다. 본부장 보고 후 회사 명의 카톡 비즈니스 계정이 발급되면 재검토.

### D-017 — LLM provider는 Qwen vs DeepSeek API 비교 후 선택
코멘트 초안 생성용 LLM은 Qwen API와 DeepSeek API를 같은 프롬프트로 5~10건 비교한 뒤 운영자가 한국어 품질 기준으로 선택한다. 로컬/셀프호스팅 LLM은 제외.
- **결정일**: 2026-05-23
- **Why**: 데일리 리포트 1건당 5,000~7,000 토큰, 월 비용 약 $0.1(~130원)로 사실상 무료에 가깝다. 무료 quota만으로 prototype 기간을 커버한다. 로컬 LLM은 인포맥스 PC에 GPU가 없어 7B급 작은 모델에 한정되는데, 한국어 금융 코멘트 품질에서 호스티드 70B급과 격차가 크다. 24/7 PC 가동 의존성도 추가된다.
- **영향**: `src/daily_report/ai/`에 `qwen_provider.mjs`, `deepseek_provider.mjs` 어댑터 추가. 기존 `llm_provider.mjs` 경계 뒤에서 환경변수로 전환. 운영자가 두 provider 모두 개인 가입해서 API 키 발급, 5~10건 dogfooding 후 결정.
- **컴플라이언스**: 인포맥스 PC가 외부망이고 시장 데이터/발행 전 코멘트의 외부 API 전송 OK라고 운영자가 확인.

### D-018 — 운영자 통제는 단순 명령어 텔레그램 봇 (자연어 에이전트 X)
운영자 본인용 알림 + 명령 채널은 텔레그램 봇 하나로 통일한다. 50명용이 아니라 운영자 1명용. 명령어 기반(`/status`, `/today_png`, `/publish`, `/log`), 자연어 AI 에이전트 아님.
- **결정일**: 2026-05-23
- **Why**: 텔레그램 봇은 무료, 즉시 셋업 가능, 운영자가 이미 개인적으로 사용. 자연어 AI 에이전트("오늘 PNG 만들고 카톡에 올려줘")는 (1) 명령당 LLM 비용 추가, (2) 발행/배포 같은 위험 액션에 대한 접근 통제가 약함, (3) 카톡-텔레그램 메신저 갭으로 "올려줘" 단계는 결국 운영자 수동이라 자연어 자유도의 실익이 작다.
- **영향**: 새 모듈 추가 예정. 명령: `/status`(최신 job_runs 행), `/today_png`(Puppeteer PNG 반환), `/publish`(draft→reviewed/published), `/log`(최신 job 로그 요약). Push 알림: 배치 성공/실패, 검증 mismatch, freshness 경고, 발행 완료.
- **향후**: 자연어 AI 에이전트 레이어는 추후 phase에서 추가 가능하되, 읽기/분석 명령("어제 코멘트랑 비교 요약")에 한정. 발행/배포 같은 destructive 액션은 명시 명령어 유지.

### D-019 — 휴가 모드는 단계적 폴백 (단일 모드 X)
운영자 부재 운영은 순차 폴백으로 처리: 운영자 모바일 셀프(텔레그램) → Admin "현재 담당자" 필드의 대체자 → AI 자동 발행("AI 자동 생성" 배너 명시).
- **결정일**: 2026-05-23
- **Why**: 각 단계는 통제와 자율성 사이 trade-off가 다르다. 평소엔 운영자가 통제를 유지하고 싶고, 진짜 부재 시(장기 휴가, 해외)에도 리포트 누락은 피하고 싶다. 항상 AI 자동 발행은 품질 신뢰 형성 전엔 위험하고, AI 발행을 절대 안 하면 시스템이 운영자에 완전 의존한다.
- **영향**: Admin에 "현재 담당자" 필드 추가. 운영자가 텔레그램으로 reachable하면 본인 처리. unreachable이면 Admin에 지정된 대체자가 처리. 둘 다 정상 발행 시각 이후 N시간 unreachable이면 AI 초안으로 자동 발행하되 "AI 자동 생성. 오류 발견 시 ___로 연락" 배너 표시. 자동 발행 모드는 daily opt-in, 기본 off.
- **신뢰 형성**: AI 자동 발행 모드는 운영자가 최소 1개월 AI 초안 검토하며 품질에 만족한 뒤 활성화. LLM provider 결정 후 재검토.

### D-020 — 본부장 보고 전엔 demo 클라우드, 보고 후 정식화
본부장 보고(2026-05-23 기준 다음 달, 2026-06) 전엔 운영자 개인 명의 클라우드(Railway 또는 Render, 월 약 $5)에 demo 배포. 보고 후 회사로 인프라 소유권 이관 요청.
- **결정일**: 2026-05-23
- **Why**: 현재 로컬 PC 전용 배포는 운영자 PC가 꺼지면 죽고, 모바일 접근 차단되고, 본부장에게 화면공유 없이 시연 불가. 저비용 개인 클라우드로 세 가지 다 해소. 본부장 승인 전엔 회사 인프라 지원을 요청하지 않는 게 자연스럽다.
- **영향**: Admin 서버를 Railway/Render의 Node 템플릿으로 배포. 인포맥스 PC는 Excel 새로고침/추출 잡만 계속 담당(Admin 서버는 호스트 안 함). 본부장 승인 후 회사에 (1) 회사 명의 카톡 비즈니스 계정 발급, (2) Railway 호스팅 비용 이관, (3) 회사 승인 배포 위치로 이전 검토를 요청.
- **BCM 효과**: 운영자 PC가 데이터 파이프라인 + 운영자 UI 둘 다 호스트하는 단일 장애점이 풀린다.

### D-021 — 공개 V2 브랜딩은 카카오뱅크 로고(중립 검정), 장식 노란색 제거
공개 리포트 V2 좌측 사이드 브랜드를 카카오뱅크 로고로 교체한다. 가로형 시그니처(Primary Black)를 기본으로 쓰고, 축소 사이드바에서는 심볼만 노출한다. 기존 노란 박스/사이드 노트(`KB / Treasury market brief.`) 등 장식 요소는 제거한다.
- **결정일**: 2026-05-25
- **Why**: 운영자가 카카오뱅크 로고 리소스를 제공했고, 실제 부서 산출물로 보이려면 브랜드가 명확해야 한다. 단 D-002/“절대 건드리지 말 것”의 컴플라이언스 원칙(중립 팔레트)은 유지하므로 Primary Black 로고만 쓰고 카카오뱅크 노란색을 테마 색으로 도입하지 않는다.
- **영향**: `report_v2/index.html` 사이드 브랜드 마크업, `styles.css` `.brand-logo*`, 로고 SVG 2종을 `report_v2/`에 배치. 상승/하락 색(D-002)과 전체 팔레트는 불변.

### D-022 — 공개 V2 2x2 카드 = 금리·크레딧 / 주식·투자자(+암호화폐) / 환율 / 원자재
공개 리포트 V2 하단 시장 데이터 카드를 4분할로 재편한다. 은행채는 `금리·크레딧`, 암호화폐와 투자자 순매수(선물/주식 전체)는 `주식·투자자` 카드에 넣는다. 환율은 단독, 원자재 단독.
- **결정일**: 2026-05-25
- **Why**: 채권 운용 데스크 관점에서 은행채는 크레딧 성격이라 금리·크레딧과 함께 읽힌다. 암호화폐는 위험자산이라 주식과 같은 카드가 직관적이다. 투자자 순매수까지 주식 카드에 모으면 4개 카드 부피가 2x2로 비교적 균형 있게 맞는다(운영자 판단).
- **영향**: `report_v2/app.js` `CATEGORY_META`/`CATEGORY_ORDER`/`metricTone`(crypto→green). 투자자 동향은 표 15행 대신 `renderFlowsBlock` 컴팩트 블록으로 카드 안에 렌더. 추출 단계 카테고리(`investor_flows`, `crypto`)는 그대로이고, 카드 묶음만 UI 레벨 결정이다.
- **주의**: 투자자 동향은 Supabase 재업로드 후에야 표시된다(D-... 투자자 동향 재업로드 작업과 동일 의존).

### D-023 — 은행채 재도입 (intended_exclusion 해제 → credit)
`docs/EXCEL_COVERAGE.md`에서 intended_exclusion이던 은행채 AAA를 다시 추출 대상으로 넣는다. 카테고리는 `credit`.
- **결정일**: 2026-05-25
- **Why**: 원본 엑셀에 있던 은행채가 현재 리포트 지표 세트에서 빠져 있다는 운영자 확인. 금리·크레딧 카드에 다시 필요하다.
- **영향**: `scripts/Export-MarketDailyCachedValues.ps1`와 `scripts/import_historical_market_data.py` 양쪽 매핑에 은행채 AAA 만기를 추가(권장 시작: 1년·2년·3년, `category=credit`, `unit=%`, `ChangeMode=rate_bp`). 정확한 열 위치는 인포맥스 PC 워크북 `국내금리` 시트에서 확인해야 하며, 추가 후 재추출/재업로드가 필요하다. V2 UI는 `credit` 지표를 자동 표시하므로 추가 코드 변경은 없다.

---

## 작업 일지 (최근 5건만 유지, 시간 역순)

> 그 이전 history는 `docs/HANDOFF_ARCHIVE.md`와 `git log`로 충분. 이 섹션은 항상 최신 5건으로 잘라쓰기.

### 2026-06-11 — Claude — 원복 정합화 + 전체 감사 후속 (매핑 단일화/startup 가드/테스트/실패 알림/아카이브)
로컬에 남아있던 원복 이전 히스토리를 원격(`b397774`) 기준으로 rebase. `scripts/metric_definitions.json` 단일 진실 소스화(Python/PS1 양쪽 로드), `server.mjs` fail-closed startup 가드, 첫 자동 테스트 7건(`npm test`), `Run-DailyMarketUpdate.ps1` Telegram 실패 알림(.env 설정 시 활성화), HANDOFF.md 과거 일지를 `docs/HANDOFF_ARCHIVE.md`로 분리, 원복으로 되살아난 UTC 날짜 버그 재수정. 검증: npm test 7/7, verify-pipeline 통과.

### 2026-06-08 — 사용자 — 협업자 기능 원복 + 보안 정리 (b397774)
협업 repo에서 들여온 기능 7커밋(탭/ops 카드/다크모드/경제 캘린더/Trend 워크스페이스/KRX 배지)을 force-push로 제거. 같은 커밋에서 path traversal 수정(`isPathInside`), 500 에러 메시지 마스킹, 정적 캐시 헤더, 미사용 의존성 제거. 폐기된 작업 일지는 `docs/HANDOFF_ARCHIVE.md` 참조.

### 2026-06-01 — V2 정렬/Render write mode (일부 원복됨)
`render.yaml` `DAILY_REPORT_READ_ONLY=false` 전환(발행 허용)은 유지. report-v2 정렬 변경은 06-08 원복으로 제거됨.

### 2026-05-29 — PNG 커버리지/투자자 동향 백필/Infomax 복구
PNG 가시 지표 전수(59개) 매핑 완료+재업로드(242 리포트/11,032 obs), 투자자 동향 PNG 백필 1,182건, Infomax stale 세션 자동 복구 재시도 추가. 상세는 `docs/HANDOFF_ARCHIVE.md`.

---

## 세션 시작 체크리스트

1. `git pull`
2. `scripts\check-workspace-sync.cmd`로 Git/origin, 로컬 generated 파일, Supabase 최신 날짜 차이를 확인
3. 이 파일 (`HANDOFF.md`) **"지금 바로 할 일"** 항목 확인
4. **"절대 건드리지 말 것"** 항목 숙지
5. 필요 시 **"의사결정 기록"**에서 관련 D-XXX 항목 참고
6. 작업 진행
7. 작업 끝나면:
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

- `docs/HANDOFF_ARCHIVE.md` — 2026-05 작업 일지 원본 전체 (PNG 백필, Infomax 자동화, V2 리디자인 과정)
- `docs/REDESIGN_PLAN.md` — Phase A~I 전체 상세 플랜, 파일별 변경 영역
- `design.md` — 디자인 시스템 SSOT (토큰·컴포넌트·반응형)
- `AGENTS.md` — 프로젝트 전반 규칙 (데이터 원천, 산출물 정의)
- `git log` — 모든 작업 history

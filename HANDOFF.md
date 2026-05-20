# 인수인계서 (이 파일 하나만 보면 됩니다)

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
- Windows 작업 스케줄러 `Market Daily Supabase Upload` 등록 완료, 매일 08:30 실행.
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
현재는 “운영 가능한 일일 발행 MVP” 1단계다. 새 디자인 확장보다 데이터 누락 점검, pre-upload 검증, 승인 UI dogfooding, 자동화 로그를 우선한다.

## 지금 바로 할 일

**1단계 — 데이터 적재/검증/발행 MVP 안정화**

1. Admin 자동화 로그 dogfooding
   - 실제 실패 행 체크 → `선택 항목 재실행`을 운영자가 이해하는지 확인한다.
   - 현재는 백그라운드 실행 연결까지 완료했으나, 실제 클릭 테스트는 Excel/DB 업로드가 실행되므로 운영자 확인 후 진행한다.
   - 행 기반 재실행 UX가 과하면 1단계 후반으로 미루고 “로그 요약 + 수동 명령”만 남긴다.
2. 검증 pre-upload gate 운영 확인
   - 업로드 전 검증 실패 시 Supabase 적재가 막히는지 실제 실패 케이스에서 확인한다.
   - 실패 사유가 `job_runs.message`, 로그 팝업 요약, 원문 로그에 충분히 남는지 확인한다.
3. 승인 UI dogfooding
   - 검증 차이가 있을 때 승인/무시 흐름을 실제로 눌러보며 운영에 필요한 최소 기능만 남긴다.
   - DB 덮어쓰기 버튼은 아직 보류한다.
4. 엑셀 원본 항목 점검 2차
   - `docs/EXCEL_COVERAGE.md` 기준 mapped metric 누락은 0건.
   - 다음에는 사용자 눈으로 중요 항목이 빠지지 않았는지 확인하고, 의도적 제외 항목은 문서에 사유를 추가한다.
5. Admin 2단계 진입 체크리스트 작성
   - 데이터/미리보기/코멘트/검증/자동화 로그 각 화면이 MVP에서 해야 할 일을 1~3줄로 정의한다.
   - 충족/미충족을 분리하고, 미충족만 2단계 작업으로 넘긴다.
6. 공개 리포트 디자인/시각화는 보류
   - 1단계에서는 깨짐 여부만 확인한다.
   - 클릭형 차트, 상세 패널, 디자인 실험은 데이터 적재 MVP 안정화 뒤 별도 사이클로 진행한다.

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
| 데이터 적재 | 진행 중 | Excel 갱신 → 추출 → 검증 → Supabase 업로드 경로 작동. 운영 안정화 필요. |
| 엑셀 원본 항목 점검 | 1차 완료 | `docs/EXCEL_COVERAGE.md` 생성. 현재 매핑 35개, 최신 JSON 35개, Admin API 35개로 mapped metric 누락 0건. |
| 검증 gate | 진행 중 | pre-upload 검증과 Yahoo cross-check 작동. 2026-05-18 mismatch 3건 확인. 실제 승인 처리는 값 차이가 커서 보류. |
| 자동화 로그 | 진행 중 | `job_runs` 기록 작동. 실패 행 강조, Admin 내 로그 보기 팝업과 운영자용 요약/다음 조치 추가. 실패 대응 절차 문서화 완료. |
| Admin | 진행 중 | 데이터/코멘트/검증/미리보기/자동화 로그 중심으로 MVP 흐름 정리 중. |
| 공개 리포트 | 진행 중 | Supabase 기준 HTML 조회 작동. 원본 항목 누락/분류/표기 확인이 우선. |
| AI/뉴스/챗봇 | 보류 | 계약 문서는 유지하되 1단계 MVP 안정화 후 구현. |

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

---

## 작업 일지 (최근 5건만 유지, 시간 역순)

> 그 이전 history는 `git log` 로 충분. 이 섹션은 항상 최신 5건으로 잘라쓰기.

### 2026-05-20 — Codex — 자동화 로그 운영자 친화화 1차
Admin 자동화 로그에서 실패 행 강조, 실패 메시지 줄바꿈, 로그 경로 복사 버튼을 추가. `HANDOFF.md`에 “자동화 실패 시 대응” 절차 추가.

### 2026-05-20 — Codex — 승인 UI dogfooding 후보 확인
`/api/validation/2026-05-18`에서 KOSPI/KOSPI200/KOSDAQ mismatch 3건 확인. 값 차이가 커서 실제 `validation_approvals` 승인 레코드는 생성하지 않음. 승인 UI는 “확실한 우리 값” 케이스에서만 dogfooding한다.

### 2026-05-20 — Codex — 엑셀 원본 항목 커버리지 1차 점검
`docs/EXCEL_COVERAGE.md` 생성. 추출 매핑 35개와 최신 `market_daily_2026-05-18.json`/Admin API observations 35개가 일치함을 확인. 국내금리 일부 원천 컬럼은 의도적 제외로 분류.

### 2026-05-20 — Codex — 공개 리포트 상세 패널 제거
옵션 C를 폐기하고 옵션 A로 전환. 공개 리포트 metric detail panel을 제거하고, 챗봇이 `selected_metric: null` 상태에서도 현재 리포트 문맥으로 동작하도록 payload를 보정. D-014 추가.

### 2026-05-20 — Codex — MVP 1단계 범위 재정리
`HANDOFF.md` 상단을 “운영 가능한 일일 발행 MVP” 기준으로 재정리. 엑셀 원본 항목 누락 점검, D-003 완료 확인, pre-upload 검증, 승인 UI dogfooding, 자동화 로그를 1단계 우선순위로 고정. D-013 추가.

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
## 2026-05-19 Codex update - 목표와 현재 방향

### 최종 목표

시니어 수준의 개발자가 만든 내부 운영 도구처럼, 데일리 리포트 작성과 발행 과정을 자동화한다.

핵심 기준:
- 매일 반복되는 수작업을 줄인다.
- 데이터 원천과 발행 결과를 추적 가능하게 만든다.
- 사람이 최종 판단과 발행 권한을 갖는다.
- 숫자 데이터, 코멘트, 참고 자료를 Supabase에 누적해 이후 AI 검색과 챗봇에 활용한다.
- 다음 개발자나 AI 도구가 `HANDOFF.md`만 보고 이어받을 수 있게 유지한다.

### 제품 목표

1. 하네스 스켈레톤 코드 기반으로 개발한다.
2. 데이터는 인포맥스 Excel add-in을 우선 원천으로 사용한다.
3. Excel을 열고 일정 시간 대기해 각 시트의 데이터 갱신이 완료되면 Supabase로 전송한다.
4. Supabase에 쌓인 수치 데이터를 기준으로 리포트 페이지를 생성하고 조회할 수 있게 한다.
5. 리포트 코멘트는 관리자 페이지에서 수정하고 입력할 수 있게 한다.
6. AI는 뉴스 데이터, 지정 텔레그램/참고 메모, 수치 데이터, 과거 코멘트를 기반으로 코멘트 초안을 작성한다.
7. AI 초안은 자동 발행하지 않고, 사람이 관리자 페이지에서 검토하고 최종 코멘트로 확정한다.
8. 최종 리포트 페이지 디자인은 계속 개선한다.
9. AI API를 통해 리포트 조회 화면에 챗봇을 붙인다.
10. 각 단계에서 개선, 추가, 수정할 부분은 Codex가 지속적으로 검토하고 제안한다.
11. 협업과 인수인계를 위해 진행 상황, 결정 사항, 다음 작업은 계속 `HANDOFF.md`에 기록한다.

### 현재 방향 판단

현재 방향은 맞다. 다만 완성 상태는 아니며, 지금은 작동하는 프로토타입에서 운영 가능한 내부 도구로 넘어가는 단계다.

이미 진행된 축:
- Excel 캐시/시트 기반 수치 추출
- Supabase 스키마와 REST 권한 설정
- 과거 수치 데이터 백필
- 과거 PNG OCR 코멘트 1회 백필
- 관리자 코멘트 입력/수정 흐름
- 공개 리포트 HTML 초안
- 매일 자동 실행용 Windows 작업 스케줄러 등록

아직 남은 핵심 축:
- 일일 자동 실행 결과의 DB 기반 작업 로그
- Supabase를 단일 기준으로 삼는 리포트 렌더링 정리
- 관리자 화면 한글 인코딩과 문구 정리
- 실제 LLM 기반 코멘트 초안 생성
- 과거 코멘트/참고 자료 embedding 생성과 RAG 검색
- 뉴스/텔레그램 수집 방식 결정 및 구현
- 최종 리포트 디자인과 모바일 대응
- AI 챗봇과 질의 기반 차트 기능

### 과거 PNG OCR의 위치

과거 PNG OCR은 매일 반복할 작업이 아니라 초기 백필 작업이다.

현재 `source_documents`에 쌓인 과거 OCR 데이터는 향후 RAG/유사 사례 검색의 참고 자료로 사용한다. 추가 과거 파일이 생기지 않는 한, 일일 자동화의 핵심 경로에는 포함하지 않는다.

일일 반복 경로:

```text
인포맥스 Excel 갱신
-> 수치 데이터 추출
-> Supabase 업로드
-> 관리자 코멘트 작성/AI 초안 생성
-> 최종 검토 및 발행
-> 공개 리포트/챗봇 조회
```

### 2026-05-18~19 진행 현황

- Supabase 권한 SQL 실행 후 REST 업로드 정상화.
- 수치 데이터 업로드 완료:
  - `reports`: 285건 (`2025-04-14` ~ `2026-05-15`)
  - `market_observations`: 9,799건
  - `report_comments`: 285건
- 과거 OCR 코멘트 업로드 완료:
  - `source_documents`: 194건 (`2025-07-15` ~ `2026-05-18`)
- 자동화 등록:
  - Windows 작업 스케줄러 `Market Daily Supabase Upload`
  - 매일 08:30 실행
  - 실행 스크립트: `scripts/Run-DailyMarketUpdate.ps1`
  - 최근 10일 구간을 재업로드해 누락 보정

### 다음 우선순위

1. `HANDOFF.md` 최신화와 문서 인코딩 정리
2. 일일 자동 실행 상태 점검 도구 보강
3. DB 작업 로그 테이블 추가
4. 관리자 화면 한글 문구 복구
5. 리포트 렌더링을 Supabase 기준으로 정리
6. embedding/RAG 검색 기반 코멘트 초안 준비
7. 실제 AI API 연결

---
## 2026-05-19 update: pre-upload validation gate

The daily data load is now split into an operational gate:

1. Open/refresh Excel unless `-SkipRefresh` is used.
2. Extract recent report JSON only. No Supabase write happens in this step.
3. Validate the extracted JSON before upload.
   - Required local metrics must exist and be numeric.
   - Yahoo Finance cross-check runs for all configured Yahoo-mappable metrics.
   - Cross-check mismatches are strict in the automated pipeline and block upload.
   - Supabase DB validation is skipped in this pre-upload step because the row may not exist yet.
4. Upload to Supabase only after pre-upload validation passes.
5. Run post-upload DB validation against Supabase `reports`, `market_observations`, and `report_comments`.
6. Record `started/success/failed` in `job_runs` with the log path.

Verified command:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\Run-DailyMarketUpdate.ps1 -SkipRefresh -LookbackDays 2
```

Verified result:

- Run id: `7f8939f0-4bed-45ec-a9e7-c53ee12d317f`
- Report date: `2026-05-18`
- Observations: 35
- Pre-upload Yahoo cross-check: pass
- Supabase upload: 1 report, 35 observations
- Post-upload DB validation: pass

Key files:

- `scripts/Run-DailyMarketUpdate.ps1`
- `scripts/validate_daily_data.py`
- `scripts/Validate-DailyData.ps1`

---

## 2026-05-19 update: admin date picker layout

Admin validation tab is kept, but the report date navigation has been simplified.

- Removed the long full-date list from the left sidebar.
- Moved report date selection into the top summary area as a dropdown.
- Repurposed the left sidebar for current report status:
  - 기준일
  - 지표 수
  - 코멘트 상태
  - 생성 시각
- Left sidebar now shows only the latest 5 reports as quick shortcuts.

Rationale: daily reports will accumulate quickly, so a full date list makes the admin screen noisy. The date dropdown is enough for navigation, while the sidebar is more valuable as an operational status panel.

Verified:

- `node --check src\daily_report\admin\app.js`
- `node --check src\daily_report\admin\server.mjs`
- `http://127.0.0.1:4177/admin` returned 200
- `http://127.0.0.1:4177/api/reports` returned 200

Follow-up UI adjustment:

- Removed the "Recent 5 reports" sidebar shortcuts.
- Reworked the sidebar as current status + admin menu:
  - 데이터
  - 검증
  - HTML 미리보기
- Removed metric-count display from the admin UI because it is not operationally important.
- Renamed the main tab from `데이터/코멘트` to `데이터`.
- Removed the source column from the data table.
- Renamed table change columns:
  - `1D` -> `전일대비`
  - `YTD` -> `작년말대비`
- Made the comment workflow pane independently scrollable on desktop so long market data tables do not force the user to scroll the full page just to reach the final comment/publish controls.
- Refined navigation model:
  - Left sidebar is now reserved for top-level modules, not duplicated one-day tabs.
  - Central tabs are for the selected report date only: `데이터`, `코멘트`, `검증`.
  - `Current Report` sidebar summary was removed because date/status/generated are already in the top summary.
  - `HTML 미리보기` remains only in the sidebar output area.
- Split comments into a separate `코멘트` tab.
  - Added placeholder research blocks for future bond Google crawling and Telegram crawling.
  - This matches the intended workflow where the user reviews crawled references while writing the final comment.
- Simplified validation table:
  - `엑셀/DB 값` -> `DB`
  - Removed `% 차이` and `허용` columns.
  - Result now shows whether DB and Yahoo are `일치` or `다름`.

---

## 2026-05-19 update: admin workflow direction alignment

Accepted the revised UI direction after comparing alternatives:

- Keep the `데이터` tab as a dense operator table. Do not replace it with the public report card layout.
- Add `미리보기` as a first-class central tab that embeds the generated HTML report.
- Keep `코멘트` and `검증` as selected-date workflow tabs.
- Move `자동화 로그` into the left sidebar as a top-level operations module.
- Remove low-value legacy labels and aliases:
  - `1D` -> `전일대비`
  - `YTD` -> `작년말대비`
  - removed admin CSS `--red`, `--blue`, `--green` compatibility aliases
  - aligned public report up/down colors to Korean market convention: 상승 red, 하락 blue
- Added `/api/job-runs` for recent automation outcomes from Supabase `job_runs`.
- Added `docs/AI_CONTEXT_CONTRACT.md` so future chart panels, RAG, and chatbot features share the same metric context.

Verified:

- `node --check src\daily_report\admin\app.js`
- `node --check src\daily_report\admin\server.mjs`
- `node --check src\daily_report\report\app.js`
- Legacy label/token grep returned no matches for `--red`, `--blue`, `--green`, `1D`, `YTD` under `src` and `scripts`.
- Temporary admin server on port `4180` returned:
  - `/api/health`: 200
  - `/api/job-runs`: 200
  - `/admin`: 200

Next recommended steps:

1. Add validation approval history before adding any DB overwrite function.
2. Design the public report metric detail panel and mobile bottom sheet using the AI context contract.
3. Implement the LLM adapter behind the context contract, with Qwen as the first candidate and DeepSeek as a comparison candidate.

---

## 2026-05-19 update: validation approval history

Added a first version of validation approval history.

Purpose:

- When DB/Infomax values differ from Yahoo Finance but the operator decides the DB value is acceptable, record that decision.
- Avoid adding a risky "overwrite DB with Yahoo" function before approval/audit flow exists.

Files:

- `db/validation_approvals.sql`
- `db/schema.sql`
- `src/daily_report/admin/server.mjs`
- `src/daily_report/admin/index.html`
- `src/daily_report/admin/app.js`
- `src/daily_report/admin/styles.css`

Behavior:

- New table: `validation_approvals`
  - unique by `(report_id, metric_key, source)`
  - stores DB value, external value, source symbol, reason, approved_by, approved_at
- `GET /api/validation/:date` now attaches approval history to validation rows.
- `POST /api/validation/:date/approvals` records or updates an approval.
- Admin validation tab shows:
  - `우리 값 승인` button on mismatch rows
  - `승인됨` badge for approved mismatches
  - approval history block below the table

Operational note:

- Run `db/validation_approvals.sql` once in Supabase SQL Editor before using the approval button in production.

Verified:

- `node --check src\daily_report\admin\app.js`
- `node --check src\daily_report\admin\server.mjs`
- Temporary admin server on port `4181` returned:
  - `/api/health`: 200
  - `/admin`: 200
  - `/api/validation/2026-05-18`: 200
  - current approval count: 0

---

## 2026-05-19 update: public report metric detail panel [Superseded by D-014]

Added the first public-report interaction layer for the long-term chart/chat direction.

Behavior:

- `/report` is now served by the Admin server.
- `/report/app.js` and `/report/styles.css` are now served under `/report/`.
- Public report metric rows were clickable and keyboard-accessible.
- Clicking a metric opened:
  - desktop: right-side detail panel
  - mobile: bottom sheet
- 2026-05-20: this interaction was removed by D-014 for the 1단계 MVP.
- Detail panel shows:
  - metric name/category
  - current value
  - `전일대비`
  - `작년말대비`
  - up to 20 historical points from `/api/metrics/:metric_key/series`
  - current report comment as the first context note
- Added `/api/history?days=n` because the public report already referenced it for sparklines.
- The detail panel can prefill the chat input with a metric-specific question.
- Public chat call was aligned from missing `/api/chat` to existing `/api/ask`.

Verified:

- `node --check src\daily_report\report\app.js`
- `node --check src\daily_report\admin\server.mjs`
- `node --check src\daily_report\admin\app.js`
- Temporary admin server on port `4183` returned:
  - `/report`: 200
  - `/api/history?days=3`: 200
  - `/api/metrics/kospi/series`: 200

## 2026-05-19 Codex update - Chart.js cleanup and AI context payload

- Kept D-003 instead of superseding it: no Chart.js / D3 dependency for public report charts.
- Removed the Chart.js CDN from `src/daily_report/report/index.html`.
- Replaced public report sparkline, metric detail chart, and chat chart rendering with inline SVG.
- Chart colors now read CSS design tokens (`--up`, `--down`, `--primary`, `--warn`) instead of hard-coded financial colors.
- `/api/ask` request payload now follows the agreed AI context shape as far as current data allows: `surface`, `selected_metric`, `report_comment`, `validation`, `history`, and `research_items`.
- `research_items` is currently an empty array until Google/Telegram/manual-note collectors are implemented.

## 2026-05-20 Codex update - Design reference decision

- Do not adopt generic SaaS UI kits as the overall product direction.
- Admin direction: Stripe/Linear/Grafana style.
  - left side = top-level operations modules
  - center = selected report date workflow
  - avoid persistent right context panels unless they contain actionable data such as selected metric detail, validation drilldown, AI sources, or alert remediation
- Public report direction: Bloomberg/Refinitiv style.
  - dense financial data scanning
  - Korean market color convention
  - no persistent/detail side panel during 1단계 MVP unless an operational need is proven
- Generic UI kits may only be used for micro patterns:
  - badges
  - table hover/selected states
  - drawers
  - form controls
  - modal motion
- 2026-05-20 correction: Removed the first sticky right context panel because it only explained the screen and did not add operational value. Keep the central workspace wide until a real drilldown panel is needed.

## 2026-05-20 Codex update - Automation log popup

- Replaced the low-value `log_path` copy flow with an Admin-side log viewer.
- Added `GET /api/job-runs/:id/log`.
  - The endpoint reads the `job_runs.log_path` for that run.
  - It only serves files under `data/logs` to avoid arbitrary local file reads.
- Admin automation log rows now show `로그 보기`.
- Admin automation log now supports row-based retry:
  - only failed/error rows have an enabled checkbox
  - `선택 항목 재실행` reruns the selected failed job period
  - retry mode is inferred from the failure message
    - workbook/json generation failures: Excel refresh + validation + upload
    - upload/validation failures: skip Excel refresh and rerun validation + upload
- Clicking `로그 보기` opens a modal with:
  - run status/job name
  - started time/message
  - operator-facing summary and next actions
  - log file path
  - full log text
- If the log file is missing, the modal explains that the run may have happened on another computer or the local log may have been deleted.
- Current summary rules cover:
  - success: processed period, uploaded report/observation counts, validation pass
  - Excel COM busy/rejected error: close Excel/EXCEL.EXE and rerun
  - Supabase-related error: check network/env/key and rerun
  - validation-related error: inspect Admin validation tab and source Excel values

Verified:

- `node --check src\daily_report\admin\app.js`
- `node --check src\daily_report\admin\server.mjs`
- Admin server on port `4188` returned:
  - `/api/health`: 200
  - `/api/job-runs`: 200
  - `/api/job-runs/{latest_success_id}/rerun`: 400 because only failed/error runs can be retried
  - `/api/job-runs/{latest_id}/log`: 200, summary `자동화가 정상 완료됐습니다.`
  - `/api/job-runs/{failed_id}/log`: 200, summary `Excel이 응답하지 않아 자동화가 실패했습니다.`

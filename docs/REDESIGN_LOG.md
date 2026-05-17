# 리디자인 작업 일지

> 시간 역순(최신이 위)으로 작업 기록. 새 세션은 맨 위 항목의 "미완 / 다음 단계"부터 시작.
> 매 작업 chunk마다 항목을 추가. 세션 종료 시점에만 몰아쓰지 말 것.

---

## 2026-05-17 — 집 PC, Claude — Phase A 완료 (디자인 시스템 정립)

### 의도
플랜·인프라 push 완료 직후 사용자가 "회사 가기 전까지 작업 좀 더 진행" 요청. Phase A 부터 시작.
- `design.md` 전체 재작성 (Notion 마케팅 시스템 → 금융 대시보드 시스템)
- `styles.css` `:root` 토큰 갱신
- `server.mjs::buildReviewHtml` 내부 inline `<style>` 토큰 갱신 (레이아웃은 Phase B에서)
- 색상 규칙(D-002): 상승 빨강, 하락 파랑

### 진행
- `design.md` 전체 재작성 완료. 새 SSOT: Stripe + KIS 스타일 금융 대시보드 디자인 시스템. 색상·타이포·간격·radius·elevation·컴포넌트 정의 + 모바일 반응형 + Do/Don't.
- `styles.css` `:root` 신규 토큰 30+개 추가 (`--bg`, `--surface`, `--text`, `--accent`, `--up`/`--down`, spacing/radius/shadow). 백워드 호환을 위해 기존 변수(`--canvas`, `--ink`, `--hairline`, `--primary` 등)를 alias로 매핑 → 기존 컴포넌트 CSS는 손대지 않아도 작동.
- `styles.css` body 셀렉터의 폰트를 Inter → Pretendard로 교체. `var(--font-sans)` 사용.
- `styles.css` 맨 위에 Pretendard CDN `@import` 추가 (`jsdelivr` 호스팅).
- `server.mjs::buildReviewHtml` (413~424줄 영역) inline `<style>` `:root` 블록 동일 토큰으로 교체 + 같은 백워드 호환 alias 적용. Pretendard `@import` 도 추가.
- Codex가 이미 `.up`=빨강 / `.down`=파랑으로 한국식 색상을 적용해둔 사실 발견 — 우리 결정(D-002)과 자연스럽게 호환.
- 검증: `node -e "import(...)"` 으로 server.mjs 문법 OK 확인.

### 결정
- Phase A 범위 한정: 디자인 토큰·문서만 교체. 레이아웃 구조 변경은 Phase B에서. → 회귀 위험 최소화하고 단계적 검증 가능.
- 백워드 호환 alias 유지: Phase B/C/D 작업하면서 점진적으로 새 이름으로 마이그레이션. 한 번에 전체 교체 X.
- Pretendard CDN 방식 채택 (self-host 아님): 카카오톡 인앱 브라우저에서도 즉시 로드, 추가 빌드 단계 불필요. CDN 장애 시 fallback 시스템 폰트로 자동 전환.

### 미완 / 다음 단계
- Phase A는 토큰만 교체했고, 기존 CSS 셀렉터·레이아웃은 그대로 → 화면이 살짝 색만 바뀐 정도로 보일 것. 실제 시각 임팩트는 Phase B/C에서 발생.
- **Phase B 진입 권장**: `server.mjs::buildReviewHtml()`의 HTML 빌더 영역(363~738줄) 전체 재작성. sticky 헤더 + 3열 그리드 + 컴팩트 표.
- 또는 Phase C (admin 코멘트 워크플로 stepper) 병행 가능 (서로 다른 파일).

### 검증
- server.mjs 문법 정상 (`OK` 출력 확인). 단, 포트 4173에 이전 서버 살아있어 실제 기동 안 됨.
- styles.css는 정적 파일이라 브라우저 새로고침으로 반영. server.mjs의 inline 스타일은 서버 재시작 필요.
- 사용자가 직접 확인하려면:
  1. PowerShell에서 `Get-Process node | Stop-Process` (또는 작업 관리자에서 node 종료)
  2. `scripts/03_start_admin.cmd` 다시 실행
  3. `http://127.0.0.1:4173/admin`, `/archive`, `/reports/2025-12-23` 브라우저에서 확인
  4. 변경점: 페이지 배경 살짝 더 차가운 흰색(`#fafbfc`), 폰트 Pretendard, CTA 버튼 검정 → Stripe 블루(`#1f4ed8`)

---

## 2026-05-17 — 집 PC, Claude — 플랜 수립 및 추적 인프라 구축

### 의도
Codex가 1차 구현을 완료했지만 디자인 철학 오류 등 5가지 문제 식별. 회사 PC에서 이어 작업하기 전에 (a) 전체 리디자인 플랜 확정, (b) 다른 도구·환경에서도 작업 이어갈 수 있도록 진행 기록 인프라 구축.

### 진행
- 사용자와 디자인 방향 합의: Stripe(refero.design) + KIS 스타일 혼합, 밝은 배경, 정보 밀도 우선
- 지표 36개를 8개 카테고리 → 3열 그리드(국내 / 해외 금리·주식 / 외환·원자재·암호)로 재배치 결정
- Phase A~G 분해 (G는 차기 범위)
- 추적 인프라 4종 파일 신설:
  - `docs/REDESIGN_PLAN.md` (플랜 사본)
  - `docs/STATUS.md` (현재 상태 스냅샷)
  - `docs/REDESIGN_LOG.md` (이 파일)
  - `docs/DECISIONS.md` (의사결정 기록)
- `AGENTS.md`에 "현재 진행 중" 섹션 추가 예정
- `README.md` "현재 상태" 갱신 예정

### 결정
- **D-001**: Evolve 방식 (데이터 레이어 보존, 시각 레이어만 재작성)
- **D-002**: 한국 금융 색상 관례 채택 (상승=빨강, 하락=파랑)
- **D-003**: 스파크라인 외부 라이브러리 미사용, 인라인 SVG 자체 구현
- **D-004**: design.md 전체 교체 (Notion 마케팅 디자인 → 금융 대시보드)
- **D-005**: AI 질문창 위치/크기 변경 (중앙 큰 영역 → 하단 컴팩트 바)
- **D-006**: 모든 Phase 한 번에 진행, PNG/PDF는 차기 범위
- 상세: `docs/DECISIONS.md` 참고

### 미완 / 다음 단계
- **Phase A 시작**: `design.md`를 금융 대시보드 디자인 시스템으로 전면 재작성. 디자인 토큰(색·폰트·간격) 정의. 그 다음 `styles.css`의 `:root` 변수와 `server.mjs::buildReviewHtml` inline style에 동일 토큰 반영.
- 그 후 Phase B (공개 리포트 재작성) 진입. `server.mjs` 363–738줄 buildReviewHtml HTML 빌더 부분 교체.

### 검증
- 코드 변경 없음 (인프라/문서만)
- 다음 세션이 STATUS.md → REDESIGN_LOG.md → DECISIONS.md 순서로 읽으면 컨텍스트 복원 가능한지 점검 필요

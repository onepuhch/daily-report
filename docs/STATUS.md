# 데일리 리포트 리디자인 — 현재 상태

> 한눈에 보는 진척판. LOG가 길어져도 이 파일만 보면 즉시 위치 파악 가능.
> 작업 진행 시 이 파일을 **항상 최신으로 덮어쓰기**.

**전체 진행률**: 2 / 6 Phase 완료 (Phase A + C 골격 완료)

**마지막 갱신**: 2026-05-17 (집 PC, Claude — Phase C 골격 완료)
**다음 세션 시작점**: 회사 PC 도착 후 `git pull` → 아래 "다음 작업" 항목 확인. Phase B (공개 리포트 재작성) 진입.

---

## Phase A — 디자인 시스템 정립
- **상태**: done ✓
- **완료 내용**:
  - `design.md` 전체 재작성 (Stripe + KIS 스타일 금융 대시보드 디자인 시스템)
  - `styles.css` `:root` 신규 토큰 + 백워드 호환 alias, Pretendard 폰트 적용
  - `server.mjs::buildReviewHtml` inline `<style>` 토큰 동기화
- **남은 확인**: 사용자가 서버 재시작 후 브라우저에서 색·폰트 시각 확인 필요
- **블로커**: 없음

## Phase B — 공개 리포트 페이지 재작성
- **상태**: pending (다음 진입 권장)
- **다음 작업**: `server.mjs::buildReviewHtml()` 함수(363–738줄)의 HTML 빌더 부분 재작성. 새 구조: sticky 헤더 + 코멘트 카드 + 3열 카테고리 그리드. 데이터 헬퍼는 보존. 인라인 스타일은 새 디자인 토큰(`--up`, `--down`, `--accent`, `--surface` 등) 사용.
- **블로커**: Phase A 완료됨 (해제)

## Phase C — Admin 코멘트 워크플로 재설계 (참고메모-first)
- **상태**: done (골격) ✓
- **변경된 흐름** (D-009): 참고 자료(맨 위) → AI 초안 → 최종 발행
- **완료 내용**:
  - `index.html`: 코멘트 패널을 3단 stepper로 교체 (Step 1 참고 자료, Step 2 AI 초안, Step 3 최종/발행)
  - `app.js`: SQL 저장 경로 제거, Supabase 직접 저장으로 단일화. saveButton/sqlOutput 참조 정리
  - `styles.css`: `.step-card`, `.notice`, `.step-number` 등 stepper 컴포넌트 스타일 추가
- **남은 확인**: 사용자가 서버 재시작 후 동작 검증
- **차기 (별도 Phase)**: LLM 실제 통합(Phase H), 뉴스 자동 수집(Phase I)

## Phase D — AI 질문 하단 고정 바
- **상태**: pending
- **다음 작업**: 3페이지 공통 마크업 + `ai-bar.js`, `ai-bar.css` 신규 생성. 40px 접힘 / 320px 펼침.
- **블로커**: Phase A 완료 권장

## Phase E — 인라인 스파크라인
- **상태**: pending
- **다음 작업**: `buildReviewHtml` 끝부분에 클라이언트 부트 스크립트 추가. `/api/metrics/{key}/series?days=7` 36개 병렬 호출 → 인라인 SVG 주입.
- **블로커**: Phase B 완료 필수 (행 마크업 의존)

## Phase F — 모바일 반응형
- **상태**: pending
- **다음 작업**: 모든 CSS에 `@media (max-width: 768px)` 추가. 3열 → 1열, AI 바 풀폭, Admin 코멘트 풀스크린 모달.
- **블로커**: Phase A~E 완료 후 통합 마무리

## Phase G — PNG/PDF 내보내기 (차기 범위)
- **상태**: deferred (1차 범위 제외)
- 리디자인 안정화 후 별도 진행

## Phase H — LLM 통합 (차기 범위)
- **상태**: deferred (D-010)
- Phase C의 "메모 기반 초안 생성" placeholder를 실제 LLM 호출로 교체. AI provider 결정 후 진행.

## Phase I — 뉴스 자동 수집 (차기 범위)
- **상태**: deferred (D-011)
- 전일 채권 관련 뉴스 자동 수집해 참고 자료 시드. 데이터 소스 결정 후 진행.

---

## 작업 우선순위

```
A (디자인 토큰)
 ↓
B + C + D (병렬 가능)
 ↓
E (Phase B 의존)
 ↓
F (반응형 마무리)
```

예상 작업량: 4~5일 (1인 풀타임 기준)

# 데일리 리포트 리디자인 — 현재 상태

> 한눈에 보는 진척판. LOG가 길어져도 이 파일만 보면 즉시 위치 파악 가능.
> 작업 진행 시 이 파일을 **항상 최신으로 덮어쓰기**.

**전체 진행률**: 0 / 6 Phase 완료 (플랜 수립 완료, 코드 작업 미시작)

**마지막 갱신**: 2026-05-17 (집 PC, Claude)
**다음 세션 시작점**: 회사 PC 도착 후 `git pull` → 아래 "다음 작업" 항목 확인

---

## Phase A — 디자인 시스템 정립
- **상태**: pending
- **다음 작업**: `design.md` 전체 재작성 (Notion 마케팅 디자인 → 금융 대시보드 디자인 시스템). 그 후 `src/daily_report/admin/styles.css`의 `:root` CSS 변수 갱신, `server.mjs::buildReviewHtml` 내부 inline `<style>` 블록도 동일 토큰 적용.
- **블로커**: 없음

## Phase B — 공개 리포트 페이지 재작성
- **상태**: pending
- **다음 작업**: `server.mjs::buildReviewHtml()` 함수(363–738줄)의 HTML 빌더 부분 재작성. 새 구조: sticky 헤더 + 코멘트 카드 + 3열 카테고리 그리드. 데이터 헬퍼는 보존.
- **블로커**: Phase A 완료 권장 (디자인 토큰 의존)

## Phase C — Admin 코멘트 워크플로 단순화
- **상태**: pending
- **다음 작업**: textarea 4개 → 3단 stepper로 재구성. SQL 출력 영역 삭제, 저장 버튼 1개로 통일. `index.html`, `app.js`, `styles.css` 손봐야 함.
- **블로커**: Phase A 완료 권장

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

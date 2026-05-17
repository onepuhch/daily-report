# Project Rules: Daily Market Report Automation

## 현재 진행 중 (UI 리디자인)
- **활성 Phase**: B (공개 리포트 재작성) — 다음 진입 예정
- **전체 진척**: 1/6 (Phase A 완료)
- **다음 행동**: `docs/STATUS.md` 읽고 "다음 작업" 항목 진행
- **전체 플랜**: `docs/REDESIGN_PLAN.md`
- **작업 일지**: `docs/REDESIGN_LOG.md` (시간 역순, 최신이 위)
- **의사결정 기록**: `docs/DECISIONS.md`

### 세션 시작 체크리스트
1. `git pull`
2. `docs/STATUS.md` 확인 — 어디까지 됐고 다음 할 일
3. `docs/REDESIGN_LOG.md` 최상단 항목 확인 — 직전 작업 맥락
4. `docs/DECISIONS.md` 최근 결정 살피기
5. 작업 시작 전 LOG에 새 항목(의도) 추가
6. 변경 단위마다 LOG·STATUS 갱신 + commit + (가능시 push)

### 세션 종료 / 토큰 끊김 대비
- 작업 중간에도 LOG·STATUS 계속 갱신 (종료 시점에만 몰아쓰지 말 것)
- 자주 commit (작업 단위 작아도 OK), 가능하면 자주 push
- 미커밋 변경이 있으면 사용자가 `git add . && git commit -m "WIP: phase X 중단" && git push`로 보존

---

## 기술 방향
- 데이터 원천은 초기에는 `MARKET DAILY.xlsm`의 인포맥스 수식을 우선 사용한다.
- DB는 Supabase PostgreSQL을 기본으로 하고, 의미 검색은 같은 DB의 pgvector로 확장한다.
- 사용자는 DB를 직접 수정하지 않는다. 코멘트 수정과 발행은 웹 관리자 화면에서 수행한다.
- 리포트 디자인은 `design.md`의 **금융 대시보드 시스템**(Phase A에서 재작성 예정)을 따른다. 기존 Notion 마케팅 스타일은 폐기됨 — D-004 참고.

## 구현 원칙
- Excel 자동화, 데이터 저장, 리포트 렌더링, 코멘트 생성, 관리자 화면을 분리한다.
- 숫자 데이터는 재계산 가능한 형태로 저장한다. 단일 이미지/PDF만 저장하는 방식은 피한다.
- 자동 코멘트는 초안으로 취급하고, 최종 발행 전 사람의 확인 단계를 둔다.
- 과거 JPG와 텔레그램 참고자료는 코멘트 품질 향상을 위한 보조 자료로만 사용한다.
- 텔레그램 자료는 권한, 약관, 회사 컴플라이언스 확인 전까지 자동 수집하지 않는다.

## 산출물
- 날짜별 원천 데이터
- 날짜별 정규화 데이터
- HTML 리포트
- 공유용 이미지 또는 PDF
- 자동 코멘트 초안
- 사람이 승인한 최종 코멘트


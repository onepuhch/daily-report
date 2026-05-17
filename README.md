# Daily Market Report Automation

인포맥스 Excel 기반 데일리 리포트를 자동화하기 위한 프로젝트입니다.

현재 목표는 매일 `MARKET DAILY.xlsm`에 저장된 시장 데이터를 읽어 HTML 리포트를 만들고, 관리자 화면에서 코멘트를 작성한 뒤 Supabase DB에 누적하는 것입니다. 장기적으로는 누적된 숫자 데이터와 코멘트를 기반으로 RAG 챗봇, 질문 기반 차트, 과거 리포트 검색까지 확장합니다.

> **UI 리디자인 진행 중** — Notion 마케팅 스타일 → Stripe + KIS 스타일 금융 대시보드로 전환 중. 새 세션으로 이어 작업할 경우 **`HANDOFF.md` 하나만** 읽으면 됩니다 (진행 현황·다음 할 일·의사결정 기록 모두 통합).

## 현재 제공 기능

- 인포맥스 Excel 저장값 기반 시장 데이터 추출
- 인포맥스 PC용 Excel 새로고침 스크립트
- HTML 리포트 생성
- 관리자 화면에서 코멘트 작성/수정
- 숫자 기반 자동 코멘트 초안 생성
- Supabase SQL 파일 생성
- Supabase 직접 저장 버튼
- 조회자용 리포트 아카이브 화면
- 로컬 JSON 기반 간단 Q&A
- 질문 결과와 연결된 대표 지표 차트

## 주요 실행 파일

```text
scripts\00_check_environment.cmd      환경 점검
scripts\04_refresh_infomax_excel.cmd  인포맥스 Excel 새로고침
scripts\01_extract_preview.cmd        Excel 데이터 추출 및 HTML 생성
scripts\03_start_admin.cmd            관리자/조회 화면 서버 실행
scripts\05_infomax_daily_workflow.cmd 새로고침과 추출을 한 번에 실행
```

## 주요 화면

서버 실행 후 아래 주소를 사용합니다.

```text
관리자 화면: http://127.0.0.1:4173/admin
조회 화면:   http://127.0.0.1:4173/reports
```

## 기본 운영 순서

개인 PC에서 저장된 값만 확인할 때:

```text
00_check_environment.cmd 실행
01_extract_preview.cmd 실행
03_start_admin.cmd 실행
관리자 화면에서 코멘트 작성
HTML 미리보기 확인
Supabase SQL 실행 또는 직접 저장
조회 화면에서 리포트 확인
```

인포맥스 PC에서 실제 당일 값을 새로고침할 때:

```text
00_check_environment.cmd 실행
04_refresh_infomax_excel.cmd 실행
01_extract_preview.cmd 실행
03_start_admin.cmd 실행
관리자 화면에서 코멘트 작성
HTML 미리보기 확인
Supabase SQL 실행 또는 직접 저장
조회 화면에서 리포트 확인
```

## 주요 문서

- [Runbook](docs/RUNBOOK.md)
- [Infomax PC Runbook](docs/INFOMAX_PC_RUNBOOK.md)
- [Setup](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data Model](docs/DATA_MODEL.md)
- [Roadmap](docs/ROADMAP.md)

### 리디자인 진행 추적
- **[HANDOFF.md](HANDOFF.md)** — 인수인계서 (진행 현황 + 의사결정 + 작업 일지 통합, 이 파일 하나면 충분)
- [Redesign Plan](docs/REDESIGN_PLAN.md) — Phase A~I 상세 플랜 (선택 참고)

## 보안 주의

`.env`, Excel 원본, 생성된 `data/processed`, `output` 파일은 Git에 올리지 않습니다. Supabase 키와 OpenAI 키는 반드시 로컬 `.env`에만 보관합니다.

# Daily Market Report Automation

인포맥스 Excel 기반의 데일리 마켓 리포트를 자동 생성하고, 숫자 데이터와 코멘트를 장기 누적해 웹 아카이브와 RAG 챗봇으로 확장하기 위한 프로젝트입니다.

## 목표
- 기존 `MARKET DAILY.xlsm`의 인포맥스 수식을 데이터 수집기로 활용합니다.
- 매일 시장 숫자와 코멘트를 Supabase PostgreSQL + pgvector에 저장합니다.
- Notion풍의 절제된 HTML 리포트를 생성합니다.
- 관리자 화면에서 자동 코멘트 초안을 검토, 수정, 발행합니다.
- 장기적으로 SQL 검색 + RAG 검색 + 답변 기반 차트를 제공하는 챗봇을 붙입니다.

## 우선순위
1. 인포맥스 Excel 자동 갱신 및 값 추출
2. Supabase DB 저장
3. HTML 리포트 생성
4. 코멘트 초안 생성 및 관리자 승인
5. 웹 아카이브
6. RAG 챗봇 및 차트 응답

## 주요 문서
- [PRD](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data Model](docs/DATA_MODEL.md)
- [Runbook](docs/RUNBOOK.md)
- [Roadmap](docs/ROADMAP.md)
- [Setup](docs/SETUP.md)

## 현재 상태
- 프로젝트 문서와 phase 계획이 준비되어 있습니다.
- Git에 올릴 파일과 로컬에만 둘 파일을 `.gitignore`로 분리했습니다.
- Supabase PostgreSQL + pgvector용 초기 스키마는 `db/schema.sql`에 있습니다.

# Roadmap

## Phase 0: Foundation
- 프로젝트 문서 정리
- Excel 구조 분석
- 추출 대상 지표 목록 정의
- Supabase DB 모델 확정

## Phase 1: Excel Ingestion
- 회사 인포맥스 PC에서 Excel 자동 갱신 스크립트 작성
- `camera` 시트와 원천 시트에서 값 추출
- 원천 JSON/CSV 저장
- 결측치 검증

## Phase 2: Database
- Supabase 프로젝트 생성
- PostgreSQL 테이블 생성
- pgvector 확장 준비
- 일별 숫자와 코멘트 저장 테스트

## Phase 3: Report UI
- Notion풍 HTML 리포트 레이아웃 구현
- 날짜별 리포트 렌더링
- 공유용 PNG/PDF 생성

## Phase 4: Commentary Workflow
- 자동 코멘트 초안 생성
- 관리자 화면에서 수정/승인
- 최종 코멘트 DB 저장
- 과거 JPG OCR 텍스트를 보조 자료로 연결

## Phase 5: Archive and RAG
- 날짜별 웹 아카이브
- 코멘트 검색
- pgvector 기반 유사 사례 검색
- SQL + RAG 혼합 챗봇

## Phase 6: Answer Visualization
- 챗봇 답변에 차트 데이터 포함
- 주요 지표 조합 차트 생성
- 답변 근거 리포트 링크 제공


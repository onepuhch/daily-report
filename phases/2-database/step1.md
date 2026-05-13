# Step 1: Create Schema

## 목표
리포트, 시장 숫자, 코멘트, 참고자료 테이블을 생성한다.

## 작업
- `reports` 테이블을 만든다.
- `market_observations` 테이블을 만든다.
- `report_comments` 테이블을 만든다.
- `source_documents` 테이블을 만든다.
- 코멘트와 참고자료에 pgvector 컬럼을 준비한다.

## AC
- `docs/DATA_MODEL.md`와 실제 DB 스키마가 일치한다.
- 일별 숫자와 코멘트가 분리 저장된다.


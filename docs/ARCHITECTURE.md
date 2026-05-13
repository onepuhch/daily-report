# Architecture

## 전체 구조
```text
Infomax Excel
  -> Excel automation
  -> data extraction
  -> normalization
  -> Supabase PostgreSQL
  -> HTML report
  -> admin review
  -> published archive
  -> SQL + pgvector chatbot
```

## 컴포넌트

### 1. Excel Collector
- 회사 인포맥스 PC에서 `MARKET DAILY.xlsm`을 연다.
- 인포맥스 Add-in 데이터 갱신을 실행한다.
- Excel 계산 완료를 기다린다.
- 필요한 셀 범위를 읽어 원천 JSON/CSV로 저장한다.

### 2. Normalizer
- Excel에서 읽은 값을 표준 형태로 바꾼다.
- 날짜, 카테고리, 지표명, 값, 단위, 전일대비, 전년말대비를 정리한다.
- 결측치, `#N/A`, 비정상 변동률을 검증한다.

### 3. Database
- Supabase PostgreSQL을 사용한다.
- 숫자형 시계열 데이터는 일반 테이블에 저장한다.
- 코멘트와 참고 메모는 텍스트 테이블에 저장한다.
- 최종 코멘트와 과거 코멘트는 pgvector 임베딩을 붙여 의미 검색에 활용한다.

### 4. Report Renderer
- DB 또는 정규화 JSON을 읽어 HTML 리포트를 생성한다.
- 디자인은 `design.md`의 Notion 스타일을 절제해 사용한다.
- 필요 시 HTML을 PNG/PDF로 변환해 카톡 공유용 산출물을 만든다.

### 5. Admin UI
- 오늘 리포트 초안을 조회한다.
- 자동 코멘트를 수정한다.
- 텔레그램 참고 메모를 붙여넣을 수 있다.
- 최종 코멘트를 승인하고 발행한다.
- DB 직접 수정은 하지 않는다.

### 6. RAG Chatbot
- SQL 검색으로 정확한 숫자와 차트 데이터를 조회한다.
- pgvector 검색으로 비슷한 과거 코멘트와 시장 맥락을 찾는다.
- 답변에는 숫자 요약, 과거 코멘트 근거, 차트 데이터를 함께 제공한다.

## 디자인 방향
- 흰 배경, 얇은 회색 선, 절제된 파스텔 포인트를 사용한다.
- 기존 Excel 캡처형 레이아웃은 따르지 않는다.
- 금융 숫자와 변화율이 먼저 읽히도록 구성한다.
- 장식보다 정보 구조, 검색성, 아카이브성을 우선한다.

## 권한과 운영
- DB 접근 권한은 관리자 앱과 서버 환경변수로 제한한다.
- 일반 사용자는 발행된 리포트만 본다.
- 실무자는 관리자 화면에서 초안 수정과 발행만 수행한다.
- 텔레그램 자동 수집은 별도 승인 전까지 구현하지 않는다.


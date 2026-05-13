# Runbook

## 일일 운영 목표
1. 인포맥스 Excel 갱신
2. 숫자 데이터 추출
3. Supabase DB 저장
4. 관리자 화면에서 코멘트 작성/수정
5. 최종 리포트 확인
6. 발행 및 카톡 공유

## 현재 실행 순서

### 1. 숫자 추출과 HTML 미리보기 생성
`scripts/01_extract_preview.cmd`를 더블클릭한다.

생성물:
- `data/processed/market_daily_YYYY-MM-DD.json`
- `output/market_daily_YYYY-MM-DD.html`
- `output/market_daily_YYYY-MM-DD.import.sql`

개인 PC에서는 인포맥스 함수가 새로 계산되지 않지만, 엑셀 파일 안에 저장된 캐시 값과 과거 데이터를 읽어 미리보기까지 만들 수 있다.

### 2. 숫자 데이터를 Supabase에 저장
Supabase SQL Editor에서 아래 파일 내용을 실행한다.

```text
output/market_daily_YYYY-MM-DD.import.sql
```

실행 후 Supabase의 `reports`, `market_observations`, `report_comments` 테이블에 데이터가 들어간다.

### 3. 관리자 화면 실행
`scripts/03_start_admin.cmd`를 더블클릭한다.

터미널 창에 아래 주소가 나오면 브라우저에서 연다.

```text
http://127.0.0.1:4173
```

관리자 화면에서 할 수 있는 일:
- 추출된 시장 데이터 확인
- 자동 코멘트 초안 입력
- 참고 메모 입력
- 최종 코멘트 수정
- 태그와 검토 상태 지정
- Supabase에 반영할 코멘트 SQL 생성

### 4. 코멘트를 Supabase에 반영
관리자 화면에서 `저장 SQL 생성` 버튼을 누르면 아래 파일이 생긴다.

```text
output/market_daily_YYYY-MM-DD.comment_update.sql
```

이 파일 내용을 Supabase SQL Editor에서 실행하면 `report_comments`와 `reports.status`가 갱신된다.

## 오늘 기준 업무 흐름
```text
01_extract_preview.cmd 실행
-> output/*.import.sql을 Supabase에서 실행
-> 03_start_admin.cmd 실행
-> 관리자 화면에서 숫자와 코멘트 확인
-> 저장 SQL 생성
-> output/*.comment_update.sql을 Supabase에서 실행
-> HTML 미리보기 확인
-> 카톡 공유
```

## 실패 대응

### Excel 값이 없거나 `#N/A`가 많을 때
- 인포맥스 PC에서 엑셀을 열고 새로고침한다.
- 같은 파일명으로 저장한다.
- 다시 `01_extract_preview.cmd`를 실행한다.

### 관리자 화면이 열리지 않을 때
- `scripts/03_start_admin.cmd` 창이 켜져 있는지 확인한다.
- 주소는 `http://127.0.0.1:4173`을 사용한다.
- 이미 같은 포트를 쓰고 있으면 터미널 창을 닫고 다시 실행한다.

### Supabase 저장이 안 될 때
- SQL Editor에서 어떤 줄이 실패했는지 확인한다.
- `db/schema.sql`이 먼저 실행되어 있어야 한다.
- 현재 단계에서는 DB를 직접 수정하지 말고 생성된 SQL 파일을 실행한다.

## 다음 개발 단계
1. 관리자 화면에서 Supabase로 직접 저장
2. 코멘트 기반 리포트 HTML 자동 재생성
3. 인포맥스 PC에서 Excel 자동 새로고침
4. Telegram 참고 메모 수집 방식 정리
5. 과거 JPG OCR과 코멘트 아카이브 구축
6. RAG 챗봇과 질의 기반 차트 기능 추가

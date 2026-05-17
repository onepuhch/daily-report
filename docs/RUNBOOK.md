# Runbook

## 일일 운영 목표
1. 인포맥스 Excel 갱신
2. 숫자 데이터 추출
3. Supabase DB 저장
4. 관리자 화면에서 코멘트 작성/수정
5. 최종 리포트 확인
6. 발행 및 카톡 공유

## 현재 실행 순서

### 0. 환경 점검
처음 설치했거나 인포맥스 PC로 옮긴 뒤에는 아래 파일을 먼저 실행한다.

```text
scripts/00_check_environment.cmd
```

이 점검은 Node.js 설치 여부, `.env` 존재 여부, Excel 파일 위치, 추출된 JSON/HTML 존재 여부, Git 안전 디렉터리 문제를 확인한다.

### 0-1. 인포맥스 PC에서 Excel 새로고침
개인 PC에서는 이 단계를 건너뛴다. 인포맥스 add-in이 설치된 회사 PC에서만 실행한다.

```text
scripts/04_refresh_infomax_excel.cmd
```

이 스크립트는 `.env`의 `INFOMAX_EXCEL_PATH`에 적힌 Excel 파일을 열고, Excel 새로고침과 전체 재계산을 실행한 뒤 저장한다. 처음에는 Excel 창이 보이도록 실행되므로 인포맥스 로그인, 보안 경고, `#N/A` 여부를 직접 확인한다.

새로고침과 추출을 한 번에 실행하려면 아래 파일을 사용할 수 있다.

```text
scripts/05_infomax_daily_workflow.cmd
```

자세한 인포맥스 PC 절차는 `docs/INFOMAX_PC_RUNBOOK.md`를 따른다.

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

작성자는 아래 주소를 사용한다.

```text
http://127.0.0.1:4173/admin
```

조회자는 아래 주소를 사용한다.

```text
http://127.0.0.1:4173/reports
```

관리자 화면에서 할 수 있는 일:
- 추출된 시장 데이터 확인
- 숫자 데이터 기반 자동 코멘트 초안 생성
- 자동 코멘트 초안 입력
- 참고 메모 입력
- 최종 코멘트 수정
- 검토 상태 지정
- Supabase에 반영할 코멘트 SQL 생성
- Supabase 키 권한이 맞으면 숫자 데이터와 코멘트를 직접 저장

조회 화면에서 할 수 있는 일:
- 날짜별 리포트 목록 확인
- 선택한 리포트 HTML 조회
- 현재 선택한 리포트의 숫자 데이터와 코멘트 기반 간단 질문
- 질문 결과와 연결된 대표 지표 추이 확인

현재 질문 기능은 OpenAI가 아니라 로컬 JSON을 검색하는 규칙 기반 기능이다. 예를 들어 `원달러 환율 어땠어?`, `금리 변동 알려줘`, `코스피 어땠어?`처럼 물으면 관련 지표를 찾아준다. 질문 결과의 첫 번째 지표는 아래 차트 영역에 자동 표시된다. 현재 데이터가 하루치뿐이면 단일 값으로 보이고, 여러 날짜가 쌓이면 선 그래프로 바뀐다. 나중에 RAG 챗봇과 답변 기반 차트를 붙일 위치는 이 조회 화면이다.

### 4. 코멘트를 Supabase에 반영
`숫자로 자동 초안 생성` 버튼은 현재 리포트의 금리, 주식, 환율, 상품, 암호화폐 지표를 읽어 초안을 만든다. 이 초안은 LLM이 아니라 규칙 기반 문장 생성이므로, 실제 발행 전에는 뉴스와 수급 이벤트를 확인해서 `최종 코멘트`에 직접 다듬어 넣는다.

관리자 화면에서 `저장 SQL 생성` 버튼을 누르면 아래 파일이 생긴다.

```text
output/market_daily_YYYY-MM-DD.comment_update.sql
output/market_daily_YYYY-MM-DD.review.html
```

`.comment_update.sql` 파일 내용을 Supabase SQL Editor에서 실행하면 `report_comments`와 `reports.status`가 갱신된다.

`.review.html` 파일은 관리자 화면에서 작성한 최종 코멘트가 반영된 리포트 미리보기다. 화면은 `시장 코멘트`, `전일대비 주요 변동`, `핵심 지표`, `상세 데이터` 순서로 구성된다. 공유용 HTML에는 개인 PC의 전체 엑셀 경로를 노출하지 않고 파일명만 표시한다.

### 5. Supabase에 직접 저장
관리자 화면의 `Supabase에 직접 저장` 버튼은 해당 날짜의 `reports`, `market_observations`, `report_comments` 데이터를 한 번에 저장한다.

이 버튼이 `permission denied for table reports` 오류를 보여주면 `.env`의 `SUPABASE_SERVICE_ROLE_KEY`가 비어 있거나, 현재 키에 테이블 쓰기 권한이 없는 상태다. 이 경우에는 기존 방식대로 생성된 SQL 파일을 Supabase SQL Editor에서 실행하면 된다.

## 오늘 기준 업무 흐름
인포맥스 PC에서는 아래 흐름을 사용한다.

```text
00_check_environment.cmd 실행
-> 04_refresh_infomax_excel.cmd 실행
-> 01_extract_preview.cmd 실행
-> output/*.import.sql을 Supabase에서 실행
-> 03_start_admin.cmd 실행
-> 관리자 화면에서 숫자와 코멘트 확인
-> 저장 SQL 생성
-> HTML 미리보기 확인
-> output/*.comment_update.sql을 Supabase에서 실행
-> 카톡 공유
```

개인 PC에서 저장된 과거 값만 확인할 때는 아래 흐름을 사용한다.

```text
00_check_environment.cmd 실행
-> 01_extract_preview.cmd 실행
-> output/*.import.sql을 Supabase에서 실행
-> 03_start_admin.cmd 실행
-> 관리자 화면에서 숫자와 코멘트 확인
-> 저장 SQL 생성
-> HTML 미리보기 확인
-> output/*.comment_update.sql을 Supabase에서 실행
-> 카톡 공유
```

기존에 환경 점검을 이미 마쳤다면 아래처럼 시작해도 된다.

```text
01_extract_preview.cmd 실행
-> output/*.import.sql을 Supabase에서 실행
-> 03_start_admin.cmd 실행
-> 관리자 화면에서 숫자와 코멘트 확인
-> 저장 SQL 생성
-> HTML 미리보기 확인
-> output/*.comment_update.sql을 Supabase에서 실행
-> 카톡 공유
```

Supabase 직접 저장 권한이 준비된 뒤에는 아래처럼 단순화할 수 있다.

```text
01_extract_preview.cmd 실행
-> 03_start_admin.cmd 실행
-> 관리자 화면에서 숫자와 코멘트 확인
-> Supabase에 직접 저장
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
1. 최종 리포트 HTML 디자인 세부 조정
2. 관리자 화면에서 Supabase로 직접 저장
3. 인포맥스 PC에서 Excel 자동 새로고침
4. Telegram 참고 메모 수집 방식 정리
5. 과거 JPG OCR과 코멘트 아카이브 구축
6. RAG 챗봇과 질의 기반 차트 기능 추가

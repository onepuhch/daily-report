# Infomax PC Runbook

이 문서는 실제 인포맥스 add-in이 설치된 회사 PC에서 매일 실행할 절차입니다.

## 핵심 원리

개인 PC에서는 인포맥스 함수가 계산되지 않기 때문에 엑셀에 이미 저장된 과거 값만 읽을 수 있습니다.

인포맥스 PC에서는 순서가 하나 더 필요합니다.

```text
Excel 열기
-> 인포맥스 함수 새로고침
-> Excel 저장
-> 저장된 값을 JSON/HTML/SQL로 추출
-> 관리자 화면에서 코멘트 작성
-> Supabase 저장 또는 SQL 실행
```

## 처음 한 번만 할 일

### 1. 프로젝트 폴더 가져오기

GitHub를 쓰면 인포맥스 PC에서 프로젝트를 내려받습니다.

```text
C:\DailyReport
```

GitHub를 아직 쓰지 않으면 현재 폴더를 통째로 복사해도 됩니다.

### 2. Excel 파일 위치 정하기

추천 위치는 아래처럼 프로젝트 밖입니다.

```text
C:\DailyReportPrivate\MARKET DAILY.xlsm
```

이유는 Excel 원본에는 회사 데이터와 인포맥스 수식이 들어 있으므로 GitHub에 올리지 않는 편이 안전하기 때문입니다.

### 3. `.env` 확인

프로젝트 폴더의 `.env.example`을 복사해서 `.env`로 만들고 아래 값을 맞춥니다.

```text
INFOMAX_EXCEL_PATH=C:\DailyReportPrivate\MARKET DAILY.xlsm
DAILY_REPORT_WORKDIR=C:\DailyReport
REPORT_TIMEZONE=Asia/Seoul
REPORT_AUTHOR=자금운용본부
```

Supabase 값은 이미 만든 프로젝트의 값을 넣습니다. 다만 직접 저장 버튼이 막히면 SQL 파일 방식으로 진행해도 됩니다.

### 4. 환경 점검

아래 파일을 더블클릭합니다.

```text
scripts\00_check_environment.cmd
```

Node.js, `.env`, Excel 파일 위치, 기존 추출 파일, Git 상태를 확인합니다.

## 매일 실행 순서

### 방법 A. 단계별로 실행

아래 순서대로 더블클릭합니다.

```text
scripts\04_refresh_infomax_excel.cmd
scripts\01_extract_preview.cmd
scripts\03_start_admin.cmd
```

그 다음 브라우저에서 엽니다.

```text
http://127.0.0.1:4173/admin
```

관리자 화면에서 숫자와 코멘트를 확인한 뒤 `저장 SQL 생성` 또는 `Supabase에 직접 저장`을 사용합니다.

### 방법 B. 새로고침과 추출을 한 번에 실행

인포맥스 Excel 새로고침과 리포트 추출을 한 번에 하려면 아래 파일을 더블클릭합니다.

```text
scripts\05_infomax_daily_workflow.cmd
```

끝나면 관리자 화면만 따로 실행합니다.

```text
scripts\03_start_admin.cmd
```

## 첫 실행 때 확인할 것

처음에는 Excel 창이 보이도록 실행합니다. 그래서 `04_refresh_infomax_excel.cmd`와 `05_infomax_daily_workflow.cmd`는 기본적으로 Excel을 화면에 띄웁니다.

확인할 내용:

- 인포맥스 로그인 창이 뜨면 정상 로그인되는지
- Excel 상단에 보안 경고나 매크로 차단이 뜨지 않는지
- 수식 값이 `#N/A`에서 실제 숫자로 바뀌는지
- 저장 후 `01_extract_preview.cmd` 결과의 기준일이 오늘 또는 의도한 날짜인지

## 문제가 생겼을 때

### Excel이 열리지만 값이 안 바뀔 때

인포맥스 add-in 로그인 상태를 먼저 확인합니다. 수동으로 `MARKET DAILY.xlsm`을 열어서 인포맥스 메뉴 또는 새로고침 버튼이 작동하는지 봅니다.

### 새로고침 시간이 부족할 때

`Refresh-InfomaxWorkbook.ps1`은 기본 90초를 기다립니다. 더 오래 기다려야 하면 PowerShell에서 아래처럼 실행할 수 있습니다.

```text
powershell -ExecutionPolicy Bypass -File scripts\Refresh-InfomaxWorkbook.ps1 -Visible -WaitSeconds 180
```

### 추출 기준일이 이상할 때

`01_extract_preview.cmd`는 주요 지표가 많이 채워진 가장 최근 날짜를 자동으로 고릅니다. 특정 날짜를 강제로 뽑으려면 아래처럼 실행합니다.

```text
powershell -ExecutionPolicy Bypass -File scripts\Export-MarketDailyCachedValues.ps1 -ReportDate 2025-12-23
```

### Supabase 직접 저장이 막힐 때

관리자 화면의 직접 저장 버튼이 권한 오류를 내면 아래 파일을 Supabase SQL Editor에서 실행합니다.

```text
output\market_daily_YYYY-MM-DD.import.sql
output\market_daily_YYYY-MM-DD.comment_update.sql
```

## 아직 자동화하지 않은 부분

현재 스크립트는 Excel 파일을 열고 일반 새로고침과 전체 재계산을 실행합니다. 만약 인포맥스 add-in이 별도의 전용 버튼이나 매크로를 눌러야만 갱신되는 구조라면, 인포맥스 PC에서 실제 동작을 확인한 뒤 그 버튼 호출 방식까지 추가해야 합니다.

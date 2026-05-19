# Daily Report 운영 가이드

## 다른 PC에서 준비할 것

1. 이 프로젝트 폴더를 복사한다.
2. Python, Node.js, Excel, 인포맥스 Excel add-in이 설치되어 있어야 한다.
3. 프로젝트 루트 또는 상위 `project` 폴더에 `.env`를 둔다.
4. `.env`의 `INFOMAX_EXCEL_PATH`를 해당 PC의 `MARKET DAILY.xlsm` 실제 경로로 맞춘다.
5. Supabase 값은 운영 프로젝트 값을 사용한다.

필수 `.env` 값:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
INFOMAX_EXCEL_PATH=C:\...\MARKET DAILY.xlsm
DAILY_REPORT_ADMIN_PORT=4173
```

## 매일 자동 실행

Windows 작업 스케줄러 작업명:

```text
Market Daily Supabase Upload
```

상태 확인:

```text
scripts\07_check_pipeline_status.cmd
```

## 스케줄 실패 시 수동 복구

Excel 새로고침부터 다시 해야 하면:

```text
scripts\08_manual_reupload.cmd
```

Excel이 이미 갱신되고 저장되어 DB 업로드만 다시 하면:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\Run-ManualReupload.ps1 -SkipRefresh
```

수동 복구 파일은 실패 시 최근 로그와 마지막 오류를 화면에 출력한다. 실패 화면은 닫지 말고 소유자에게 전달한다.

## 데이터 검증

최신 리포트 검증:

```text
scripts\09_validate_daily_data.cmd
```

검증 내용:

- 핵심 지표 존재 여부
- 핵심 지표 값이 숫자인지
- Supabase `reports`, `market_observations`, `report_comments` 반영 여부
- KOSPI, USD/KRW, WTI, US 10Y의 Yahoo Finance 값과 경고 수준 비교

외부 데이터 비교는 시차와 종가 기준 차이가 있으므로 기본적으로 경고로 본다. 자동 발행 차단 조건으로 쓰려면 별도 엄격 모드와 허용 오차를 정해야 한다.

## 오류 전달 기준

오류가 나면 아래 세 가지를 전달한다.

1. 실행한 파일명
2. 화면에 보이는 오류 문구
3. `data\logs\daily_update_*.log` 중 가장 최근 파일
## Current Data Load Order

The scheduled and manual recovery pipelines now use this order:

1. Refresh Excel unless `-SkipRefresh` is selected.
2. Extract local JSON from `MARKET DAILY.xlsm`.
3. Run pre-upload validation.
   - Local required metrics must be present and numeric.
   - Yahoo Finance cross-check runs before upload.
   - Strict cross-check mismatches block upload.
4. Upload to Supabase only after validation passes.
5. Run post-upload DB validation.
6. Record the job result and log path in `job_runs`.

Manual test command:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\Run-DailyMarketUpdate.ps1 -SkipRefresh -LookbackDays 2
```

---

# Daily Report Operator Guide

이 문서는 개발자가 아닌 운영자가 DAILY REPORT 자동화를 실행하거나 문제를 확인할 때 쓰는 최소 절차입니다.

## 기본 경로

- 프로젝트: `C:\Users\infomax\Desktop\Market Daily\project\daily-report`
- 엑셀 원본: `C:\Users\infomax\Desktop\Market Daily\MARKET DAILY.xlsm`
- Admin: `http://127.0.0.1:4173/admin`

## 매일 자동 실행

Windows 작업 스케줄러 작업명:

```text
Market Daily Supabase Upload
```

기본 실행 시각:

```text
07:00
```

자동 실행 결과는 Admin의 `자동화 로그`에서 확인합니다.

## Admin 열기

```text
scripts\03_start_admin.cmd
```

실행하면 로컬 Admin 서버가 켜지고 브라우저가 자동으로 열립니다. 자동으로 열리지 않으면 아래 주소를 직접 엽니다.

```text
http://127.0.0.1:4173/admin
```

## 상태 점검

```text
scripts\07_check_pipeline_status.cmd
```

확인 내용:

- 작업 스케줄러 등록/최근 실행 상태
- 최근 자동화 로그 파일
- Supabase 최신 데이터 상태

Supabase 접속이 막히면 Python 오류 전체 대신 짧은 JSON 오류와 `next_actions`가 표시됩니다.

## 데이터 검증

```text
scripts\09_validate_daily_data.cmd
```

확인 내용:

- 최신 리포트 지표 35개 존재 여부
- Supabase `reports`, `market_observations`, `report_comments` 반영 여부
- Yahoo Finance로 확인 가능한 지표의 참고 대조

중요:

- Yahoo Finance 차이는 참고 경고입니다.
- Supabase 업로드 차단 기준은 엑셀/JSON의 필수 데이터 누락 또는 DB 반영 실패입니다.
- 외부 인터넷이 막히면 Yahoo 대조는 건수로 묶여 경고 표시됩니다.

## 엑셀 항목 커버리지 점검

```text
scripts\10_check_excel_coverage.cmd
```

확인 내용:

- 현재 엑셀 원본에서 매핑된 35개 지표가 모두 추출되는지
- Python 매핑과 PowerShell 매핑이 서로 다른지
- 투자자별 순매수/MMF처럼 현재 MVP에서 제외된 원천 시트가 무엇인지

## 실패 건 재실행

가장 쉬운 방법:

1. Admin을 엽니다.
2. 왼쪽 메뉴에서 `자동화 로그`를 누릅니다.
3. 실패 행의 체크박스를 선택합니다.
4. `선택 항목 재실행`을 누릅니다.
5. 몇 분 후 `로그 새로고침`을 눌러 성공 여부를 확인합니다.

수동 명령이 필요할 때:

```text
scripts\08_manual_reupload.cmd
```

엑셀 새로고침 없이 DB 업로드만 다시 할 때:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\Run-ManualReupload.ps1 -SkipRefresh
```

## 오류 전달 기준

해결이 안 되면 아래 3가지를 전달합니다.

1. Admin 자동화 로그의 실패 메시지
2. `로그 보기` 팝업의 요약과 다음 조치
3. `data\logs\daily_update_*.log` 중 해당 시간대 파일명

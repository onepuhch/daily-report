# Daily Report Operator Guide

## 2026-05-24 Admin Research Source Update

Admin의 코멘트 탭에서 AI 초안에 넣을 근거를 직접 관리할 수 있습니다.

1. `http://127.0.0.1:4173/admin`을 엽니다.
2. 리포트 날짜를 선택하고 `코멘트 검토` 탭으로 이동합니다.
3. `리서치 근거` 영역에서 제목, 유형, 중요도, 내용, URL을 입력합니다.
4. `근거 추가`를 누른 뒤 필요한 항목만 `포함` 상태로 둡니다. 불필요한 항목은 `제외` 또는 `삭제`합니다.
5. `근거 저장`을 누르면 `data\research\research_YYYY-MM-DD.json`에 저장됩니다.
6. `AI 보조 초안`은 현재 포함된 근거만 사용하며, 저장/발행은 별도 버튼을 눌러야 합니다.
7. 초안 생성 후 `AI draft trace`에서 provider, 반영된 근거 수, 반환된 source 라벨을 확인합니다.
8. fallback AI 초안은 `금리/크레딧`, `주식`, `환율/원자재`, `변동폭 점검` 섹션으로 나뉩니다. 이 구조가 보이지 않으면 최신 서버 코드가 실행 중인지 확인합니다.
9. 초안을 그대로 최종 코멘트 검토 대상으로 옮길 때는 `초안을 최종 코멘트로 복사`를 누릅니다. 최종 코멘트가 이미 작성되어 있으면 자동으로 덮어쓰지 않습니다.

이 기능은 Supabase 리포트 데이터를 수정하지 않습니다. 실제 발행 상태 변경은 기존 코멘트 저장/발행 흐름과 `dry_run` 가드를 계속 따릅니다.

## 2026-05-24 Public V2 AI Evidence Check

`http://127.0.0.1:4173/report-v2`의 상단 운영 카드에서 `AI 근거`를 확인합니다.

- `대기`로 보이면 해당 날짜에 저장되어 포함된 리서치 근거가 없는 상태입니다.
- `N개`로 보이면 Admin에서 `포함` 상태로 저장한 근거가 V2 AI 분석에도 연결된 상태입니다.
- V2의 AI 분석 채팅은 현재 날짜의 포함된 근거만 사용합니다.
- 모바일에서는 상단 날짜 목록이 좌우 스크롤되며, 현재 선택 날짜가 자동으로 보이는 위치로 이동합니다.

이 문서는 개발자가 아닌 운영자가 DAILY REPORT 자동화를 실행하거나 문제를 확인할 때 쓰는 최소 절차입니다.

## 최종 리뷰 직전 점검

화면 최종 확인을 요청하기 전에는 아래 명령을 실행합니다.

```text
scripts\final-readiness.cmd
```

이 명령은 현재 `4173` 서버, 비파괴 pipeline smoke, V2 데스크톱/모바일 캡처, Admin 코멘트 workflow 캡처를 한 번에 확인합니다. 통과 후에도 실제 발행은 Admin의 저장/발행 버튼에서만 일어납니다.

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

중요:

- 인포맥스 프로그램이 먼저 켜져 있어야 엑셀 add-in이 정상 동작합니다.
- 자동화는 엑셀을 열기 전에 `infomaxmain`, `imxlcommapp` 프로세스를 확인합니다.
- 둘 중 하나가 없으면 `C:\Infomax\bin\infomaxlogin.exe`를 자동 실행하고 최대 120초 동안 준비 상태를 기다립니다.
- 로그인 창의 아이디/비밀번호가 이미 저장되어 있으면, 자동화가 5초 뒤 Enter를 보내 로그인 버튼 클릭을 시도합니다.
- 그래도 준비되지 않으면 엑셀을 열지 않고 실패 처리하며, Admin 자동화 로그에 인포맥스 로그인/네트워크 상태를 확인하라는 메시지가 남습니다.
- 경로가 다른 PC에서는 `.env`에 `INFOMAX_LAUNCHER_PATH=...`를 설정합니다.
- 로그인 자동 클릭이 문제를 일으키면 `.env`에 `INFOMAX_LOGIN_AUTO_SUBMIT=false`를 설정합니다.
- 로그인 창이 떠서 사람이 아이디/비밀번호를 직접 입력해야 하는 환경이면 완전 자동화가 불가능하므로, 인포맥스 자동 로그인/저장 로그인 설정이 필요합니다.

## 자동 실행 실패 알림 (Telegram)

07:00 배치가 실패하면 Telegram 메시지로 즉시 알림을 받을 수 있습니다.

설정 (1회):

1. Telegram에서 `@BotFather`에게 `/newbot`을 보내 봇을 만들고 토큰을 받습니다.
2. 만든 봇에게 아무 메시지나 한 번 보낸 뒤, `@userinfobot`으로 내 chat id를 확인합니다.
3. `.env`에 추가합니다.

```text
DAILY_REPORT_ALERT_TELEGRAM_BOT_TOKEN=123456:ABC...
DAILY_REPORT_ALERT_TELEGRAM_CHAT_ID=123456789
```

동작:

- 배치의 모든 실패 경로(엑셀 새로고침, JSON 추출, 업로드 전/후 검증, Supabase 업로드)에서 실패 메시지, run id, 로그 파일 경로가 Telegram으로 전송됩니다.
- 두 값이 비어 있으면 알림 없이 기존과 동일하게 동작합니다 (로그에 skip 한 줄만 남음).
- 알림 전송 자체가 실패해도 배치 처리에는 영향이 없습니다.

## Admin 열기

```text
scripts\03_start_admin.cmd
```

실행하면 로컬 Admin 서버가 켜지고 브라우저가 자동으로 열립니다. 자동으로 열리지 않으면 아래 주소를 직접 엽니다.

```text
http://127.0.0.1:4173/admin
```

공개 리포트 화면:

```text
http://127.0.0.1:4173/report
```

# 2026-05-23 Admin AI Draft Update

The Admin comment tab now has two draft paths:

- `숫자 기반 초안`: deterministic fallback based on report observations.
- `AI 보조 초안`: calls `/api/comments/{date}/ai-draft` through the provider boundary and includes current research context. It does not save or publish anything by itself.

Research sources appear in the Admin source review panel. Until crawlers are connected, this panel may show zero collected sources and the operator memo remains the manual source input.



## Python 환경 확인

상태 점검, 데이터 검증, 엑셀 커버리지 점검, Supabase 업로드는 Python 3가 필요합니다.

```text
scripts\00_check_environment.cmd
```

여기서 Python 또는 `requests`/`openpyxl` 누락이 보이면 아래처럼 `.venv-docling`을 다시 만듭니다.

```powershell
py -3 -m venv .venv-docling
.venv-docling\Scripts\python.exe -m pip install -r requirements.txt
```

Python을 다른 위치에 설치해 쓰는 PC에서는 `DAILY_REPORT_PYTHON`에 Python 실행 파일 경로를 지정합니다.

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
# 2026-05-23 Admin AI Draft Update

The Admin comment tab now has two draft paths:

- `숫자 기반 초안`: deterministic fallback based on report observations.
- `AI 보조 초안`: calls `/api/comments/{date}/ai-draft` through the provider boundary and includes current research context. It does not save or publish anything by itself.

Research sources appear in the Admin source review panel. Until crawlers are connected, this panel may show zero collected sources and the operator memo remains the manual source input.

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


## 최종 준비 상태 확인

사용자에게 화면 최종 확인을 요청하기 전에는 아래 명령을 먼저 실행합니다.

```text
scripts\verify-pipeline.cmd
```

이 명령은 비파괴 smoke test입니다. 리포트를 발행하거나 Supabase 코멘트를 바꾸지 않고 다음을 확인합니다.

- Admin, 기존 공개 리포트, V2 공개 리포트 HTTP 200
- 최신 리포트 데이터와 35개 지표 로드
- 최신 검증 통과
- 코멘트 초안 생성
- 빈 코멘트의 reviewed/published 저장 차단
- AI 시장 답변 기본 응답
- 자동화 로그 목록과 로그 요약

V2 공개 리포트 화면:

```text
http://127.0.0.1:4173/report-v2
```
## 오류 전달 기준

해결이 안 되면 아래 3가지를 전달합니다.

1. Admin 자동화 로그의 실패 메시지
2. `로그 보기` 팝업의 요약과 다음 조치
3. `data\logs\daily_update_*.log` 중 해당 시간대 파일명

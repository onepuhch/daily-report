# Setup Guide

## 1. Git에 올릴 것과 올리지 않을 것

Git에 올릴 것:
- `docs/`
- `phases/`
- `config/`
- `db/`
- `src/`
- `README.md`
- `.env.example`
- `.gitignore`

Git에 올리지 않을 것:
- `.env`
- `MARKET DAILY.xlsm`
- 과거 JPG 원본
- `data/raw/`
- `data/processed/`
- `output/`
- Supabase 키, DB 비밀번호, 인포맥스 로그인 정보

## 2. Supabase 프로젝트 생성 후 할 일

1. Supabase에서 새 프로젝트를 만든다.
2. SQL Editor에서 `db/schema.sql` 내용을 실행한다.
3. Project URL, anon key, service role key, DB password를 확인한다.
4. `.env.example`을 복사해 `.env`를 만든다.
5. `.env`에 실제 값을 넣는다.

## 3. 인포맥스 PC에서 할 일

1. Git 저장소를 가져온다.
2. `MARKET DAILY.xlsm`은 Git 폴더 밖의 안전한 로컬 경로에 둔다.
3. `.env`의 `INFOMAX_EXCEL_PATH`에 실제 엑셀 경로를 넣는다.
4. Excel에서 인포맥스 Add-in 로그인과 수동 갱신이 정상인지 먼저 확인한다.
5. 이후 자동 갱신/추출 스크립트를 실행한다.

## 4. 권장 로컬 파일 배치

```text
C:\DailyReport
  코드 저장소

C:\DailyReportPrivate
  MARKET DAILY.xlsm
  .env 백업
  과거 JPG 원본
```

## 5. 다음 구현 순서

1. Supabase 스키마 생성
2. 샘플 데이터 insert 테스트
3. Excel 자동 갱신 스크립트 작성
4. Excel 값 추출 스크립트 작성
5. HTML 리포트 초안 작성


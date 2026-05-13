# Data Model

## 핵심 원칙
- 숫자 데이터와 코멘트 데이터를 분리한다.
- 숫자는 차트와 통계 계산에 적합한 형태로 저장한다.
- 코멘트는 RAG 검색과 사람의 최종 판단 기록에 적합한 형태로 저장한다.
- 이미지는 보조 산출물이며 원본 데이터 역할을 하지 않는다.

## 주요 테이블 초안

### reports
날짜별 리포트 단위.

| 컬럼 | 설명 |
|---|---|
| id | 리포트 ID |
| report_date | 리포트 기준일 |
| status | draft, reviewed, published |
| title | 리포트 제목 |
| created_at | 생성 시각 |
| published_at | 발행 시각 |

### market_observations
날짜별 시장 숫자.

| 컬럼 | 설명 |
|---|---|
| id | 데이터 ID |
| report_id | reports 참조 |
| observed_date | 실제 데이터 기준일 |
| category | domestic_rates, global_rates, equities, fx, crypto, commodities, credit, flows |
| metric_key | 고유 지표 키 |
| metric_name | 표시명 |
| value | 값 |
| unit | %, bp, pt, USD, KRW 등 |
| change_1d | 전일대비 |
| change_ytd | 전년말대비 |
| source | infomax, krx, ecos, fred 등 |
| source_sheet | Excel 시트명 |
| source_cell | Excel 셀 주소 |

### report_comments
자동 초안과 사람이 수정한 최종 코멘트.

| 컬럼 | 설명 |
|---|---|
| id | 코멘트 ID |
| report_id | reports 참조 |
| auto_comment | 자동 생성 초안 |
| final_comment | 사람이 수정한 최종본 |
| reference_note | 텔레그램 등 참고 메모 |
| tags | 주요 태그 |
| approved_by | 승인자 |
| approved_at | 승인 시각 |
| embedding | pgvector 검색용 벡터 |

### source_documents
과거 JPG, 텔레그램 메모, 외부 참고자료.

| 컬럼 | 설명 |
|---|---|
| id | 문서 ID |
| source_type | historical_jpg, telegram_note, manual_note |
| source_date | 자료 기준일 |
| title | 제목 |
| extracted_text | OCR 또는 원문 텍스트 |
| summary | 요약 |
| tags | 태그 |
| embedding | pgvector 검색용 벡터 |

## 챗봇 검색 방식

### SQL 검색
정확한 수치, 기간별 변화, 차트 생성에 사용한다.

예:
- 최근 3개월 미국 10년물과 USDKRW 추이
- 외국인 KOSPI 순매도 상위 10일
- 크레딧 스프레드 확대 구간

### Vector 검색
비슷한 과거 시장 코멘트와 맥락 검색에 사용한다.

예:
- 오늘과 비슷한 금리 상승 코멘트
- 달러 강세와 국내 금리 상승이 함께 언급된 과거 사례
- 외국인 선물 매도와 증시 하락이 같이 나온 날


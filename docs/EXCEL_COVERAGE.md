# Excel Coverage

Last checked: 2026-05-25

## Scope

This document tracks whether the Excel source workbook is covered by the daily data ingestion MVP.

Source workbook:

- `C:\Users\infomax\Desktop\Market Daily\MARKET DAILY.xlsm`

Primary user-facing sheet:

- `MARKET DAILY`

Operational source sheets used by the extractor:

- `CD금리`
- `국내금리`
- `크레딧SP`
- `해외금리`
- `국내주식및환율`
- `해외주식`
- `아시아주식`
- `해외환율`
- `암호화폐`
- `상품`
- `선물투자자별순매수금액`
- `주식투자자별순매수금액`

Important implementation note:

- The visible `MARKET DAILY` sheet is a presentation/output sheet.
- Current automated extraction reads cached values from the underlying data sheets above.
- `config/metrics.yml` is currently a category/source-sheet sketch, not the source of truth for metric cell mappings.
- The active metric mapping is duplicated in:
  - `scripts/Export-MarketDailyCachedValues.ps1`
  - `scripts/import_historical_market_data.py`

## Latest Coverage Result

Latest local processed file available in this workstation:

- `data/processed/market_daily_2025-12-23.json`

Latest API check:

- `/api/reports/2026-05-21`

Latest automated source coverage check:

- Command: `scripts\10_check_excel_coverage.cmd`
- Wrapper: `scripts\Check-ExcelCoverage.ps1`
- Core script: `scripts\check_excel_coverage.py`
- Result date: `2025-12-23` local workbook/cache

Result:

- Expected mapped metrics: 50
- Local workbook extraction observations: 50
- Admin API observations: 35 for Supabase latest `2026-05-21`
- Missing mapped metrics from local workbook extraction: 0
- Python/PowerShell mapping parity: 50 vs 50, mismatch 0

Note: investor-flow metrics are now mapped and extract correctly from the local workbook. The current Supabase latest report still has the older 35-observation payload until that report date is regenerated/re-uploaded.

## Extracted Metric Inventory

| Metric key | Name | Category | Sheet | Column | Status |
|---|---|---|---|---|---|
| `cd_91d` | CD 91일 | 국내금리 | `CD금리` | B | mapped |
| `kr_gov_2y` | 국고채 2년 | 국내금리 | `국내금리` | B | mapped |
| `kr_gov_3y` | 국고채 3년 | 국내금리 | `국내금리` | C | mapped |
| `kr_gov_5y` | 국고채 5년 | 국내금리 | `국내금리` | D | mapped |
| `kr_gov_10y` | 국고채 10년 | 국내금리 | `국내금리` | E | mapped |
| `kr_gov_30y` | 국고채 30년 | 국내금리 | `국내금리` | G | mapped |
| `kr_corp_aa0_3y` | 회사채 AA0 3년 | 크레딧 | `국내금리` | X | mapped |
| `credit_spread_aa0_2y` | 회사채 AA0 2년 스프레드 | 크레딧 | `크레딧SP` | D | mapped |
| `us_treasury_2y` | 미국채 2년 | 해외금리 | `해외금리` | B | mapped |
| `us_treasury_10y` | 미국채 10년 | 해외금리 | `해외금리` | C | mapped |
| `us_treasury_30y` | 미국채 30년 | 해외금리 | `해외금리` | D | mapped |
| `germany_bund_10y` | 독일 국채 10년 | 해외금리 | `해외금리` | E | mapped |
| `japan_gov_10y` | 일본 국채 10년 | 해외금리 | `해외금리` | F | mapped |
| `kospi` | KOSPI | 국내주식 | `국내주식및환율` | B | mapped |
| `kospi200` | KOSPI200 | 국내주식 | `국내주식및환율` | C | mapped |
| `kosdaq` | KOSDAQ | 국내주식 | `국내주식및환율` | D | mapped |
| `usdkrw` | 원/달러 | 환율 | `국내주식및환율` | E | mapped |
| `dow` | 다우 산업 | 해외주식 | `해외주식` | B | mapped |
| `sp500` | S&P 500 | 해외주식 | `해외주식` | C | mapped |
| `nasdaq` | 나스닥 종합 | 해외주식 | `해외주식` | D | mapped |
| `dax` | 독일 DAX | 해외주식 | `해외주식` | E | mapped |
| `nikkei225` | 니케이 225 | 해외주식 | `아시아주식` | B | mapped |
| `hangseng_h` | 항셍 H | 해외주식 | `아시아주식` | C | mapped |
| `shanghai_comp` | 상해종합 | 해외주식 | `아시아주식` | D | mapped |
| `dollar_index` | 달러인덱스 | 환율 | `해외환율` | B | mapped |
| `usdjpy` | 달러/엔 | 환율 | `해외환율` | C | mapped |
| `eurusd` | 유로/달러 | 환율 | `해외환율` | D | mapped |
| `btc_usd` | BTC | 암호화폐 | `암호화폐` | B | mapped |
| `eth_usd` | ETH | 암호화폐 | `암호화폐` | C | mapped |
| `wti` | WTI | 상품 | `상품` | B | mapped |
| `brent` | 브렌트유 | 상품 | `상품` | C | mapped |
| `gold` | 금 | 상품 | `상품` | D | mapped |
| `silver` | 은 | 상품 | `상품` | E | mapped |
| `sox` | 필라델피아 반도체 | 상품 | `상품` | F | mapped |
| `copper` | 구리 | 상품 | `상품` | G | mapped |
| `fut_kospi200_inst` | KOSPI200 선물 기관 순매수 | 투자자 동향 | `선물투자자별순매수금액` | B | mapped |
| `fut_kospi200_foreign` | KOSPI200 선물 외국인 순매수 | 투자자 동향 | `선물투자자별순매수금액` | C | mapped |
| `fut_kospi200_individual` | KOSPI200 선물 개인 순매수 | 투자자 동향 | `선물투자자별순매수금액` | D | mapped |
| `fut_kr3y_inst` | 3년 국채선물 기관 순매수 | 투자자 동향 | `선물투자자별순매수금액` | E | mapped |
| `fut_kr3y_foreign` | 3년 국채선물 외국인 순매수 | 투자자 동향 | `선물투자자별순매수금액` | F | mapped |
| `fut_kr3y_individual` | 3년 국채선물 개인 순매수 | 투자자 동향 | `선물투자자별순매수금액` | G | mapped |
| `fut_kr10y_inst` | 10년 국채선물 기관 순매수 | 투자자 동향 | `선물투자자별순매수금액` | H | mapped |
| `fut_kr10y_foreign` | 10년 국채선물 외국인 순매수 | 투자자 동향 | `선물투자자별순매수금액` | I | mapped |
| `fut_kr10y_individual` | 10년 국채선물 개인 순매수 | 투자자 동향 | `선물투자자별순매수금액` | J | mapped |
| `stock_kospi_inst` | KOSPI 기관 순매수 | 투자자 동향 | `주식투자자별순매수금액` | B | mapped |
| `stock_kospi_foreign` | KOSPI 외국인 순매수 | 투자자 동향 | `주식투자자별순매수금액` | C | mapped |
| `stock_kospi_individual` | KOSPI 개인 순매수 | 투자자 동향 | `주식투자자별순매수금액` | D | mapped |
| `stock_kosdaq_inst` | KOSDAQ 기관 순매수 | 투자자 동향 | `주식투자자별순매수금액` | E | mapped |
| `stock_kosdaq_foreign` | KOSDAQ 외국인 순매수 | 투자자 동향 | `주식투자자별순매수금액` | F | mapped |
| `stock_kosdaq_individual` | KOSDAQ 개인 순매수 | 투자자 동향 | `주식투자자별순매수금액` | G | mapped |

35 base metrics + 15 investor-flow metrics = 50 mapped metrics total.

## Excluded Source Columns

These columns exist in the underlying source sheets but are not currently part of the public daily report metric set.

| Sheet | Excluded columns | Classification | Reason |
|---|---|---|---|
| `국내금리` | 통안증권 1/2/3년, 특수채 AAA 1/2/3/5/10년, 은행채 AAA 3개월/1/2/3/5/10년, 회사채 AA0 1/2/5년, 기타금융채 AA- 계열, 사모 회사채 계열 | intended_exclusion | Current report uses a smaller benchmark set. Add only if the visible `MARKET DAILY` sheet requires them. |
| `크레딧SP` | 국고 2년, 회사채 AA0 2년 component columns | intended_exclusion | The current report uses the calculated spread column. 국고 2년 is already mapped from `국내금리`. |

Additional deferred source sheets detected by `scripts\check_excel_coverage.py`:

| Sheet | Excluded columns | Classification | Reason |
|---|---|---|---|
| `국공채형MMF` | B:K | mmf_deferred | MMF data exists in the workbook but is not part of the current daily report metric set. |
| `일반형MMF` | B:G | mmf_deferred | MMF data exists in the workbook but is not part of the current daily report metric set. |

No mapped metric is currently missing from the latest local workbook extraction. Supabase needs a refreshed upload before investor-flow rows appear in the latest API response.

## Risks And Follow-Ups

1. Consolidate metric mappings into one source of truth.
   - Current duplication between PowerShell and Python can drift.
   - `scripts\check_excel_coverage.py` now detects drift automatically, but the recommended target is still to generate both daily export and historical import from the same structured mapping file.
2. Confirm whether the visible `MARKET DAILY` sheet includes any manually placed item that is not represented by the underlying source sheets.
   - The current XML inspection sees only presentation-level cached cells on `MARKET DAILY`.
   - A visual/manual review of the sheet is still useful before declaring final coverage.
3. Keep this document updated whenever a metric is added, intentionally excluded, renamed, or reclassified.
4. 은행채 AAA re-introduction (D-023). The 은행채 AAA tenors above are currently `intended_exclusion` but the operator asked to bring them back into the `금리·크레딧` view. To do so: read the exact `국내금리` columns for 은행채 AAA (3개월/1/2/3/5/10년) on the Infomax PC workbook, add the chosen tenors to both `scripts/Export-MarketDailyCachedValues.ps1` and `scripts/import_historical_market_data.py` with `category=credit`, `unit=%`, `ChangeMode=rate_bp` (recommended start: 1년·2년·3년), then re-extract/re-upload. Move the rows out of the exclusion table and into the inventory once added.
5. Public V2 card grouping is a UI-level choice, independent of these extraction categories. The V2 report groups `crypto` and all `investor_flows` under the `주식·투자자` card (D-022); the extraction-time categories (`crypto`, `investor_flows`) are unchanged.

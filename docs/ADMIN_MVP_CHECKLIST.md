# Admin MVP Checklist

Last updated: 2026-05-21

## Purpose

This checklist defines what the Admin screen must do before the project moves from phase 1 data-ingestion MVP into phase 2 Admin operations MVP.

MVP target:

- The operator can confirm the daily data loaded correctly.
- The operator can review validation differences and record an operational approval when needed.
- The operator can edit/finalize comments and publish the report.
- The operator can notice automation failures and trigger the appropriate recovery path.

## Screen Checklist

| Screen | MVP job | Current status | Missing / next action |
|---|---|---|---|
| Data | Show one selected report date's market data in a dense table so the operator can quickly scan values, daily changes, and year-end changes. | Mostly met. Date dropdown, category tabs, DB-backed rows, `전일대비`/`작년말대비` columns are available. | User visual review of whether any visible Excel `MARKET DAILY` items are still missing. Keep table-first layout; card view is optional later. |
| Preview | Show the generated public HTML report for the selected date before the operator publishes or shares it. | Met for MVP. Preview iframe and open link are available. | Only check for broken rendering in phase 1. Detailed report redesign and click-to-chart interactions are deferred. |
| Comment | Let the operator review AI/auto draft text, reference notes, final comment, and publication status. | Met for MVP. Manual editing, status save flow, status help text, empty-comment guard for `reviewed/published`, and one unchanged `reviewed` save dogfood are complete. | AI drafting remains deferred. |
| Validation | Compare DB values with available external references and show whether differences exist without forcing an arbitrary tolerance rule. | Mostly met. Yahoo link, DB value, Yahoo value, result, and approval action are visible. Approval history table integration exists. | Dogfood one real low-risk approval after the operator confirms the DB/Infomax value is correct. DB overwrite remains out of scope. |
| Automation Log | Let a non-developer know whether the daily automation succeeded, see a readable failure summary, and rerun a failed row. | Met for MVP. Job rows, failure highlighting, log modal, operator summary, selected failed-row rerun, and collapsed raw logs are implemented and dogfooded against a real failed row. | Improve wording only if real operation shows the summary/action text is confusing. |

Data coverage note:

- `scripts\check_excel_coverage.py` confirms 35 mapped metrics and 0 missing mapped metrics for `2026-05-20`.
- Investor-flow and MMF workbook sheets are detected but classified as deferred scope, not current daily-report MVP omissions.

## Phase 1 Stop Conditions

Phase 1 can be treated as complete when all of the following are true:

- Excel source coverage has no unexplained missing metric.
- The latest scheduled automation run is visible in Admin automation logs.
- A failed automation row shows a human-readable reason and next action.
- Pre-upload validation blocks Supabase upload when required local metrics are missing or invalid.
- Yahoo Finance differences remain visible as warnings/reference checks and do not block upload by themselves.
- Validation approval can be recorded once for a real, operator-approved mismatch.
- The selected date can move through data review, comment edit, preview check, and publish status update without code changes.

## Phase 2 Work Queue

Only these gaps should move into Admin operations MVP work:

- Adjust comment workflow wording only if real operation shows it is confusing.
- Improve validation approval UX after real use, not before.
- Add an operations summary card only if daily use shows the table alone is not enough.
- Add AI draft generation only after the manual comment workflow is stable.

## Deferred

These are intentionally not phase 1 or early phase 2 work:

- Public report redesign experiments.
- Persistent right-side metric detail panel.
- Click-to-chart visualizations.
- Chatbot implementation.
- External news or Telegram crawling.
- DB overwrite from Yahoo/external values.

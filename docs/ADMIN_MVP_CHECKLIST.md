# Admin MVP Checklist

Last updated: 2026-05-23

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
| Comment | Let the operator review AI/auto draft text, reference notes, final comment, and publication status. | Met for MVP. Manual editing, status save flow, status help text, empty-comment guard for `reviewed/published`, draft generation smoke check, and one unchanged `reviewed` save dogfood are complete. | Provider-backed AI drafting remains deferred. |
| Validation | Compare DB values with available external references and show whether differences exist without forcing an arbitrary tolerance rule. | Mostly met. Yahoo link, DB value, Yahoo value, result, and approval action are visible. Approval history table integration exists. | Dogfood one real low-risk approval after the operator confirms the DB/Infomax value is correct. DB overwrite remains out of scope. |
| Automation Log | Let a non-developer know whether the daily automation succeeded, see a readable failure summary, and rerun a failed row. | Met for MVP. Job rows, failure highlighting, log modal, operator summary, selected failed-row rerun, collapsed raw logs, and cross-PC log-unavailable guidance are implemented and dogfooded against a real failed row. | Improve wording only if real operation shows the summary/action text is confusing. |

Data coverage note:

- `scripts\check_excel_coverage.py` confirms 35 mapped metrics and 0 missing mapped metrics on the local workbook cache.
- The 2026-05-22 rerun used the local `2025-12-23` workbook/cache and found 35 extracted observations with 0 Python/PowerShell mapping mismatches.
- Admin/API smoke verification now uses Supabase latest `2026-05-21` and passes with 35 observations.
- Investor-flow and MMF workbook sheets are detected but classified as deferred scope, not current daily-report MVP omissions.


2026-05-23 note:

- Smoke verification now checks Admin, `/report`, `/report-v2`, latest report detail, history, metric series, latest validation, comment draft generation, AI market answer, automation job list/log summary, negative guards for empty reviewed/published comments, and non-destructive published dry-run readiness in one command: `scripts\verify-pipeline.cmd`.
- Latest validation can pass from Supabase-loaded report data when the local processed JSON artifact for that date is unavailable. In that fallback mode, Yahoo cross-check is explicitly skipped and shown as a warning.
- `docs\FINAL_READINESS_CHECKLIST.md` defines when Codex can ask the user for final visual/design review.
## Phase 1 Stop Conditions

Phase 1 can be treated as complete when all of the following are true:

- Excel source coverage has no unexplained missing metric.
- The latest scheduled automation run is visible in Admin automation logs.
- A failed automation row shows a human-readable reason and next action.
- Pre-upload validation blocks Supabase upload when required local metrics are missing or invalid.
- Pre-upload validation blocks Supabase upload when any mapped metric is missing from the generated JSON.
- Yahoo Finance differences remain visible as warnings/reference checks and do not block upload by themselves.
- Validation approval can be recorded once for a real, operator-approved mismatch.
- The selected date can move through data review, comment edit, preview check, and publish status update without code changes.

## Phase 2 Work Queue

Only these gaps should move into Admin operations MVP work:

- Adjust comment workflow wording only if real operation shows it is confusing.
- Improve validation approval UX after real use, not before.
- Add an operations summary card only if daily use shows the table alone is not enough.
- Add AI draft generation only after the manual comment workflow is stable.

## Later Phases

These are not phase 1 or early phase 2 blockers, but several of them remain part of the final product goal. Do not remove the hooks for them.

- Public report redesign experiments.
- Persistent right-side metric detail panel.
- Click-to-chart visualizations.
- Provider-backed chatbot implementation.
- External news or Telegram crawling.
- RAG over historical comments/source documents.
- AI-assisted final comment drafting.
- Optional autonomous publish mode after manual workflow, dry-run, audit, and rollback rules are proven.
- DB overwrite from Yahoo/external values only if a separate audited overwrite workflow is explicitly designed.

Future automation direction is tracked in `docs\FUTURE_AUTOMATION_ROADMAP.md`.

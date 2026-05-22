# Daily Report Claude Guide

See @README.md for the project overview, @docs/ARCHITECTURE.md for system shape, and @AGENTS.md for shared project rules.

## Commands
- Start admin/public report locally: `scripts\03_start_admin.cmd`
- Verify the server/API smoke path: `scripts\verify-pipeline.cmd`
- Check environment: `scripts\00_check_environment.cmd`
- Check Supabase pipeline status: `scripts\07_check_pipeline_status.cmd`
- Validate local daily data: `scripts\09_validate_daily_data.cmd`
- Refresh Infomax Excel: `scripts\04_refresh_infomax_excel.cmd`
- Manual reupload/recovery: `scripts\08_manual_reupload.cmd`

## Workflow
- For multi-file changes, explore first and write a short plan before editing.
- After changing `.mjs` or `.js`, run `node --check` on touched files.
- Before commit, run `scripts\verify-pipeline.cmd` when the admin server or API behavior changed.
- Update `HANDOFF.md` with current state, next steps, and a recent work-log entry before commit/push.
- This is a GitHub repo; prefer `gh` CLI for GitHub issues, PRs, and review context when available.

## Project Notes
- Supabase is the primary report source; local `data\processed` is a fallback/cache path.
- Do not commit `.env`, Excel workbooks, generated `data`, generated `output`, `node_modules`, or `.venv-docling`.
- Use `.venv-docling\Scripts\python.exe` or `DAILY_REPORT_PYTHON` for Python scripts that require `requests`/`openpyxl`.
- Read `HANDOFF.md` only when resuming operational work or changing pipeline decisions; keep always-loaded context short.

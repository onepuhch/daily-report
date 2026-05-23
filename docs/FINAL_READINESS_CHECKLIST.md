# Final Readiness Checklist

Last updated: 2026-05-23

## Purpose

This checklist defines the point where the user should be asked to do the final visual/design review. Before that point, Codex should keep working and should not ask the user to review the screen.

## Current Rule

Ask for final user review only after all non-visual checks below pass:

- Admin server starts successfully.
- `/admin`, `/report`, and `/report-v2` return HTTP 200.
- Latest report API returns the newest report date and non-empty observations.
- Latest validation API returns `pass`.
- Comment draft generation returns non-empty text.
- Empty `reviewed` or `published` comments are blocked with HTTP 400.
- A valid published payload passes `/api/supabase/reports/{date}` dry-run readiness without modifying Supabase.
- AI provider status endpoint reports the active fallback/provider.
- Research context endpoint returns a valid summary, even when no crawler data exists yet.
- AI-assisted comment draft endpoint returns a non-empty draft without mutating Supabase.
- AI market answer endpoint returns a non-empty answer and matched metrics.
- Automation job runs are visible.
- Automation log endpoint returns either a readable log summary or a soft failure summary explaining why the log is unavailable on this PC.
- Browser screenshot check has been refreshed for desktop and mobile.
- HANDOFF and relevant docs are updated with what changed and what remains deferred.

## One-Command Smoke Test

Run:

```text
scripts\verify-pipeline.cmd
```

This command is intentionally non-destructive. It checks API and process readiness without publishing a report or modifying Supabase comments.

Current coverage:

- health endpoint
- report list and latest report detail
- metric history and selected metric series
- Admin page
- classic public report
- V2 public report
- latest validation
- AI provider status
- research context summary
- comment draft generation
- AI-assisted comment draft generation
- AI market answer with sources and research summary
- automation job list and log summary
- empty reviewed comment guard
- empty published upload guard
- published upload dry run
- expected 404/400 negative paths

## Design Review Gate

The final design review is appropriate only when:

1. `scripts\verify-pipeline.cmd` passes.
2. Current 4173 server is running.
3. Desktop and mobile screenshots in `design ref\figma-financial-dashboard\` are refreshed.
4. No unresolved implementation blocker remains in HANDOFF.

Then the user only needs to open:

```text
http://127.0.0.1:4173/report-v2
```

## Current Gate Status

Checked on 2026-05-23:

- `node --check src\daily_report\admin\server.mjs` passed.
- `node --check src\daily_report\admin\app.js` passed.
- `node --check src\daily_report\report_v2\app.js` passed.
- `node --check src\daily_report\ai\llm_provider.mjs` passed.
- `node --check src\daily_report\ai\rule_based_provider.mjs` passed.
- `node --check src\daily_report\research\research_items.mjs` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Verify-Pipeline.ps1` passed.
- The smoke test now includes `/api/ai/provider`, `/api/research/{date}`, `/api/comments/{date}/ai-draft`, AI sources, and research summary checks.
- Latest report used by smoke test: `2026-05-21`, with 35 observations.
- `/report-v2` static copy was cleaned up so visible Korean labels no longer render as mojibake.
- Desktop screenshot refreshed: `design ref\figma-financial-dashboard\report-v2-desktop-check.png`.
- Mobile screenshot refreshed: `design ref\figma-financial-dashboard\report-v2-mobile-check.png`.
- Local review server is running on `http://127.0.0.1:4173`.

## Not Blocking This Review

These items are part of the final product direction, but they are not required before the current visual/design review gate. Keep interfaces ready for them and continue implementing them after the base Admin/V2 workflow is stable:

- News/RAG/Telegram crawling.
- Fully autonomous AI-written final comments.
- Automatic publishing without human review.
- DB overwrite from Yahoo/external values.
- Figma MCP paid Dev Mode integration.

See `docs\FUTURE_AUTOMATION_ROADMAP.md` and `docs\AI_CONTEXT_CONTRACT.md` for the intended future architecture.

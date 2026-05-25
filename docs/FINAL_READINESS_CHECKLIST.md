# Final Readiness Checklist

Last updated: 2026-05-25

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
- Research save/reload path works locally without mutating Supabase report data.
- Public V2 keeps admin/process state out of the user-facing report surface; research and validation state remain available through Admin/API checks.
- AI-assisted comment draft endpoint returns a non-empty draft without mutating Supabase.
- AI-assisted comment draft is sectioned for operator review, including rates/credit and top-mover checks.
- AI-assisted draft UI shows provider/source trace for operator review.
- Admin draft-to-final copy button works without overwriting an existing final comment.
- AI market answer endpoint returns a non-empty answer and matched metrics.
- AI market answer and AI-assisted draft text pass a readable-text guard for mojibake-like characters.
- Automation job runs are visible.
- Automation log endpoint returns either a readable log summary or a soft failure summary explaining why the log is unavailable on this PC.
- Browser screenshot check has been refreshed for desktop and mobile.
- HANDOFF and relevant docs are updated with what changed and what remains deferred.

## Final Readiness Command

Run this before asking the user for the final visual/design review:

```text
scripts\final-readiness.cmd
```

This command is intentionally non-destructive. It checks the currently running `4173` review server, runs the full pipeline smoke test on a temporary port, and confirms the desktop/mobile/Admin screenshots exist and are recent.

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
- local research save/reload
- comment draft generation
- AI-assisted comment draft generation
- AI-assisted draft section-shape check
- AI market answer with sources and research summary
- readable-text guard for AI answer and AI-assisted draft output
- automation job list and log summary
- empty reviewed comment guard
- empty published upload guard
- published upload dry run
- expected 404/400 negative paths

## Design Review Gate

The final design review is appropriate only when:

1. `scripts\final-readiness.cmd` passes.
2. Current 4173 server is running.
3. Desktop and mobile screenshots in `design ref\figma-financial-dashboard\` are refreshed.
4. No unresolved implementation blocker remains in HANDOFF.

Then the user only needs to open:

```text
http://127.0.0.1:4173/report-v2
```

## Current Gate Status

Checked through 2026-05-25:

- `node --check src\daily_report\admin\server.mjs` passed.
- `node --check src\daily_report\admin\app.js` passed.
- `node --check src\daily_report\report_v2\app.js` passed.
- `node --check src\daily_report\ai\llm_provider.mjs` passed.
- `node --check src\daily_report\ai\rule_based_provider.mjs` passed.
- `node --check src\daily_report\research\research_items.mjs` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Verify-Pipeline.ps1` passed.
- The smoke test now includes `/api/ai/provider`, `/api/research/{date}`, `/api/comments/{date}/ai-draft`, AI sources, and research summary checks.
- The smoke test now includes a temporary local research save/reload check and cleans up `data\research\research_2099-01-02.json`.
- Latest report used by smoke test: `2026-05-21`, with 35 observations.
- `/report-v2` static copy was cleaned up so visible Korean labels no longer render as mojibake.
- Desktop screenshot refreshed: `design ref\figma-financial-dashboard\report-v2-desktop-check.png`.
- Mobile screenshot refreshed: `design ref\figma-financial-dashboard\report-v2-mobile-check.png`.
- Local review server is running on `http://127.0.0.1:4173`.
- 2026-05-24 update: Edge headless refreshed the V2 desktop/mobile screenshots after Admin research persistence and V2 research context wiring.
- 2026-05-24 update: V2 now loads research context during report load, shows `AI 근거` readiness, reuses included research items for chat, and keeps the active mobile date pill in view.
- 2026-05-24 update: rule-based provider Korean output was restored and `/api/ask` was checked for readable Korean answer text.
- 2026-05-24 update: Admin AI-assisted draft now shows provider/source trace after generation.
- 2026-05-24 update: `/api/comments/2026-05-21/ai-draft` was checked for readable Korean assisted-draft output and provider/source summary.
- 2026-05-24 update: `scripts\Verify-Pipeline.ps1` now fails if AI market answer or AI-assisted draft output contains mojibake-like characters.
- 2026-05-24 update: Rule-based `assisted_draft` now returns a sectioned operator-review draft and smoke tests assert the rates/credit and mover-review sections are present.
- 2026-05-24 update: Admin comment workflow gained a guarded draft-to-final copy button; Edge headless verified the copy behavior and refreshed `design ref\figma-financial-dashboard\admin-comment-workflow-check.png`.
- 2026-05-25 update: Added `scripts\Final-Readiness.ps1` and `scripts\final-readiness.cmd`; the command passed against current `http://127.0.0.1:4173`, temporary smoke server, and all three screenshot files.
- 2026-05-25 update: V2 pre-review polish replaced raw validation warnings with compact Korean process summaries, normalized generated-time display, and fixed mobile metric-table clipping. Desktop/mobile screenshots were refreshed after the change.
- 2026-05-25 update: V2 public review feedback was applied. Public `/report-v2` now uses a date dropdown, `Brief / Markets / Trends / AI` navigation, no visible operations/process strip, a `Market Pulse` card, a `Trends` chart section, category sparkline labels, and corrected global/FX/crypto category mapping.
- 2026-05-25 data gap: latest `2026-05-21` API response has no `investor_flows` observations because Supabase still has the older 35-observation payload. Local workbook extraction now maps and extracts 50 observations including investor flows; Supabase needs a refreshed upload before those rows appear in the live latest API response.
- 2026-05-25 update: `scripts\final-readiness.cmd` passed again after the V2 public information-architecture pass and refreshed screenshots.
- 2026-05-25 follow-up: Removed `Market Pulse`, reduced public nav to `Overview / Trend / AI`, moved charting fully into the Trend section, removed market-card header sparklines, and regrouped market cards as `금리·크레딧 / 주식·투자자 / 환율·암호화폐 / 원자재`. Investor-flow rows are grouped inside the stock card so the public grid stays 2x2 after DB refresh.

## Not Blocking This Review

These items are part of the final product direction, but they are not required before the current visual/design review gate. Keep interfaces ready for them and continue implementing them after the base Admin/V2 workflow is stable:

- News/RAG/Telegram crawling.
- Fully autonomous AI-written final comments.
- Automatic publishing without human review.
- DB overwrite from Yahoo/external values.
- Figma MCP paid Dev Mode integration.

See `docs\FUTURE_AUTOMATION_ROADMAP.md` and `docs\AI_CONTEXT_CONTRACT.md` for the intended future architecture.

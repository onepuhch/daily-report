# Future Automation Roadmap

Last updated: 2026-05-24

## Positioning

The final product goal is not just a prettier daily report. The target is a professional treasury daily-report system that keeps working even when the primary operator is absent.

The current visual review gate does not require all advanced automation to be complete. That is a sequencing decision, not a scope removal. The code should continue to keep hooks for these final capabilities.

## Final Capabilities

- Provider-backed AI analysis and chatbot.
- AI-assisted final comment drafting.
- Google/news/bond-market reference collection.
- Telegram or channel-based market-note ingestion.
- RAG over historical comments, source documents, and market observations.
- Admin review workflow that shows sources before final comment approval.
- Optional autonomous publish mode after manual workflow and audit controls are stable.
- Non-destructive dry-run checks before any write that affects Supabase publication state.

## Already Pre-Wired

- `/api/ask` accepts structured context from V2 and now runs through `src/daily_report/ai/llm_provider.mjs`.
- `src/daily_report/ai/rule_based_provider.mjs` preserves the current grounded fallback behavior while provider-backed LLMs are evaluated.
- `/api/ai/provider` exposes provider state for smoke checks and future Admin diagnostics.
- `/api/research/{date}` and `src/daily_report/research/research_items.mjs` define the normalized research-item path before crawlers are added.
- `POST`/`PUT /api/research/{date}` saves local research items in `data/research/research_YYYY-MM-DD.json` without mutating Supabase report data.
- `/api/comments/{date}/ai-draft` provides the non-mutating assisted-draft path that future provider-backed LLMs will replace.
- Admin comment review now has a source review panel, manual source add/save, include/exclude/delete controls, and separate number-based vs AI-assisted draft actions.
- V2 reads `/api/research/{date}` and sends currently included `research_items` into `/api/ask`.
- The AI context contract includes `sources`, `confidence`, `safety`, `automation_state`, and mode fields.
- Supabase publication supports `dry_run: true`.
- `scripts\Verify-Pipeline.ps1` verifies provider status, research context, the AI endpoint, comment draft generation, publish guards, and dry-run readiness.
- Admin already separates data review, comment review, validation, preview, and automation logs.

## Recommended Sequence

1. Stabilize manual Admin publish workflow and final V2 design.
2. Add provider adapter behind `/api/ask` while preserving the current rule-based fallback.
3. Promote local research-item storage to Supabase using `db/research_items.sql` when crawler data needs shared persistence.
4. Add crawler/manual-ingestion jobs that write source type, URL/channel, timestamp, text, relevance, and report date.
5. Add AI-assisted final comment draft mode with source citations.
6. Add RAG over historical comments and report observations.
7. Add auto-publish candidate mode that only creates a dry-run payload.
8. Consider true auto-publish only after validation, source coverage, audit logging, and rollback/reissue rules are tested.

## Guardrails

- Crawled or generated content must never silently overwrite market data.
- Yahoo/external values remain reference data unless an audited overwrite flow is explicitly built.
- AI output must show sources and confidence before it is used in final comments.
- Any autonomous publish path must call dry-run first and write an audit row.
- If validation is `fail`, automation can draft an explanation but should not publish.

## Next Implementation Hooks

- Add a provider-backed implementation behind `src/daily_report/ai/llm_provider.mjs`.
- Add crawler jobs that write normalized JSON or Supabase rows using `src/daily_report/research/`.
- Apply and use `db/research_items.sql` when source review needs shared persistence beyond local JSON.
- Add source-to-draft citation controls and provider-backed source trace display.

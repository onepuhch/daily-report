# AI Context Contract

Last updated: 2026-05-23

## Purpose

Daily Report AI features must not be tied to one model vendor. Admin, public report V2, future crawlers, and future autonomous publishing should pass the same structured context into an AI provider adapter.

Current implementation is a rule-based, report-grounded MVP. The final target still includes provider-backed LLM answers, RAG/news/Telegram context, AI draft comments, and optional automation modes after human-review safety gates are proven.

## Provider Policy

- Use an adapter boundary: `llmProvider.generateAnswer(context, messages)`.
- Current code entry point: `src/daily_report/ai/llm_provider.mjs`.
- Current fallback provider: `src/daily_report/ai/rule_based_provider.mjs`.
- The first provider candidate remains Qwen because Qwen-Agent supports function calling, RAG, and MCP-style tool use.
- DeepSeek can be evaluated as a reasoning/API compatibility candidate.
- OpenAI-compatible adapters can be added behind the same interface if needed.
- Any model answer used for a report comment or publication decision must return `sources`, `confidence`, and an explanation trace suitable for operator review.
- No provider should directly mutate Supabase. Mutations must stay behind existing server APIs and dry-run/publish guards.

## Context Payload

Every AI surface should use this payload shape as the stable contract:

```json
{
  "report_date": "2026-05-21",
  "surface": "admin|public_report|public_report_v2|automation",
  "mode": "manual_review|assisted_draft|auto_publish_candidate|auto_publish",
  "selected_metric": {
    "metric_key": "kospi",
    "metric_name": "KOSPI",
    "category": "domestic_equities_fx",
    "category_label": "국내 주식·환율",
    "value": 7815.6,
    "unit": "pt",
    "change_1d": 8.42,
    "change_1d_unit": "%",
    "change_ytd": 12.3,
    "change_ytd_unit": "%"
  },
  "report_comment": {
    "status": "draft",
    "final_comment": "",
    "auto_comment": "",
    "reference_note": ""
  },
  "validation": [
    {
      "metric_key": "kospi",
      "source": "Yahoo Finance",
      "symbol": "^KS11",
      "db_value": 7815.6,
      "external_value": 7810.2,
      "status": "match|mismatch|external_error|db_missing|approved",
      "url": "https://finance.yahoo.com/quote/%5EKS11"
    }
  ],
  "history": [
    {
      "report_date": "2026-05-20",
      "value": 7760.2,
      "change_1d": 0.4,
      "change_ytd": 11.8
    }
  ],
  "research_items": [
    {
      "source_type": "google_news|telegram|manual_note|historical_comment|bond_market_note",
      "title": "기사 또는 메시지 제목",
      "url": "https://example.com",
      "published_at": "2026-05-21T07:30:00+09:00",
      "author": "optional source or channel",
      "text": "요약 또는 원문 일부",
      "relevance": "low|medium|high"
    }
  ],
  "automation_state": {
    "job_run_id": "uuid-or-null",
    "latest_validation_status": "pass|warn|fail",
    "publish_dry_run_available": true,
    "requires_human_approval": true
  }
}
```

Current `/report-v2` already sends the selected report date, `surface: public_report_v2`, report comment, validation context, and empty `research_items`. That is intentional future wiring: crawlers can later populate the same field without changing the UI contract.

## Answer Shape

AI providers should return:

```json
{
  "answer": "질문에 대한 한국어 답변",
  "confidence": "low|medium|high",
  "sources": [
    {
      "label": "Yahoo Finance ^KS11",
      "url": "https://finance.yahoo.com/quote/%5EKS11",
      "source_type": "market_data"
    }
  ],
  "blocks": [
    {
      "type": "text|table|chart",
      "content": "optional rendered text"
    }
  ],
  "followups": [
    "최근 5거래일 흐름을 볼까요?"
  ],
  "safety": {
    "uses_only_available_context": true,
    "needs_operator_review": true
  }
}
```

## Automation Modes

- `manual_review`: current default. Operator edits and publishes.
- `assisted_draft`: AI drafts final comments from market data, validation, and research items. Operator must approve.
- `auto_publish_candidate`: AI prepares a publish-ready payload and runs server dry-run. Operator still approves final mutation.
- `auto_publish`: future mode only. Requires explicit configuration, successful validation, available sources, confidence threshold, audit log, and rollback/reissue procedure.

## Current Status

- `/api/ask` now calls the provider adapter boundary and currently resolves to the rule-based fallback.
- `/api/ai/provider` exposes the active/requested provider state for smoke tests and Admin diagnostics.
- `/api/research/{date}` reads normalized local research items from `data/research/research_{date}.json` when present.
- `/api/comments/{date}/ai-draft` creates a non-mutating AI-assisted draft through the same provider boundary.
- `src/daily_report/research/research_items.mjs` normalizes future Google/news/Telegram/manual-note items into the shared AI context shape.
- `db/research_items.sql` defines the future Supabase storage table but has not been applied automatically.
- Admin comment workflow now shows source review state, provider status, and separate number-based vs AI-assisted draft buttons.
- `/api/comments/{date}/draft` can create a non-empty draft without mutating publication state.
- `/api/supabase/reports/{date}` supports `dry_run: true`, which is the safety hook future autonomous flows must use before any real write.
- Provider-backed LLM/RAG/news/Telegram crawling are not removed from scope. They are not blockers for the current visual review gate, but they remain part of the final product direction.

-- Research items for AI-assisted daily report review.
-- Apply after db/schema.sql when the Admin review flow starts storing
-- news, Telegram notes, manual notes, or historical-comment snippets.

create table if not exists public.research_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  report_date date not null,
  source_type text not null
    check (source_type in (
      'google_news',
      'telegram',
      'manual_note',
      'historical_comment',
      'bond_market_note',
      'market_data_note'
    )),
  title text not null,
  url text,
  published_at timestamptz,
  author text,
  text text,
  relevance text not null default 'medium'
    check (relevance in ('low', 'medium', 'high')),
  included boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_items_report_date
  on public.research_items(report_date desc);

create index if not exists idx_research_items_report_id
  on public.research_items(report_id);

create index if not exists idx_research_items_source_type
  on public.research_items(source_type);

create index if not exists idx_research_items_metadata
  on public.research_items using gin(metadata);

drop trigger if exists set_research_items_updated_at on public.research_items;
create trigger set_research_items_updated_at
before update on public.research_items
for each row execute function public.set_updated_at();

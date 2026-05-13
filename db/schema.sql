-- Daily Market Report Automation
-- Supabase PostgreSQL + pgvector schema

create extension if not exists vector;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'archived')),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.market_observations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  observed_date date not null,
  category text not null,
  metric_key text not null,
  metric_name text not null,
  value numeric,
  unit text,
  change_1d numeric,
  change_1d_unit text,
  change_ytd numeric,
  change_ytd_unit text,
  source text not null default 'infomax',
  source_sheet text,
  source_cell text,
  raw_value text,
  created_at timestamptz not null default now(),
  unique (report_id, metric_key)
);

create table if not exists public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  auto_comment text,
  final_comment text,
  reference_note text,
  tags text[] not null default '{}',
  approved_by text,
  approved_at timestamptz,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('historical_jpg', 'telegram_note', 'manual_note', 'other')),
  source_date date,
  title text,
  file_path text,
  extracted_text text,
  summary text,
  tags text[] not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_report_date
  on public.reports(report_date desc);

create index if not exists idx_market_observations_metric_date
  on public.market_observations(metric_key, observed_date desc);

create index if not exists idx_market_observations_category
  on public.market_observations(category);

create index if not exists idx_report_comments_tags
  on public.report_comments using gin(tags);

create index if not exists idx_source_documents_tags
  on public.source_documents using gin(tags);

-- Vector indexes should be created after enough rows are inserted.
-- Example:
-- create index on public.report_comments using ivfflat (embedding vector_cosine_ops) with (lists = 100);
-- create index on public.source_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

drop trigger if exists set_report_comments_updated_at on public.report_comments;
create trigger set_report_comments_updated_at
before update on public.report_comments
for each row execute function public.set_updated_at();


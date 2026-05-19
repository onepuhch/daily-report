-- Optional approval history for validation mismatches.
-- Run this in Supabase SQL Editor once before using the Admin approval button.

create table if not exists public.validation_approvals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  metric_key text not null,
  metric_name text,
  source text not null default 'Yahoo Finance',
  symbol text,
  db_value numeric,
  external_value numeric,
  reason text,
  approved_by text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (report_id, metric_key, source)
);

create index if not exists idx_validation_approvals_report
  on public.validation_approvals(report_id, approved_at desc);

grant select, insert, update, delete on public.validation_approvals to service_role;
grant select on public.validation_approvals to anon, authenticated;

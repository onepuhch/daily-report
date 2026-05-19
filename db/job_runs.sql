-- Optional operational log table for scheduled automation.
-- Run this in Supabase SQL Editor once to start recording daily job outcomes.

create table if not exists public.job_runs (
  id uuid primary key,
  job_name text not null,
  status text not null
    check (status in ('started', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report_from date,
  report_until date,
  uploaded_reports integer,
  uploaded_observations integer,
  message text,
  log_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_runs_started_at
  on public.job_runs(started_at desc);

create index if not exists idx_job_runs_status
  on public.job_runs(status);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_job_runs_updated_at on public.job_runs;
create trigger set_job_runs_updated_at
before update on public.job_runs
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.job_runs to service_role;
grant select on public.job_runs to anon, authenticated;

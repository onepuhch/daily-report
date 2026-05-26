-- Comment versioning and generic approval audit log.
-- Apply after db/schema.sql. Existing report_comments and validation_approvals
-- remain the current-state tables; these tables store history.

create table if not exists public.comment_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  report_date date not null,
  event_type text not null default 'admin_save'
    check (event_type in ('local_save', 'admin_save', 'ai_draft', 'comment_reviewed', 'report_published')),
  auto_comment text,
  final_comment text,
  reference_note text,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'archived')),
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_comment_versions_report
  on public.comment_versions(report_id, created_at desc);

create index if not exists idx_comment_versions_report_date
  on public.comment_versions(report_date desc, created_at desc);

create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  report_date date not null,
  event_type text not null,
  target_type text not null,
  target_key text,
  status_from text,
  status_to text,
  approved_by text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_approval_events_report
  on public.approval_events(report_id, created_at desc);

create index if not exists idx_approval_events_report_date
  on public.approval_events(report_date desc, created_at desc);

create index if not exists idx_approval_events_target
  on public.approval_events(target_type, target_key);

grant select, insert, update, delete on public.comment_versions to service_role;
grant select, insert, update, delete on public.approval_events to service_role;
grant select on public.comment_versions to anon, authenticated;
grant select on public.approval_events to anon, authenticated;

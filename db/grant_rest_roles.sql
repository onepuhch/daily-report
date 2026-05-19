-- Grant REST API roles access to existing public tables.
-- Run this once in Supabase SQL Editor if REST calls return:
-- permission denied for table reports

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant select on tables to anon, authenticated;

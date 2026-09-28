-- M5 · private bucket for the weekly JSON backup (Supabase free tier has no restorable backups).
-- No storage policies: only the server's secret key (service_role) can read or write it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

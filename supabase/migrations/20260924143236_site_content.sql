-- Editable storefront content (logo, hero slides, contact details, page copy).
-- Public read; writes only by users listed in store_admins.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_store_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_admins where user_id = (select auth.uid()));
$$;
revoke execute on function private.is_store_admin() from public, anon;
grant execute on function private.is_store_admin() to authenticated;

create table if not exists public.site_content (
  key text primary key check (key ~ '^[a-z0-9_.-]{1,80}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;
create policy "site content is public" on public.site_content
  for select to anon, authenticated using (true);
create policy "admins insert site content" on public.site_content
  for insert to authenticated with check ((select private.is_store_admin()));
create policy "admins update site content" on public.site_content
  for update to authenticated using ((select private.is_store_admin())) with check ((select private.is_store_admin()));
create policy "admins delete site content" on public.site_content
  for delete to authenticated using ((select private.is_store_admin()));
create trigger site_content_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload site media" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-media' and (select private.is_store_admin()));
create policy "admins update site media" on storage.objects
  for update to authenticated using (bucket_id = 'site-media' and (select private.is_store_admin()));
create policy "admins delete site media" on storage.objects
  for delete to authenticated using (bucket_id = 'site-media' and (select private.is_store_admin()));

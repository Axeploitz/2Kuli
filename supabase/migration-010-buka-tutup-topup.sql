-- =====================================================================
-- Migrasi 010: Buka / tutup tiket topup dari website
--   app_settings menyimpan status layanan (dibaca bot Discord secara realtime).
-- Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table public.app_settings enable row level security;

drop policy if exists "owner select" on public.app_settings;
drop policy if exists "owner insert" on public.app_settings;
drop policy if exists "owner update" on public.app_settings;
create policy "owner select" on public.app_settings for select to authenticated using (public.is_owner());
create policy "owner insert" on public.app_settings for insert to authenticated with check (public.is_owner());
create policy "owner update" on public.app_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

create or replace function public.stamp_setting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end; $$;
drop trigger if exists app_settings_stamp on public.app_settings;
create trigger app_settings_stamp before insert or update on public.app_settings
for each row execute function public.stamp_setting();

-- Default: topup buka
insert into public.app_settings (key, value) values ('topup_open', 'true'::jsonb)
on conflict (key) do nothing;

-- Realtime supaya bot langsung tahu
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings') then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

notify pgrst, 'reload schema';

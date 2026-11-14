-- =====================================================================
-- Migrasi 004: Update / pengumuman untuk halaman landing
-- Jalankan di Supabase: SQL Editor > New query > paste semua > Run
-- Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.site_updates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  body         text not null check (char_length(body) between 1 and 5000),
  tag          text not null default 'Update',          -- Update | Event | Info | Pengumuman
  experience   text,                                    -- nama experience (opsional)
  image_path   text,                                    -- file di bucket update-images (opsional)
  published    boolean not null default true,           -- false = draf, tidak tampil di website
  pinned       boolean not null default false,          -- disematkan paling atas
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists site_updates_list_idx on public.site_updates (published, pinned desc, created_at desc);

drop trigger if exists site_updates_touch on public.site_updates;
create trigger site_updates_touch before update on public.site_updates
for each row execute function public.touch_updated_at();

-- Pembuat diisi otomatis dari akun yang login dan tidak bisa diubah
create or replace function public.stamp_update_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid();
  else new.created_by := old.created_by; end if;
  return new;
end; $$;
drop trigger if exists site_updates_stamp on public.site_updates;
create trigger site_updates_stamp before insert or update on public.site_updates
for each row execute function public.stamp_update_creator();

alter table public.site_updates enable row level security;

drop policy if exists "public read published" on public.site_updates;
drop policy if exists "owner insert" on public.site_updates;
drop policy if exists "owner update" on public.site_updates;
drop policy if exists "owner delete" on public.site_updates;

-- Pengunjung hanya bisa membaca update yang sudah tayang; owner bisa lihat semua (termasuk draf)
create policy "public read published" on public.site_updates for select to anon, authenticated
  using (published or public.is_owner());
create policy "owner insert" on public.site_updates for insert to authenticated with check (public.is_owner());
create policy "owner update" on public.site_updates for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner delete" on public.site_updates for delete to authenticated using (public.is_owner());

-- Bucket PUBLIC untuk gambar update (maks 5 MB, hanya gambar)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('update-images', 'update-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner upload update-images" on storage.objects;
drop policy if exists "owner update update-images" on storage.objects;
drop policy if exists "owner delete update-images" on storage.objects;
create policy "owner upload update-images" on storage.objects for insert to authenticated with check (bucket_id = 'update-images' and public.is_owner());
create policy "owner update update-images" on storage.objects for update to authenticated using (bucket_id = 'update-images' and public.is_owner());
create policy "owner delete update-images" on storage.objects for delete to authenticated using (bucket_id = 'update-images' and public.is_owner());

notify pgrst, 'reload schema';

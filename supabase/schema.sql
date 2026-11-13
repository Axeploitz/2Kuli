-- =====================================================================
-- duakuli: tabel transaksi Robux + storage bukti transfer
-- Jalankan di Supabase: SQL Editor > New query > paste semua > Run
-- Aman dijalankan ulang.
-- =====================================================================

-- 1) Daftar email yang boleh masuk dashboard (allowlist owner)
create table if not exists public.owners (
  email text primary key
);
alter table public.owners enable row level security;
-- (sengaja tanpa policy: tabel ini tidak bisa dibaca/diubah dari website)

-- GANTI email di bawah dengan email akun owner kamu (boleh lebih dari satu baris)
insert into public.owners (email) values ('lauser.dewa@gmail.com'), ('kuliprojectstudio@gmail.com')
on conflict do nothing;

-- Fungsi cek: apakah user yang login terdaftar sebagai owner?
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_owner() to authenticated;

-- 2) Tabel transaksi
create table if not exists public.robux_transactions (
  id              uuid primary key default gen_random_uuid(),
  purchase_date   date not null default current_date,
  buyer_username  text not null check (char_length(buyer_username) between 1 and 60),
  buyer_user_id   bigint,          -- ID akun Roblox buyer
  buyer_display_name text,         -- display name Roblox saat transaksi dicatat
  amount          numeric(14,0) not null check (amount >= 0),
  robux           integer not null check (robux > 0),
  proof_path      text,
  notes           text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.robux_transactions add column if not exists buyer_user_id bigint;
alter table public.robux_transactions add column if not exists buyer_display_name text;
create index if not exists robux_tx_buyer_idx on public.robux_transactions (buyer_user_id);

create index if not exists robux_tx_date_idx on public.robux_transactions (purchase_date desc, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists robux_tx_touch on public.robux_transactions;
create trigger robux_tx_touch before update on public.robux_transactions
for each row execute function public.touch_updated_at();

alter table public.robux_transactions enable row level security;

drop policy if exists "owner select" on public.robux_transactions;
drop policy if exists "owner insert" on public.robux_transactions;
drop policy if exists "owner update" on public.robux_transactions;
drop policy if exists "owner delete" on public.robux_transactions;

create policy "owner select" on public.robux_transactions for select to authenticated using (public.is_owner());
create policy "owner insert" on public.robux_transactions for insert to authenticated with check (public.is_owner());
create policy "owner update" on public.robux_transactions for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner delete" on public.robux_transactions for delete to authenticated using (public.is_owner());

-- 3) Storage bucket PRIVATE untuk foto bukti (maks 5 MB per file, hanya gambar)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti', 'bukti', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner read bukti"   on storage.objects;
drop policy if exists "owner upload bukti" on storage.objects;
drop policy if exists "owner update bukti" on storage.objects;
drop policy if exists "owner delete bukti" on storage.objects;

create policy "owner read bukti"   on storage.objects for select to authenticated using (bucket_id = 'bukti' and public.is_owner());
create policy "owner upload bukti" on storage.objects for insert to authenticated with check (bucket_id = 'bukti' and public.is_owner());
create policy "owner update bukti" on storage.objects for update to authenticated using (bucket_id = 'bukti' and public.is_owner());
create policy "owner delete bukti" on storage.objects for delete to authenticated using (bucket_id = 'bukti' and public.is_owner());

-- =====================================================================
-- Migrasi 003: nama owner, pencatat transaksi, dan Saldo bagi 2
-- Jalankan di Supabase: SQL Editor > New query > paste semua > Run
-- Aman dijalankan ulang.
-- =====================================================================

-- 1) Nama tampilan untuk tiap owner
alter table public.owners add column if not exists name text;

insert into public.owners (email, name) values
  ('lauser.dewa@gmail.com', 'JustAxe'),
  ('akmalfatizky@gmail.com', 'Thalvior')
on conflict (email) do update set name = excluded.name;

-- Daftar akun owner, diambil langsung dari user Supabase (Authentication > Users).
-- Nama: kolom owners.name, kalau kosong pakai Display name user di Supabase, kalau kosong pakai awal email.
-- Hanya bisa dibaca oleh owner yang login.
drop function if exists public.owner_directory();
create or replace function public.owner_directory()
returns table (id uuid, email text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         u.email::text,
         coalesce(o.name,
                  u.raw_user_meta_data ->> 'display_name',
                  u.raw_user_meta_data ->> 'full_name',
                  u.raw_user_meta_data ->> 'name',
                  split_part(u.email, '@', 1))
  from auth.users u
  join public.owners o on lower(o.email) = lower(u.email)
  where public.is_owner();
$$;
grant execute on function public.owner_directory() to authenticated;

-- 2) Catat siapa yang membuat transaksi (otomatis dari akun yang login)
alter table public.robux_transactions add column if not exists created_by_email text;

-- Isi data lama dari akun pembuatnya
update public.robux_transactions t
set created_by_email = u.email
from auth.users u
where t.created_by = u.id and t.created_by_email is null;

create or replace function public.stamp_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
  else
    -- Pencatat tidak bisa diubah lewat edit
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
  end if;
  return new;
end; $$;

drop trigger if exists robux_tx_stamp on public.robux_transactions;
create trigger robux_tx_stamp before insert or update on public.robux_transactions
for each row execute function public.stamp_creator();

-- 3) Riwayat pembagian saldo (bagi 2)
create table if not exists public.saldo_splits (
  id               uuid primary key default gen_random_uuid(),
  amount           numeric(14,0) not null check (amount > 0),  -- total yang dibagi
  share            numeric(14,0) not null check (share > 0),   -- bagian tiap owner
  created_by       uuid default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now()
);
alter table public.saldo_splits enable row level security;

drop policy if exists "owner select" on public.saldo_splits;
drop policy if exists "owner delete" on public.saldo_splits;
create policy "owner select" on public.saldo_splits for select to authenticated using (public.is_owner());
create policy "owner delete" on public.saldo_splits for delete to authenticated using (public.is_owner());
-- (insert hanya lewat fungsi split_saldo di bawah, supaya angkanya selalu benar)

-- Bagi 2 saldo saat ini. Dihitung di server: saldo = total transaksi - yang sudah dibagi.
-- Kalau saldo ganjil, sisa Rp1 tetap di saldo.
create or replace function public.split_saldo()
returns public.saldo_splits
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  half numeric;
  result public.saldo_splits;
begin
  if not public.is_owner() then
    raise exception 'Bukan owner';
  end if;
  perform pg_advisory_xact_lock(hashtext('split_saldo'));
  select coalesce((select sum(amount) from public.robux_transactions), 0)
       - coalesce((select sum(amount) from public.saldo_splits), 0)
  into bal;
  half := floor(bal / 2);
  if half <= 0 then
    raise exception 'Saldo kosong, tidak ada yang bisa dibagi';
  end if;
  insert into public.saldo_splits (amount, share) values (half * 2, half) returning * into result;
  return result;
end; $$;
grant execute on function public.split_saldo() to authenticated;

notify pgrst, 'reload schema';

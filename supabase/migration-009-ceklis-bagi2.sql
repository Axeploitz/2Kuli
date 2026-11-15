-- =====================================================================
-- Migrasi 009: Ceklis "sudah diterima" untuk setiap Bagi 2
--   - Tiap owner (JustAxe / Thalvior) menceklis bagiannya sendiri.
--   - Hanya akun dengan email owner tersebut yang bisa menceklis bagiannya.
--   - Bagi 2 berikutnya baru bisa dilakukan setelah Bagi 2 sebelumnya
--     diceklis oleh kedua owner.
-- Jalankan SETELAH migration-003. Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.saldo_split_acks (
  split_id   uuid not null references public.saldo_splits(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  email      text not null default (auth.jwt() ->> 'email'),
  acked_at   timestamptz not null default now(),
  primary key (split_id, user_id)
);
alter table public.saldo_split_acks enable row level security;

-- Owner yang ikut bagi 2 = owner yang punya nama (JustAxe, Thalvior)
create or replace function public.is_split_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and name is not null
  );
$$;
grant execute on function public.is_split_owner() to authenticated;

drop policy if exists "owner select" on public.saldo_split_acks;
drop policy if exists "self ack" on public.saldo_split_acks;
drop policy if exists "self unack" on public.saldo_split_acks;
create policy "owner select" on public.saldo_split_acks for select to authenticated using (public.is_owner());
-- Hanya bisa menceklis atas nama akunnya sendiri
create policy "self ack" on public.saldo_split_acks for insert to authenticated
  with check (public.is_split_owner() and user_id = auth.uid() and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "self unack" on public.saldo_split_acks for delete to authenticated
  using (user_id = auth.uid());

-- Bagi 2 yang sudah diceklis tidak bisa dibatalkan
drop policy if exists "owner delete" on public.saldo_splits;
create policy "owner delete" on public.saldo_splits for delete to authenticated
  using (public.is_owner() and not exists (select 1 from public.saldo_split_acks a where a.split_id = saldo_splits.id));

-- Bagi 2: saldo dihitung di server + syarat ceklis bagi 2 sebelumnya
create or replace function public.split_saldo()
returns public.saldo_splits
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  half numeric;
  last_id uuid;
  need int;
  got int;
  result public.saldo_splits;
begin
  if not public.is_owner() then
    raise exception 'Bukan owner';
  end if;
  perform pg_advisory_xact_lock(hashtext('split_saldo'));

  select id into last_id from public.saldo_splits order by created_at desc limit 1;
  if last_id is not null then
    select count(*) into need from public.owners where name is not null;
    select count(distinct lower(a.email)) into got
      from public.saldo_split_acks a
      join public.owners o on lower(o.email) = lower(a.email) and o.name is not null
      where a.split_id = last_id;
    if got < need then
      raise exception 'Bagi 2 sebelumnya belum diceklis oleh kedua owner';
    end if;
  end if;

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

-- Realtime: ceklis & bagi 2 owner lain langsung terlihat
do $$
declare t text;
begin
  foreach t in array array['saldo_splits', 'saldo_split_acks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

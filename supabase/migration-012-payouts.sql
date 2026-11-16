-- =====================================================================
-- Migrasi 012: Log payout Robux (pengeluaran dari group funds)
--   - Otomatis: transaksi "Via Payouts" yang dicentang Diproses → tercatat di payout_logs
--     (dicentang ulang/batal → log otomatisnya ikut hilang).
--   - Manual: owner bisa menambah payout di luar tiket (hadiah event, dll).
-- Jalankan SETELAH migration-007. Aman dijalankan ulang.
-- =====================================================================

-- Metode topup di transaksi: 'payout' (default) | 'username'
alter table public.robux_transactions add column if not exists via text not null default 'payout';
update public.robux_transactions set via = 'username' where notes ilike 'Via Username%' and via <> 'username';

create table if not exists public.payout_logs (
  id                   uuid primary key default gen_random_uuid(),
  paid_at              timestamptz not null default now(),
  roblox_user_id       bigint,
  roblox_username      text not null check (char_length(roblox_username) between 1 and 60),
  roblox_display_name  text,
  robux                integer not null check (robux > 0),
  notes                text,
  source               text not null default 'manual' check (source in ('auto', 'manual')),
  transaction_id       uuid references public.robux_transactions(id) on delete set null,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists payout_logs_tx_uidx on public.payout_logs (transaction_id) where transaction_id is not null;
create index if not exists payout_logs_paid_idx on public.payout_logs (paid_at desc);

drop trigger if exists payout_logs_touch on public.payout_logs;
create trigger payout_logs_touch before update on public.payout_logs
for each row execute function public.touch_updated_at();

alter table public.payout_logs enable row level security;
drop policy if exists "owner select" on public.payout_logs;
drop policy if exists "owner insert" on public.payout_logs;
drop policy if exists "owner update" on public.payout_logs;
drop policy if exists "owner delete" on public.payout_logs;
create policy "owner select" on public.payout_logs for select to authenticated using (public.is_owner());
create policy "owner insert" on public.payout_logs for insert to authenticated with check (public.is_owner() and source = 'manual');
-- Log otomatis dikelola dari transaksi (ceklis Diproses); hanya log manual yang bisa diubah/dihapus
create policy "owner update" on public.payout_logs for update to authenticated using (public.is_owner() and source = 'manual') with check (public.is_owner() and source = 'manual');
create policy "owner delete" on public.payout_logs for delete to authenticated using (public.is_owner() and source = 'manual');

-- Sinkron otomatis dari ceklis "Diproses" transaksi Via Payouts
create or replace function public.sync_payout_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.via = 'payout' and new.processed then
    insert into public.payout_logs (transaction_id, roblox_user_id, roblox_username, roblox_display_name, robux, paid_at, created_by, source, notes)
    values (new.id, new.buyer_user_id, new.buyer_username, new.buyer_display_name, new.robux,
            coalesce(new.processed_at, now()), new.processed_by, 'auto', 'Dari transaksi')
    on conflict (transaction_id) where transaction_id is not null do update
      set robux = excluded.robux,
          roblox_user_id = excluded.roblox_user_id,
          roblox_username = excluded.roblox_username,
          roblox_display_name = excluded.roblox_display_name,
          paid_at = excluded.paid_at,
          created_by = excluded.created_by;
  else
    delete from public.payout_logs where transaction_id = new.id and source = 'auto';
  end if;
  return new;
end; $$;

drop trigger if exists robux_tx_payout_log on public.robux_transactions;
create trigger robux_tx_payout_log after insert or update of processed, processed_at, processed_by, robux, via, buyer_username, buyer_user_id
on public.robux_transactions
for each row execute function public.sync_payout_log();

-- Isi log dari transaksi Via Payouts yang sudah diproses sebelumnya
insert into public.payout_logs (transaction_id, roblox_user_id, roblox_username, roblox_display_name, robux, paid_at, created_by, source, notes)
select t.id, t.buyer_user_id, t.buyer_username, t.buyer_display_name, t.robux,
       coalesce(t.processed_at, t.updated_at), t.processed_by, 'auto', 'Dari transaksi'
from public.robux_transactions t
where t.processed and t.via = 'payout'
on conflict (transaction_id) where transaction_id is not null do nothing;

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payout_logs') then
    alter publication supabase_realtime add table public.payout_logs;
  end if;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migrasi 014: Dua stock Robux
--   pool 'payout'   = Stock Group (Group Funds, untuk topup Via Payouts)
--   pool 'username' = Stock Username (akun Premium, untuk topup Via Username)
--   Transaksi yang dicentang Diproses memotong stock sesuai metodenya (kolom via).
-- Jalankan SETELAH migration-012 dan migration-013. Aman dijalankan ulang.
-- =====================================================================

alter table public.payout_logs add column if not exists pool text not null default 'payout';
alter table public.stock_adjustments add column if not exists pool text not null default 'payout';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payout_logs_pool_check') then
    alter table public.payout_logs add constraint payout_logs_pool_check check (pool in ('payout', 'username'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_adjustments_pool_check') then
    alter table public.stock_adjustments add constraint stock_adjustments_pool_check check (pool in ('payout', 'username'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'robux_tx_via_check') then
    alter table public.robux_transactions add constraint robux_tx_via_check check (via in ('payout', 'username'));
  end if;
end $$;

-- Ceklis Diproses → catat pengiriman Robux di stock sesuai metode transaksi
create or replace function public.sync_payout_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.processed then
    insert into public.payout_logs (transaction_id, roblox_user_id, roblox_username, roblox_display_name, robux, paid_at, created_by, source, notes, pool)
    values (new.id, new.buyer_user_id, new.buyer_username, new.buyer_display_name, new.robux,
            coalesce(new.processed_at, now()), new.processed_by, 'auto', 'Dari transaksi', coalesce(new.via, 'payout'))
    on conflict (transaction_id) where transaction_id is not null do update
      set robux = excluded.robux,
          roblox_user_id = excluded.roblox_user_id,
          roblox_username = excluded.roblox_username,
          roblox_display_name = excluded.roblox_display_name,
          paid_at = excluded.paid_at,
          created_by = excluded.created_by,
          pool = excluded.pool;
  else
    delete from public.payout_logs where transaction_id = new.id and source = 'auto';
  end if;
  return new;
end; $$;

-- Samakan log lama dengan metode transaksinya + isi transaksi Via Username yang sudah diproses
update public.payout_logs l set pool = t.via
from public.robux_transactions t
where l.transaction_id = t.id and l.source = 'auto' and l.pool <> t.via;

insert into public.payout_logs (transaction_id, roblox_user_id, roblox_username, roblox_display_name, robux, paid_at, created_by, source, notes, pool)
select t.id, t.buyer_user_id, t.buyer_username, t.buyer_display_name, t.robux,
       coalesce(t.processed_at, t.updated_at), t.processed_by, 'auto', 'Dari transaksi', t.via
from public.robux_transactions t
where t.processed
on conflict (transaction_id) where transaction_id is not null do nothing;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migrasi 013: Stock Robux (Group Funds)
--   Penyesuaian manual stock:
--     set      = samakan stock dengan angka di Roblox
--     add      = tambah stock (mis. group funds diisi ulang)
--     subtract = potong manual (pengeluaran tanpa penerima tertentu)
--   Payout (payout_logs, otomatis dari transaksi / manual) ikut memotong stock.
-- Jalankan SETELAH migration-012. Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('set', 'add', 'subtract')),
  robux       integer not null check (robux >= 0),
  notes       text,
  happened_at timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists stock_adjustments_time_idx on public.stock_adjustments (happened_at desc);

alter table public.stock_adjustments enable row level security;
drop policy if exists "owner select" on public.stock_adjustments;
drop policy if exists "owner insert" on public.stock_adjustments;
drop policy if exists "owner delete" on public.stock_adjustments;
create policy "owner select" on public.stock_adjustments for select to authenticated using (public.is_owner());
create policy "owner insert" on public.stock_adjustments for insert to authenticated with check (public.is_owner());
create policy "owner delete" on public.stock_adjustments for delete to authenticated using (public.is_owner());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_adjustments') then
    alter publication supabase_realtime add table public.stock_adjustments;
  end if;
end $$;

notify pgrst, 'reload schema';

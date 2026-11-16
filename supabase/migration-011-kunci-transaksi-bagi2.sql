-- =====================================================================
-- Migrasi 011: Transaksi yang sudah ikut Bagi 2 tidak bisa dihapus
--   Transaksi dianggap sudah ikut dibagi kalau dibuat sebelum Bagi 2 terakhir.
--   Menghapusnya membuat saldo minus, jadi diblokir. Salah catat → pakai Edit.
-- Aman dijalankan ulang.
-- =====================================================================

create or replace function public.tx_in_split(tx_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.saldo_splits where created_at >= tx_created_at);
$$;
grant execute on function public.tx_in_split(timestamptz) to authenticated;

drop policy if exists "owner delete" on public.robux_transactions;
create policy "owner delete" on public.robux_transactions for delete to authenticated
  using (public.is_owner() and not public.tx_in_split(created_at));

notify pgrst, 'reload schema';

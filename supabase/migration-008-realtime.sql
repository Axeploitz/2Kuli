-- =====================================================================
-- Migrasi 008: Realtime untuk tabel transaksi
--   Supaya perubahan langsung terkirim ke bot Discord (tombol Proses
--   berubah sendiri) dan ke dashboard website (data muncul tanpa refresh).
-- Aman dijalankan ulang.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'robux_transactions'
  ) then
    alter publication supabase_realtime add table public.robux_transactions;
  end if;
end $$;

-- Migrasi 002: simpan identitas Roblox buyer (ID + display name)
-- Jalankan sekali di Supabase: SQL Editor > New query > paste > Run. Aman dijalankan ulang.

alter table public.robux_transactions add column if not exists buyer_user_id bigint;
alter table public.robux_transactions add column if not exists buyer_display_name text;

create index if not exists robux_tx_buyer_idx on public.robux_transactions (buyer_user_id);

-- Supaya API Supabase langsung mengenali kolom baru
notify pgrst, 'reload schema';

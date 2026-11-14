-- =====================================================================
-- Migrasi 005: Ceklis status transaksi
--   - "Uang masuk"  : validasi uang sudah masuk rekening (HANYA Thalvior)
--   - "Diproses"    : transaksi sudah diproses (semua owner)
-- Jalankan di Supabase: SQL Editor > New query > paste semua > Run
-- Aman dijalankan ulang.
-- =====================================================================

-- Siapa yang boleh validasi uang masuk
alter table public.owners add column if not exists can_verify_payment boolean not null default false;
update public.owners set can_verify_payment = (lower(email) = 'akmalfatizky@gmail.com');

create or replace function public.can_verify_payment()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and can_verify_payment
  );
$$;
grant execute on function public.can_verify_payment() to authenticated;

-- Kolom status
alter table public.robux_transactions add column if not exists payment_verified    boolean not null default false;
alter table public.robux_transactions add column if not exists payment_verified_at timestamptz;
alter table public.robux_transactions add column if not exists payment_verified_by uuid;
alter table public.robux_transactions add column if not exists processed           boolean not null default false;
alter table public.robux_transactions add column if not exists processed_at        timestamptz;
alter table public.robux_transactions add column if not exists processed_by        uuid;

-- Aturan dijaga di database (tidak bisa diakali dari browser)
create or replace function public.guard_tx_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.payment_verified and not public.can_verify_payment() then
      new.payment_verified := false;
    end if;
    new.payment_verified_at := case when new.payment_verified then now() end;
    new.payment_verified_by := case when new.payment_verified then auth.uid() end;
    new.processed_at := case when new.processed then now() end;
    new.processed_by := case when new.processed then auth.uid() end;
    return new;
  end if;

  if new.payment_verified is distinct from old.payment_verified then
    if not public.can_verify_payment() then
      raise exception 'Hanya Thalvior yang bisa memvalidasi uang masuk';
    end if;
    new.payment_verified_at := case when new.payment_verified then now() end;
    new.payment_verified_by := case when new.payment_verified then auth.uid() end;
  else
    new.payment_verified_at := old.payment_verified_at;
    new.payment_verified_by := old.payment_verified_by;
  end if;

  if new.processed is distinct from old.processed then
    new.processed_at := case when new.processed then now() end;
    new.processed_by := case when new.processed then auth.uid() end;
  else
    new.processed_at := old.processed_at;
    new.processed_by := old.processed_by;
  end if;
  return new;
end; $$;

drop trigger if exists robux_tx_status on public.robux_transactions;
create trigger robux_tx_status before insert or update on public.robux_transactions
for each row execute function public.guard_tx_status();

notify pgrst, 'reload schema';

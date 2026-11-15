-- =====================================================================
-- Migrasi 007: Transaksi otomatis dari bot Discord
--   - Bot memakai secret key (service_role) dan mengisi sendiri pencatat
--     & status "Uang masuk" (dikonfirmasi Thalvior di Discord).
--   - Kolom source_ref mencegah transaksi dari tiket yang sama tercatat dua kali.
-- Jalankan SETELAH migration-006. Aman dijalankan ulang.
-- =====================================================================

alter table public.robux_transactions add column if not exists source_ref text;
create unique index if not exists robux_tx_source_ref_uidx on public.robux_transactions (source_ref) where source_ref is not null;

-- Request dari server (secret key / service_role), bukan dari browser
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role';
$$;

create or replace function public.stamp_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_role() then
    if tg_op = 'UPDATE' then
      new.created_by := old.created_by;
      new.created_by_email := old.created_by_email;
    end if;
    return new; -- bot mengisi created_by sendiri
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
  else
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
  end if;
  return new;
end; $$;

create or replace function public.guard_tx_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bot (service_role) dipercaya: status sudah dikonfirmasi Thalvior di Discord
  if public.is_service_role() then
    return new;
  end if;

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

  -- Uang masuk: hanya Thalvior
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

  -- Diproses: siapa pun boleh mencentang, tapi hanya yang mencentang yang boleh membatalkan
  if new.processed is distinct from old.processed then
    if old.processed and old.processed_by is not null and old.processed_by is distinct from auth.uid() then
      raise exception 'Transaksi ini sudah diproses oleh owner lain. Hanya dia yang bisa membatalkannya';
    end if;
    new.processed_at := case when new.processed then now() end;
    new.processed_by := case when new.processed then auth.uid() end;
  else
    new.processed_at := old.processed_at;
    new.processed_by := old.processed_by;
  end if;
  return new;
end; $$;

notify pgrst, 'reload schema';

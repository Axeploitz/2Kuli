-- =====================================================================
-- Migrasi 006: Ceklis "Diproses" dikunci
--   Kalau sudah dicentang oleh satu owner, hanya owner itu yang bisa
--   membatalkannya. Owner lain tidak bisa mengubahnya.
-- Jalankan SETELAH migration-005. Aman dijalankan ulang.
-- =====================================================================

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

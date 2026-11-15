import { supabase } from './supabase'

function friendly(error) {
  if (/app_settings/.test(error?.message || '')) {
    return new Error('Database belum di-update. Jalankan file supabase/migration-010-buka-tutup-topup.sql di Supabase SQL Editor.')
  }
  return error
}

/** { open: boolean, updated_at, updated_by } */
export async function getTopupStatus() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('key', 'topup_open').maybeSingle()
  if (error) throw friendly(error)
  return { open: data ? data.value !== false : true, updated_at: data?.updated_at, updated_by: data?.updated_by }
}

export async function setTopupOpen(open) {
  const { error } = await supabase.from('app_settings').upsert({ key: 'topup_open', value: open })
  if (error) throw friendly(error)
}

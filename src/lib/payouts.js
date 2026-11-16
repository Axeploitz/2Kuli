import { supabase } from './supabase'

const TABLE = 'payout_logs'

function friendly(error) {
  if (/\bpool\b/.test(error?.message || '')) {
    return new Error('Database belum di-update. Jalankan file supabase/migration-014-dua-stock.sql di Supabase SQL Editor.')
  }
  if (/payout_logs/.test(error?.message || '')) {
    return new Error('Database belum di-update. Jalankan file supabase/migration-012-payouts.sql di Supabase SQL Editor.')
  }
  return error
}

export async function listPayouts() {
  const { data, error } = await supabase.from(TABLE).select('*').order('paid_at', { ascending: false })
  if (error) throw friendly(error)
  return data
}

/** values: { paid_at, roblox_user_id, roblox_username, roblox_display_name, robux, notes } */
export async function savePayout(existing, values) {
  const q = existing
    ? supabase.from(TABLE).update(values).eq('id', existing.id)
    : supabase.from(TABLE).insert({ ...values, source: 'manual' })
  const { data, error } = await q.select().single()
  if (error) throw friendly(error)
  return data
}

export async function deletePayout(row) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', row.id).select('id')
  if (error) throw friendly(error)
  if (!data?.length) throw new Error('Log otomatis dari transaksi tidak bisa dihapus di sini. Batalkan ceklis Diproses di transaksinya.')
}

// ---------- Stock Robux (Group Funds) ----------

export async function listStockAdjustments() {
  const { data, error } = await supabase.from('stock_adjustments').select('*').order('happened_at', { ascending: false })
  if (error) {
    if (/stock_adjustments/.test(error.message)) {
      throw new Error('Database belum di-update. Jalankan file supabase/migration-013-stock-robux.sql di Supabase SQL Editor.')
    }
    throw error
  }
  return data
}

export const POOLS = {
  payout: { name: 'Stock Group', sub: 'Group Funds · Via Payouts', emoji: '🏛️' },
  username: { name: 'Stock Username', sub: 'Akun Premium · Via Username', emoji: '👤' },
}

/** kind: 'set' | 'add' | 'subtract' · pool: 'payout' | 'username' */
export async function addStockAdjustment(kind, robux, notes, pool = 'payout') {
  const { error } = await supabase.from('stock_adjustments').insert({ kind, robux, notes: notes || null, pool })
  if (error) {
    if (/\bpool\b/.test(error.message)) throw new Error('Database belum di-update. Jalankan file supabase/migration-014-dua-stock.sql di Supabase SQL Editor.')
    throw error
  }
}

export async function deleteStockAdjustment(id) {
  const { error } = await supabase.from('stock_adjustments').delete().eq('id', id)
  if (error) throw error
}

/**
 * Gabungkan penyesuaian stock + payout jadi satu buku mutasi (urut waktu),
 * lalu hitung saldo setelah tiap baris. "set" mereset saldo ke angka yang diisi.
 * return { entries (terbaru dulu, dengan .balance), stock }
 */
export function buildStockLedger(adjustments, payouts, pool = null) {
  const inPool = (x) => !pool || (x.pool || 'payout') === pool
  adjustments = adjustments.filter(inPool)
  payouts = payouts.filter(inPool)
  const items = [
    ...adjustments.map((a) => ({ type: a.kind, at: a.happened_at, robux: Number(a.robux), row: a })),
    ...payouts.map((p) => ({ type: 'payout', at: p.paid_at, robux: Number(p.robux), row: p })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  let bal = 0
  for (const it of items) {
    if (it.type === 'set') bal = it.robux
    else if (it.type === 'add') bal += it.robux
    else bal -= it.robux
    it.balance = bal
  }
  return { entries: items.reverse(), stock: bal, hasBaseline: adjustments.some((a) => a.kind === 'set') }
}

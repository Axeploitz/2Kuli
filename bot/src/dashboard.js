// Simpan transaksi ke dashboard website (Supabase) dari bot.
// Memakai SECRET key (service_role) — hanya untuk server/bot, jangan pernah dipakai di website.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SECRET_KEY, DASHBOARD_RECORDER_EMAIL } = process.env
const BUCKET = 'bukti'
const MAX_PROOF_BYTES = 5 * 1024 * 1024
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }

export const dashboardEnabled = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)

const supabase = dashboardEnabled
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

// Akun dashboard (Thalvior) yang tercatat sebagai pencatat & validator uang masuk
let recorder
async function getRecorder() {
  if (recorder !== undefined) return recorder
  recorder = null
  if (!DASHBOARD_RECORDER_EMAIL) return recorder
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const u = data.users.find((x) => x.email?.toLowerCase() === DASHBOARD_RECORDER_EMAIL.toLowerCase())
    if (u) return (recorder = { id: u.id, email: u.email })
    if (data.users.length < 100) break
  }
  return recorder
}

/** Unduh foto bukti dari Discord lalu upload ke bucket private "bukti". null kalau gagal. */
async function uploadProof(url, contentType) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const type = (contentType || res.headers.get('content-type') || '').split(';')[0]
    const ext = MIME_EXT[type]
    if (!ext) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_PROOF_BYTES) return null
    const d = new Date()
    const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false })
    if (error) throw error
    return path
  } catch (e) {
    console.error('Upload bukti gagal:', e.message)
    return null
  }
}

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) // YYYY-MM-DD

/**
 * Catat transaksi yang sudah dikonfirmasi Thalvior.
 * order: { ref, robloxId, robloxName, displayName, robux, amount, notes, proof?: { url, contentType } }
 * return: { row, duplicate, proofSaved }
 */
export async function recordTransaction(order) {
  if (!dashboardEnabled) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi di .env bot')

  // Jangan catat dua kali untuk tiket yang sama
  const { data: existing } = await supabase.from('robux_transactions').select('*').eq('source_ref', order.ref).maybeSingle()
  if (existing) return { row: existing, duplicate: true, proofSaved: !!existing.proof_path }

  const who = await getRecorder()
  const proof_path = order.proof ? await uploadProof(order.proof.url, order.proof.contentType) : null
  const now = new Date().toISOString()
  const row = {
    purchase_date: todayWIB(),
    buyer_username: order.robloxName,
    buyer_user_id: order.robloxId,
    buyer_display_name: order.displayName,
    amount: order.amount,
    robux: order.robux,
    notes: order.notes,
    proof_path,
    source_ref: order.ref,
    created_by: who?.id ?? null,
    created_by_email: who?.email ?? null,
    payment_verified: true,
    payment_verified_at: now,
    payment_verified_by: who?.id ?? null,
    processed: false,
    via: order.via || 'payout',
  }
  let { data, error } = await supabase.from('robux_transactions').insert(row).select().single()
  // Migrasi 012 belum dijalankan (kolom via belum ada) → simpan tanpa kolom via
  if (error && /\bvia\b/.test(error.message)) {
    delete row.via
    ;({ data, error } = await supabase.from('robux_transactions').insert(row).select().single())
  }

  if (error) {
    if (proof_path) await supabase.storage.from(BUCKET).remove([proof_path]).catch(() => {})
    if (/source_ref|is_service_role/.test(error.message)) {
      throw new Error('Database belum di-update. Jalankan supabase/migration-007-bot-discord.sql di Supabase SQL Editor.')
    }
    throw error
  }
  return { row: data, duplicate: false, proofSaved: !!proof_path }
}

// ---------- Ceklis "Diproses" dari Discord ----------

// Discord user ID → email akun dashboard. Format env: OWNER_ACCOUNTS=discordId=email,discordId=email
const OWNER_ACCOUNTS = Object.fromEntries(
  (process.env.OWNER_ACCOUNTS || '').split(',').map((p) => p.split('=').map((s) => s.trim())).filter(([d, e]) => d && e),
)

const userCache = new Map() // email (lowercase) → { id, email, name }
async function dashboardUser(email) {
  const key = email.toLowerCase()
  if (userCache.has(key)) return userCache.get(key)
  let found = null
  for (let page = 1; page <= 10 && !found; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    found = data.users.find((x) => x.email?.toLowerCase() === key) || null
    if (data.users.length < 100) break
  }
  if (!found) return null
  const { data: owner } = await supabase.from('owners').select('name').ilike('email', key).maybeSingle()
  const u = { id: found.id, email: found.email, name: owner?.name || found.email.split('@')[0] }
  userCache.set(key, u)
  return u
}

/** Nama owner (JustAxe/Thalvior) dari ID akun dashboard */
export async function dashboardNameById(uid) {
  if (!uid) return null
  for (const u of userCache.values()) if (u.id === uid) return u.name
  const { data } = await supabase.auth.admin.getUserById(uid)
  return data?.user?.email ? (await dashboardUser(data.user.email))?.name : null
}

export async function getTransaction(id) {
  const { data, error } = await supabase.from('robux_transactions').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Tandai transaksi "Diproses" oleh owner yang klik di Discord.
 * Hanya berhasil kalau belum diproses siapa pun (yang pertama klik yang tercatat).
 * return: { ok: true, name } | { ok: false, reason, name? }
 */
export async function markProcessed(txId, discordUserId) {
  const email = OWNER_ACCOUNTS[discordUserId]
  if (!email) return { ok: false, reason: 'unmapped' }
  const me = await dashboardUser(email)
  if (!me) return { ok: false, reason: 'no-account' }

  const { data, error } = await supabase
    .from('robux_transactions')
    .update({ processed: true, processed_at: new Date().toISOString(), processed_by: me.id })
    .eq('id', txId)
    .eq('processed', false) // kunci: hanya kalau belum diproses
    .select()
  if (error) throw error
  if (data.length) return { ok: true, name: me.name }

  const tx = await getTransaction(txId)
  if (!tx) return { ok: false, reason: 'not-found' }
  return { ok: false, reason: 'already', name: (await dashboardNameById(tx.processed_by)) || 'owner lain', at: tx.processed_at }
}

// ---------- Realtime: perubahan dari website ----------

/** Panggil onUpdate(tx) setiap ada transaksi yang berubah (mis. ceklis Diproses di website). */
export function watchTransactions(onUpdate) {
  if (!dashboardEnabled) return
  supabase
    .channel('bot-robux-transactions')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'robux_transactions' }, (payload) => {
      Promise.resolve(onUpdate(payload.new)).catch((e) => console.error('Sync dashboard → Discord gagal:', e.message))
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') console.log('📡 Realtime dashboard aktif: tombol Proses ikut berubah dari website.')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('⚠️  Realtime dashboard gagal:', status, err?.message || '')
    })
}

/** Transaksi dari tiket Discord tertentu (source_ref = discord:<channelId>) */
export async function getTransactionByRef(ref) {
  if (!dashboardEnabled) return null
  const { data } = await supabase.from('robux_transactions').select('*').eq('source_ref', ref).maybeSingle()
  return data
}

// ---------- Pengaturan (buka/tutup topup, lokasi panel) ----------

export async function getSetting(key, fallback = null) {
  if (!dashboardEnabled) return fallback
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error) {
    console.warn(`Baca pengaturan ${key} gagal:`, error.message)
    return fallback
  }
  return data ? data.value : fallback
}

export async function setSetting(key, value) {
  if (!dashboardEnabled) return
  const { error } = await supabase.from('app_settings').upsert({ key, value })
  if (error) console.warn(`Simpan pengaturan ${key} gagal:`, error.message)
}

/** onChange(key, value) setiap pengaturan berubah dari website */
export function watchSettings(onChange) {
  if (!dashboardEnabled) return
  supabase
    .channel('bot-app-settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
      if (payload.new?.key) Promise.resolve(onChange(payload.new.key, payload.new.value)).catch((e) => console.error('Sync pengaturan gagal:', e.message))
    })
    .subscribe()
}

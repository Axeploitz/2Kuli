import { supabase } from './supabase'
import { compressImage } from './image'

const TABLE = 'robux_transactions'

// Pesan jelas kalau migrasi database (kolom buyer_user_id) belum dijalankan
function friendly(error) {
  if (/buyer_user_id|buyer_display_name/.test(error?.message || '')) {
    return new Error('Database belum di-update. Jalankan file supabase/migration-002-roblox-buyer.sql di Supabase SQL Editor.')
  }
  return error
}
const BUCKET = 'bukti'

export async function listTransactions() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// URL sementara (1 jam) untuk foto di bucket private
export async function signedUrls(paths) {
  const list = paths.filter(Boolean)
  if (list.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(list, 3600)
  if (error) throw error
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}

async function uploadProof(file) {
  const { blob, ext } = await compressImage(file)
  const d = new Date()
  const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

async function removeProof(path) {
  if (!path) return
  // Gagal hapus file tidak membatalkan operasi utama
  await supabase.storage.from(BUCKET).remove([path])
}

/**
 * values: { purchase_date, buyer_username, amount, robux, notes }
 * proof:  { file?: File, remove?: boolean }
 */
export async function createTransaction(values, proof) {
  const proof_path = proof?.file ? await uploadProof(proof.file) : null
  const { data, error } = await supabase.from(TABLE).insert({ ...values, proof_path }).select().single()
  if (error) {
    await removeProof(proof_path)
    throw friendly(error)
  }
  return data
}

export async function updateTransaction(existing, values, proof) {
  let proof_path = existing.proof_path
  let newPath = null
  if (proof?.file) {
    newPath = await uploadProof(proof.file)
    proof_path = newPath
  } else if (proof?.remove) {
    proof_path = null
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...values, proof_path })
    .eq('id', existing.id)
    .select()
    .single()
  if (error) {
    await removeProof(newPath)
    throw friendly(error)
  }
  if (existing.proof_path && existing.proof_path !== proof_path) await removeProof(existing.proof_path)
  return data
}

export async function deleteTransaction(row) {
  const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
  if (error) throw error
  await removeProof(row.proof_path)
}

export async function checkOwner() {
  const { data, error } = await supabase.rpc('is_owner')
  if (error) throw error
  return data === true
}

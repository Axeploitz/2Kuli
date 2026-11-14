import { supabase } from './supabase'
import { compressImage } from './image'

const TABLE = 'site_updates'
const BUCKET = 'update-images'

export const UPDATE_TAGS = ['Update', 'Event', 'Info', 'Pengumuman']

function friendly(error) {
  if (/site_updates|update-images|Bucket not found/i.test(error?.message || '')) {
    return new Error('Database belum di-update. Jalankan file supabase/migration-004-updates.sql di Supabase SQL Editor.')
  }
  return error
}

export const imageUrl = (path) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null)

const order = (q) => q.order('pinned', { ascending: false }).order('created_at', { ascending: false })

/** Untuk landing page: hanya yang tayang */
export async function listPublishedUpdates(limit = 6) {
  const { data, error } = await order(supabase.from(TABLE).select('*').eq('published', true)).limit(limit)
  if (error) throw friendly(error)
  return data
}

/** Untuk dashboard owner: semua termasuk draf */
export async function listAllUpdates() {
  const { data, error } = await order(supabase.from(TABLE).select('*'))
  if (error) throw friendly(error)
  return data
}

async function uploadImage(file) {
  const { blob, ext } = await compressImage(file, 1600, 0.82)
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (error) throw friendly(error)
  return path
}

async function removeImage(path) {
  if (path) await supabase.storage.from(BUCKET).remove([path])
}

/** image: { file?: File, remove?: boolean } */
export async function saveUpdate(existing, values, image) {
  let image_path = existing?.image_path ?? null
  let uploaded = null
  if (image?.file) image_path = uploaded = await uploadImage(image.file)
  else if (image?.remove) image_path = null

  const q = existing
    ? supabase.from(TABLE).update({ ...values, image_path }).eq('id', existing.id)
    : supabase.from(TABLE).insert({ ...values, image_path })
  const { data, error } = await q.select().single()
  if (error) {
    await removeImage(uploaded)
    throw friendly(error)
  }
  if (existing?.image_path && existing.image_path !== image_path) await removeImage(existing.image_path)
  return data
}

export async function patchUpdate(id, values) {
  const { data, error } = await supabase.from(TABLE).update(values).eq('id', id).select().single()
  if (error) throw friendly(error)
  return data
}

export async function deleteUpdate(row) {
  const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
  if (error) throw friendly(error)
  await removeImage(row.image_path)
}

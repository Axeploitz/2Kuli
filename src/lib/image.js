// Perkecil foto sebelum upload supaya hemat kuota storage Supabase (gratis 1 GB).
// Kalau browser tidak bisa membaca formatnya (mis. HEIC di Chrome), file asli dipakai.
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return { blob: file, ext: extOf(file) }
    return { blob, ext: 'jpg' }
  } catch {
    return { blob: file, ext: extOf(file) }
  }
}

function extOf(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 5) return fromName
  return (file.type.split('/')[1] || 'jpg').toLowerCase()
}

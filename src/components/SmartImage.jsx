import { useEffect, useState } from 'react'

/**
 * Tampilkan gambar dari `src`. Kalau gagal dimuat (file tidak ada), tampil `fallback`.
 */
export default function SmartImage({ src, alt, className = '', fallback = null }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  if (!src || failed) return fallback
  return <img key={src} src={src} alt={alt} decoding="async" className={className} onError={() => setFailed(true)} />
}

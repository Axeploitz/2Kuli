import { useState } from 'react'

// Foto profil Roblox bulat; kalau tidak ada, tampil inisial.
export default function RobloxAvatar({ src, name = '', size = 40, className = '' }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  if (src && !failed) {
    return (
      <img src={src} alt="" width={size} height={size} style={style} loading="lazy" onError={() => setFailed(true)}
        className={`rounded-full object-cover bg-raised ring-1 ring-line-strong shrink-0 ${className}`} />
    )
  }
  return (
    <span style={{ ...style, fontSize: size * 0.4 }} aria-hidden="true"
      className={`rounded-full grid place-items-center bg-raised ring-1 ring-line-strong font-display font-bold text-gold/80 shrink-0 ${className}`}>
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

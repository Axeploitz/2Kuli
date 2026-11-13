import { useEffect, useState } from 'react'
import { community } from '../config/community'

// Logo diatur di src/config/community.js -> logo.file (file di public/logo/).
// Kalau file tidak ada / gagal dimuat, tampil logo teks.
export default function Logo({ size = 32, showName = true, className = '' }) {
  const { file, wordmark, invert } = community.logo ?? {}
  const src = file ? `/logo/${file}` : null
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  const hasImg = src && !failed
  const h = wordmark ? Math.round(size * 1.25) : size
  const hideName = hasImg && wordmark

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {hasImg ? (
        <img
          key={src}
          src={src}
          alt={hideName || !showName ? community.name : ''}
          height={h}
          className={`object-contain shrink-0 ${invert ? 'invert mix-blend-screen' : ''}`}
          style={wordmark ? { height: h, width: 'auto' } : { width: size, height: size }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          aria-hidden={showName}
          className="grid place-items-center rounded-lg border border-gold/70 bg-bg font-display font-extrabold text-yellow shrink-0 leading-none"
          style={{ width: size, height: size, fontSize: size * 0.42 }}
        >
          {community.name.slice(0, 2)}
        </span>
      )}
      {showName && !hideName && <span className="font-display font-bold text-lg tracking-tight text-fg">{community.name}</span>}
    </span>
  )
}

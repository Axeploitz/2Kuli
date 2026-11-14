import { useEffect, useState } from 'react'
import { fmtDay } from '../lib/format'
import { imageUrl } from '../lib/updates'
import Reveal from './Reveal'

// Daftar update di halaman landing. Klik kartu untuk baca lengkap.
export default function LatestUpdates({ updates }) {
  const [open, setOpen] = useState(null)
  const [first, ...rest] = updates

  return (
    <>
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 sm:gap-5">
        <Reveal><UpdateCard u={first} featured onOpen={setOpen} /></Reveal>
        {rest.length > 0 && (
          <ul className="grid gap-4 sm:gap-5 content-start">
            {rest.slice(0, 5).map((u, i) => (
              <Reveal as="li" key={u.id} delay={120 + i * 90}><UpdateCard u={u} onOpen={setOpen} /></Reveal>
            ))}
          </ul>
        )}
      </div>
      {open && <UpdateModal u={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function Meta({ u }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      {u.pinned && <span className="rounded-md bg-yellow px-2 py-0.5 font-bold text-bg">Disematkan</span>}
      <span className="rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 font-bold text-gold-soft">{u.tag}</span>
      {u.experience && <span className="text-fg/80 font-semibold">{u.experience}</span>}
      <span className="text-muted">· {fmtDay(u.created_at)}</span>
    </div>
  )
}

function UpdateCard({ u, featured = false, onOpen }) {
  const img = imageUrl(u.image_path)
  return (
    <button type="button" onClick={() => onOpen(u)}
      className={`group w-full text-left card overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-2xl hover:shadow-black/50 ${
        featured ? '' : 'flex gap-4 p-3.5 items-center'}`}>
      {featured ? (
        <>
          {img && (
            <div className="aspect-[16/9] overflow-hidden border-b border-line">
              <img src={img} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            </div>
          )}
          <div className="p-5 sm:p-7">
            <Meta u={u} />
            <h3 className="font-display font-bold text-2xl sm:text-[28px] leading-tight tracking-tight mt-3 group-hover:text-yellow transition-colors">{u.title}</h3>
            <p className={`text-muted leading-relaxed mt-3 whitespace-pre-line ${img ? 'line-clamp-3' : 'line-clamp-6'}`}>{u.body}</p>
            <span className="inline-block mt-4 text-sm font-semibold text-gold-soft">Baca selengkapnya →</span>
          </div>
        </>
      ) : (
        <>
          <div className="w-24 sm:w-28 aspect-[4/3] rounded-lg overflow-hidden shrink-0 border border-line-strong bg-raised grid place-items-center">
            {img ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              : <span className="font-display font-bold text-gold/50 text-xs">{u.tag}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <Meta u={u} />
            <h3 className="font-semibold leading-snug mt-1.5 line-clamp-2 group-hover:text-yellow transition-colors">{u.title}</h3>
          </div>
        </>
      )}
    </button>
  )
}

function UpdateModal({ u, onClose }) {
  const img = imageUrl(u.image_path)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <article role="dialog" aria-modal="true" aria-labelledby="upd-title"
        className="bg-surface w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line shadow-2xl shadow-black/70">
        {img && <img src={img} alt="" className="w-full aspect-[16/9] object-cover border-b border-line" />}
        <div className="p-5 sm:p-8">
          <Meta u={u} />
          <h2 id="upd-title" className="font-display font-bold text-2xl sm:text-3xl leading-tight tracking-tight mt-3">{u.title}</h2>
          <p className="text-fg/85 leading-relaxed mt-4 whitespace-pre-line break-words">{u.body}</p>
        </div>
        <div className="px-5 sm:px-8 py-4 border-t border-line sticky bottom-0 bg-surface">
          <button onClick={onClose} className="btn-ghost w-full py-2.5" autoFocus>Tutup</button>
        </div>
      </article>
    </div>
  )
}

import { useEffect } from 'react'

export default function ProofViewer({ url, caption, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose} role="dialog" aria-modal="true" aria-label="Bukti transaksi">
      <div className="flex items-center justify-between gap-4 px-5 h-14 border-b border-line">
        <p className="text-sm font-semibold truncate">{caption}</p>
        <div className="flex gap-2 items-center shrink-0">
          <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="btn-ghost py-1.5 px-3">Buka asli</a>
          <button onClick={onClose} className="btn-ghost py-1.5 px-3" aria-label="Tutup">Tutup</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4 sm:p-8 grid place-items-center">
        <img src={url} alt={caption} className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  )
}

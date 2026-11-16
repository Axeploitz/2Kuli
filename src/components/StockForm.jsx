import { useEffect, useState } from 'react'
import { digits, num } from '../lib/format'

export const STOCK_KINDS = {
  set: { title: 'Sesuaikan stock', label: 'Stock sekarang di Roblox', hint: 'Isi angka Group Funds persis seperti di Roblox. Stock di website akan disamakan dengan angka ini.', button: 'Samakan stock' },
  add: { title: 'Tambah stock', label: 'Jumlah Robux masuk', hint: 'Mis. Group Funds diisi ulang atau ada pemasukan Robux ke grup.', button: 'Tambah' },
  subtract: { title: 'Potong manual', label: 'Jumlah Robux keluar', hint: 'Pengeluaran di luar payout tercatat (mis. biaya iklan, beli aset). Untuk payout ke orang, pakai "Catat payout manual".', button: 'Potong' },
}

export default function StockForm({ kind, poolName, current, onCancel, onSubmit }) {
  const k = STOCK_KINDS[kind]
  const [robux, setRobux] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  const n = Number(robux)
  const after = !robux ? null : kind === 'set' ? n : kind === 'add' ? current + n : current - n

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (robux === '' || (kind !== 'set' && n <= 0)) return setError('Isi jumlah Robux.')
    setSaving(true)
    try {
      await onSubmit(kind, n, notes.trim())
    } catch (err) {
      setError('Gagal menyimpan: ' + (err.message || err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="sf-title"
        className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-line shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-line">
          <h2 id="sf-title" className="font-display font-bold text-xl tracking-tight">{k.title}{poolName && <span className="block text-[13px] font-sans font-semibold text-gold">{poolName}</span>}</h2>
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost py-1 px-2.5" aria-label="Tutup">Esc</button>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          <p className="text-[13px] text-muted">{k.hint}</p>
          <div>
            <label className="label" htmlFor="s-robux">{k.label}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gold pointer-events-none">R$</span>
              <input id="s-robux" type="text" inputMode="numeric" autoFocus placeholder="10.000" className="field pl-10 tabular-nums"
                value={robux ? num(robux) : ''} onChange={(e) => setRobux(digits(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="s-notes">Catatan <span className="font-normal text-muted/70">(opsional)</span></label>
            <input id="s-notes" type="text" maxLength={200} className="field" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={kind === 'set' ? 'Dicocokkan dengan Creator Hub' : kind === 'add' ? 'Top up group funds' : 'Biaya iklan, dll.'} />
          </div>
          <div className="rounded-lg bg-raised px-3 py-2.5 text-sm flex justify-between tabular-nums">
            <span className="text-muted">Stock: R$ {num(current)}</span>
            <span>→ <b className={after !== null && after < 0 ? 'text-danger' : 'text-yellow'}>{after === null ? '…' : `R$ ${num(after)}`}</b></span>
          </div>
          {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        </div>
        <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-line">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost flex-1 py-3">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary flex-[2] py-3">{saving ? 'Menyimpan…' : k.button}</button>
        </div>
      </form>
    </div>
  )
}

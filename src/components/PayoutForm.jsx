import { useEffect, useState } from 'react'
import { digits, num, today } from '../lib/format'
import RobloxUserPicker from './RobloxUserPicker'

/** Form catat payout manual (di luar tiket), mis. hadiah event */
export default function PayoutForm({ initial, defaultPool = 'payout', onCancel, onSubmit }) {
  const editing = !!initial
  const [user, setUser] = useState(() => initial?.roblox_user_id
    ? { id: String(initial.roblox_user_id), name: initial.roblox_username, displayName: initial.roblox_display_name || initial.roblox_username, avatar: null }
    : null)
  const [form, setForm] = useState(() => ({
    date: initial ? initial.paid_at.slice(0, 10) : today(),
    robux: initial ? String(initial.robux) : '',
    notes: initial?.notes ?? '',
    pool: initial?.pool ?? defaultPool,
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  async function submit(e) {
    e.preventDefault()
    setError('')
    const robux = Number(form.robux)
    if (!user) return setError('Pilih akun Roblox penerima dari daftar saran.')
    if (!robux || robux <= 0) return setError('Jumlah Robux harus lebih dari 0.')
    if (!form.date) return setError('Tanggal wajib diisi.')
    setSaving(true)
    try {
      // Simpan sebagai jam 12.00 WIB di tanggal yang dipilih
      await onSubmit({
        paid_at: new Date(`${form.date}T12:00:00+07:00`).toISOString(),
        roblox_user_id: Number(user.id),
        roblox_username: user.name,
        roblox_display_name: user.displayName,
        robux,
        notes: form.notes.trim() || null,
        pool: form.pool,
      })
    } catch (err) {
      setError('Gagal menyimpan: ' + (err.message || err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pf-title"
        className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-line sticky top-0 bg-surface z-10">
          <h2 id="pf-title" className="font-display font-bold text-xl tracking-tight">{editing ? 'Edit pengiriman' : 'Catat pengiriman manual'}</h2>
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost py-1 px-2.5" aria-label="Tutup">Esc</button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <p className="text-[13px] text-muted">
            Untuk payout di luar tiket (mis. hadiah event). Payout dari transaksi <b className="text-fg">Via Payouts</b> tercatat otomatis saat dicentang Diproses.
          </p>
          <div>
            <span className="label">Dipotong dari</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Stock">
              {[['payout', '🏛️ Stock Group'], ['username', '👤 Stock Username']].map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={form.pool === v} onClick={() => setForm((f) => ({ ...f, pool: v }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold text-left ${form.pool === v ? 'border-gold bg-gold/10' : 'border-line-strong hover:border-gold/50'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="p-user">Penerima (username Roblox)</label>
            <RobloxUserPicker id="p-user" value={user} onChange={setUser} autoFocus />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="p-robux">Jumlah Robux</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gold pointer-events-none">R$</span>
                <input id="p-robux" type="text" inputMode="numeric" placeholder="1.000" className="field pl-10 tabular-nums"
                  value={form.robux ? num(form.robux) : ''} onChange={(e) => setForm((f) => ({ ...f, robux: digits(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="p-date">Tanggal payout</label>
              <input id="p-date" type="date" className="field" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="p-notes">Catatan <span className="font-normal text-muted/70">(opsional)</span></label>
            <input id="p-notes" type="text" maxLength={200} placeholder="Hadiah event, refund, dll." className="field"
              value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-line bg-surface sticky bottom-0">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost flex-1 py-3">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary flex-[2] py-3">{saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Catat payout'}</button>
        </div>
      </form>
    </div>
  )
}

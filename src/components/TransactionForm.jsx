import { useEffect, useRef, useState } from 'react'
import { digits, num, rupiah, today } from '../lib/format'
import { cachedProfile } from '../lib/roblox'
import RobloxUserPicker from './RobloxUserPicker'

export default function TransactionForm({ initial, proofUrl, onCancel, onSubmit }) {
  const editing = !!initial
  const [form, setForm] = useState(() => ({
    purchase_date: initial?.purchase_date ?? today(),
    amount: initial ? String(Math.round(initial.amount)) : '',
    robux: initial ? String(initial.robux) : '',
    notes: initial?.notes ?? '',
    via: initial?.via ?? 'payout',
  }))
  // Akun Roblox buyer yang dipilih. Transaksi lama tanpa ID: user diminta memilih ulang.
  const [buyer, setBuyer] = useState(() => {
    if (!initial?.buyer_user_id) return null
    const p = cachedProfile(initial)
    return {
      id: String(initial.buyer_user_id),
      name: p?.name || initial.buyer_username,
      displayName: p?.displayName || initial.buyer_display_name || initial.buyer_username,
      avatar: p?.avatar || null,
    }
  })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(proofUrl || null)
  const [removeProof, setRemoveProof] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  useEffect(() => () => { if (file && preview?.startsWith('blob:')) URL.revokeObjectURL(preview) }, [file, preview])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: digits(e.target.value) }))

  const [dragging, setDragging] = useState(false)

  function pickFile(e) {
    acceptFile(e.target.files?.[0])
  }

  function acceptFile(f) {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('File bukti harus berupa gambar.')
    if (f.size > 15 * 1024 * 1024) return setError('Ukuran foto maksimal 15 MB.')
    setError('')
    setFile(f)
    setRemoveProof(false)
    setPreview(URL.createObjectURL(f))
  }

  // Tempel gambar langsung (Ctrl+V / ⌘V), misal screenshot bukti transfer
  useEffect(() => {
    function onPaste(e) {
      if (saving) return
      const img = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
      if (!img) return // teks biasa: biarkan masuk ke kolom yang sedang aktif
      e.preventDefault()
      acceptFile(img)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    acceptFile([...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')))
  }
  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); setDragging(true) },
    onDragLeave: () => setDragging(false),
    onDrop,
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    setRemoveProof(true)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const amount = Number(form.amount)
    const robux = Number(form.robux)
    if (!buyer) return setError('Pilih akun Roblox buyer dari daftar saran supaya username-nya pasti benar.')
    if (!form.purchase_date) return setError('Tanggal pembelian wajib diisi.')
    if (!form.amount) return setError('Nominal wajib diisi.')
    if (!robux || robux <= 0) return setError('Jumlah Robux harus lebih dari 0.')
    setSaving(true)
    try {
      await onSubmit(
        {
          purchase_date: form.purchase_date,
          buyer_username: buyer.name,
          buyer_user_id: Number(buyer.id),
          buyer_display_name: buyer.displayName,
          amount,
          robux,
          notes: form.notes.trim() || null,
          via: form.via,
        },
        { file, remove: removeProof && !file }
      )
    } catch (err) {
      setError('Gagal menyimpan: ' + (err.message || err))
      setSaving(false)
    }
  }

  const rate = Number(form.amount) && Number(form.robux) ? (Number(form.amount) / Number(form.robux)) * 1000 : null

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="form-title"
        className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-line sticky top-0 bg-surface z-10">
          <h2 id="form-title" className="font-display font-bold text-xl tracking-tight">{editing ? 'Edit transaksi' : 'Transaksi baru'}</h2>
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost py-1 px-2.5" aria-label="Tutup">Esc</button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4">
            <label className="label" htmlFor="f-user">Username buyer (Roblox)</label>
            <RobloxUserPicker id="f-user" value={buyer} onChange={setBuyer} autoFocus
              initialQuery={initial && !initial.buyer_user_id ? initial.buyer_username : ''} />
            {initial && !initial.buyer_user_id && !buyer && (
              <p className="mt-1.5 text-[12px] text-gold-soft">Transaksi lama ini belum terhubung ke akun Roblox. Pilih akunnya dari daftar.</p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="f-date">Tanggal pembelian</label>
              <input id="f-date" type="date" className="field" value={form.purchase_date} onChange={set('purchase_date')} required />
            </div>
            <div>
              <label className="label" htmlFor="f-amount">Nominal</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted pointer-events-none">Rp</span>
                <input id="f-amount" type="text" inputMode="numeric" placeholder="125.000" className="field pl-10 tabular-nums"
                  value={form.amount ? num(form.amount) : ''} onChange={setNum('amount')} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="f-robux">Jumlah Robux</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gold pointer-events-none">R$</span>
                <input id="f-robux" type="text" inputMode="numeric" placeholder="1.000" className="field pl-10 tabular-nums"
                  value={form.robux ? num(form.robux) : ''} onChange={setNum('robux')} />
              </div>
            </div>
          </div>
          {rate !== null && (
            <p className="mt-3 text-[13px] text-muted">Rate <span className="text-gold-soft font-semibold">{rupiah(rate)}</span> per 1.000 Robux</p>
          )}

          <div className="mt-4">
            <span className="label">Metode topup</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Metode topup">
              {[['payout', '🏛️ Via Payouts', 'Tercatat di log Payouts saat Diproses'], ['username', '👤 Via Username', 'Kirim langsung ke akun']].map(([v, t, d]) => (
                <button key={v} type="button" role="radio" aria-checked={form.via === v} onClick={() => setForm((f) => ({ ...f, via: v }))}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${form.via === v ? 'border-gold bg-gold/10' : 'border-line-strong hover:border-gold/50'}`}>
                  <span className="block text-sm font-semibold">{t}</span>
                  <span className="block text-[12px] text-muted">{d}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="f-notes">Catatan <span className="font-normal text-muted/70">(opsional)</span></label>
            <input id="f-notes" type="text" maxLength={200} placeholder="via DANA, gamepass, dll." className="field"
              value={form.notes} onChange={set('notes')} />
          </div>

          <div className="mt-5">
            <span className="label">Foto bukti transaksi</span>
            {preview ? (
              <div {...dropProps} className={`rounded-xl border overflow-hidden ${dragging ? 'border-gold ring-2 ring-gold/40' : 'border-line-strong'}`}>
                <img src={preview} alt="Pratinjau bukti transaksi" className="w-full max-h-64 object-contain bg-bg" />
                <p className="px-3 py-1.5 text-[12px] text-muted border-t border-line-strong">{file ? 'Gambar baru siap disimpan' : 'Bukti tersimpan'} · tempel ({isMac ? '⌘' : 'Ctrl'}+V) untuk mengganti</p>
                <div className="flex border-t border-line-strong text-sm font-semibold">
                  <button type="button" onClick={() => fileInput.current?.click()} className="flex-1 py-2.5 hover:bg-raised hover:text-yellow">Ganti foto</button>
                  <button type="button" onClick={clearFile} className="flex-1 py-2.5 border-l border-line-strong text-muted hover:bg-danger/10 hover:text-danger">Hapus foto</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInput.current?.click()} {...dropProps}
                className={`w-full rounded-xl border border-dashed py-8 px-4 text-center transition-colors ${
                  dragging ? 'border-gold bg-gold/10' : 'border-line-strong hover:border-gold hover:bg-gold/5'}`}>
                <span className="block font-semibold">{dragging ? 'Lepaskan untuk menambahkan' : 'Pilih atau ambil foto'}</span>
                <span className="block mt-1.5 text-[13px] text-muted">
                  atau <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd> + <Kbd>V</Kbd> untuk tempel gambar · bisa juga seret ke sini
                </span>
                <span className="block mt-1 text-[12px] text-muted/70">JPG, PNG, WEBP · otomatis diperkecil</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={pickFile} tabIndex={-1} />
          </div>

          {error && <p role="alert" className="mt-5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-line bg-surface sticky bottom-0">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost flex-1 py-3">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary flex-[2] py-3">
            {saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan transaksi'}
          </button>
        </div>
      </form>
    </div>
  )
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function Kbd({ children }) {
  return <kbd className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-sans text-[12px] font-semibold text-fg">{children}</kbd>
}

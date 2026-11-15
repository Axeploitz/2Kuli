import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getTopupStatus, setTopupOpen } from '../lib/settings'

const fmtTime = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Saklar buka/tutup tiket topup di Discord.
 * Bot membaca status ini secara realtime dan mengubah panel di #ticket-topup.
 */
export default function TopupToggle({ nameOfId }) {
  const [status, setStatus] = useState(null) // null = memuat
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => getTopupStatus().then(setStatus).catch((e) => setError(e.message))
    load()
    const ch = supabase
      .channel('topup-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function toggle() {
    const next = !status.open
    const msg = next
      ? 'Buka tiket topup?\nPanel di #ticket-topup akan aktif dan buyer bisa membuat tiket.'
      : 'Tutup tiket topup?\nPanel di #ticket-topup akan menampilkan "TUTUP" dan buyer tidak bisa membuat tiket baru.\nTiket yang sudah terbuka tetap berjalan.'
    if (!window.confirm(msg)) return
    setSaving(true)
    setError('')
    try {
      await setTopupOpen(next)
      setStatus((s) => ({ ...s, open: next, updated_at: new Date().toISOString() }))
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const open = status?.open
  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <button type="button" role="switch" aria-checked={!!open} onClick={toggle} disabled={!status || saving}
        className={`group inline-flex items-center gap-3 rounded-xl border pl-3 pr-4 py-2.5 shadow-lg shadow-black/20 transition-colors disabled:opacity-60 ${
          !status ? 'bg-bg/80 border-black/40' : open ? 'bg-[#0f2a18] border-ok/50' : 'bg-[#2a1010] border-danger/50'}`}
        title={open ? 'Klik untuk menutup tiket topup' : 'Klik untuk membuka tiket topup'}>
        <span aria-hidden="true" className={`relative w-10 h-6 rounded-full transition-colors ${open ? 'bg-ok' : 'bg-line-strong'}`}>
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-fg transition-transform ${open ? 'translate-x-4' : ''}`} />
        </span>
        <span className="text-left">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Tiket topup Discord</span>
          <span className={`block text-sm font-bold ${!status ? 'text-muted' : open ? 'text-ok' : 'text-danger'}`}>
            {!status ? 'Memuat…' : saving ? 'Menyimpan…' : open ? '● BUKA' : '● TUTUP'}
          </span>
        </span>
      </button>
      {status?.updated_at && (
        <span className="text-[12px] text-bg/70">
          Diubah {fmtTime(status.updated_at)}{status.updated_by ? ` oleh ${nameOfId(status.updated_by)}` : ''}
        </span>
      )}
      {error && <span className="text-[12px] font-semibold text-[#7a1010] max-w-xs">{error}</span>}
    </div>
  )
}

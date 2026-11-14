import { community } from '../config/community'
import { num, rupiah } from '../lib/format'
import RobloxAvatar from './RobloxAvatar'

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Dua kartu owner berdampingan: bagian saldo yang sudah diterima tiap owner,
 * plus riwayat pembagian.
 * splits: rows saldo_splits; directory: [{ id, email, name }] dari user Supabase; rows: semua transaksi
 */
export default function SaldoShares({ splits, directory, rows, loading, onUndo, nameOf }) {
  const received = splits.reduce((a, s) => a + Number(s.share), 0)
  const last = splits[0]

  return (
    <section className="mt-4" aria-label="Bagian tiap owner">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {community.owners.map((o) => {
          const acc = directory.find((d) => d.name?.toLowerCase() === o.name.toLowerCase())
          const email = acc?.email
          const mine = rows.filter((r) => acc && r.created_by === acc.id)
          const mineAmount = mine.reduce((a, r) => a + Number(r.amount), 0)
          return (
            <article key={o.name} className="card p-4 sm:p-5 shadow-xl shadow-black/30 flex gap-4 items-start">
              <RobloxAvatar src={o.photo ? `/images/owners/${o.photo}` : null} name={o.name} size={56} className="ring-2 ring-gold/60" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display font-bold text-lg tracking-tight truncate">{o.name}</p>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">50%</span>
                </div>
                <p className="text-[13px] text-muted truncate">{email || (loading ? '…' : 'Akun belum ditemukan')}</p>

                <p className="text-[13px] text-muted mt-3">Total bagian diterima</p>
                <p className="font-display font-bold text-2xl sm:text-3xl tabular-nums tracking-tight text-yellow break-words">
                  {loading ? '…' : rupiah(received)}
                </p>
                <p className="text-[13px] text-muted mt-1">
                  {last ? <>Terakhir +{rupiah(last.share)} · {fmtTime(last.created_at)}</> : 'Belum pernah dibagi'}
                </p>

                <div className="mt-3 pt-3 border-t border-line flex justify-between gap-2 text-[13px]">
                  <span className="text-muted">Transaksi dicatat</span>
                  <span className="tabular-nums font-semibold">{num(mine.length)} · {rupiah(mineAmount)}</span>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {splits.length > 0 && (
        <details className="card mt-3 sm:mt-4 shadow-xl shadow-black/30 group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-sm font-semibold">
            <span>Riwayat bagi 2 <span className="text-muted font-normal">· {num(splits.length)}×</span></span>
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">▾</span>
          </summary>
          <ul className="border-t border-line">
            {splits.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3 border-b border-line last:border-0 text-sm">
                <span className="text-muted tabular-nums w-full sm:w-44">{fmtTime(s.created_at)}</span>
                <span className="flex-1 tabular-nums">
                  <span className="font-semibold">{rupiah(s.amount)}</span>
                  <span className="text-muted"> → {rupiah(s.share)} / owner</span>
                </span>
                <span className="text-muted">oleh {nameOf(s)}</span>
                {i === 0 && (
                  <button onClick={() => onUndo(s)} className="px-2.5 py-1 rounded-md text-[13px] text-muted hover:bg-danger/10 hover:text-danger">Batalkan</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

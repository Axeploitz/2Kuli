import { community } from '../config/community'
import { num, rupiah } from '../lib/format'
import RobloxAvatar from './RobloxAvatar'

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Apakah owner (akun dashboard) sudah menceklis bagi 2 ini */
export const ackOf = (split, acc) =>
  acc && (split.saldo_split_acks || []).find((a) => a.user_id === acc.id || a.email?.toLowerCase() === acc.email?.toLowerCase())

/** Akun dashboard untuk owner di config (JustAxe / Thalvior) */
export const accountsOf = (directory) =>
  community.owners.map((o) => ({ owner: o, acc: directory.find((d) => d.name?.toLowerCase() === o.name.toLowerCase()) }))

/**
 * Kartu bagian tiap owner + riwayat bagi 2.
 * Tiap bagi 2 harus diceklis "sudah diterima" oleh masing-masing owner (hanya akunnya sendiri).
 */
export default function SaldoShares({ splits, directory, rows, loading, myId, ackBusy, onAck, onUndo, nameOf }) {
  const last = splits[0]
  const owners = accountsOf(directory)

  return (
    <section className="mt-4" aria-label="Bagian tiap owner">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {owners.map(({ owner: o, acc }) => {
          const mine = rows.filter((r) => acc && r.created_by === acc.id)
          const mineAmount = mine.reduce((a, r) => a + Number(r.amount), 0)
          const received = splits.filter((s) => ackOf(s, acc)).reduce((a, s) => a + Number(s.share), 0)
          const pending = splits.filter((s) => !ackOf(s, acc)).reduce((a, s) => a + Number(s.share), 0)
          const lastAck = last && ackOf(last, acc)
          const isMe = acc && acc.id === myId
          const busy = last && ackBusy === `${last.id}:${acc?.id}`

          return (
            <article key={o.name} className="card p-4 sm:p-5 shadow-xl shadow-black/30 flex gap-4 items-start">
              <RobloxAvatar src={o.photo ? `/images/owners/${o.photo}` : null} name={o.name} size={56} className="ring-2 ring-gold/60" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display font-bold text-lg tracking-tight truncate">
                    {o.name}{isMe && <span className="ml-2 align-middle text-[11px] font-bold text-gold">(kamu)</span>}
                  </p>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">50%</span>
                </div>
                <p className="text-[13px] text-muted truncate">{acc?.email || (loading ? '…' : 'Akun belum ditemukan')}</p>

                <p className="text-[13px] text-muted mt-3">Total bagian diterima</p>
                <p className="font-display font-bold text-2xl sm:text-3xl tabular-nums tracking-tight text-yellow break-words">
                  {loading ? '…' : rupiah(received)}
                </p>
                <p className="text-[13px] text-muted mt-1">
                  {pending > 0 ? <span className="text-gold-soft">Belum diceklis: {rupiah(pending)}</span> : 'Semua bagian sudah diterima'}
                </p>

                {/* Ceklis bagi 2 terakhir: hanya bisa oleh akun owner ini */}
                {last && (
                  <button type="button" role="checkbox" aria-checked={!!lastAck}
                    disabled={!isMe || busy || !acc}
                    onClick={() => onAck(last, !lastAck)}
                    title={isMe ? (lastAck ? 'Klik untuk membatalkan ceklis' : 'Tandai bagian ini sudah kamu terima') : `Hanya ${o.name} yang bisa menceklis bagian ini`}
                    className={`mt-3 w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                      lastAck ? 'border-ok/50 bg-ok/10' : isMe ? 'border-gold/60 bg-gold/5 hover:bg-gold/10' : 'border-line-strong'} ${busy ? 'opacity-60' : ''}`}>
                    <span aria-hidden="true" className={`grid place-items-center w-5 h-5 rounded-md border shrink-0 ${lastAck ? 'bg-ok border-ok' : 'border-line-strong'}`}>
                      {lastAck && <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-bg"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-semibold ${lastAck ? 'text-ok' : ''}`}>
                        {lastAck ? 'Sudah diterima' : 'Belum diterima'} · +{rupiah(last.share)}
                      </span>
                      <span className="block text-[12px] text-muted truncate">
                        {lastAck ? `Diceklis ${fmtTime(lastAck.acked_at)}` : `Bagi 2 terakhir · ${fmtTime(last.created_at)}`}
                      </span>
                    </span>
                    {!isMe && (
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5 text-muted shrink-0"><path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" /></svg>
                    )}
                  </button>
                )}

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
            {splits.map((s, i) => {
              const anyAck = (s.saldo_split_acks || []).length > 0
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 border-b border-line last:border-0 text-sm">
                  <span className="text-muted tabular-nums w-full sm:w-44">
                    <span className="font-semibold text-fg">#{splits.length - i}</span> · {fmtTime(s.created_at)}
                  </span>
                  <span className="flex-1 min-w-[10rem] tabular-nums">
                    <span className="font-semibold">{rupiah(s.amount)}</span>
                    <span className="text-muted"> → {rupiah(s.share)} / owner</span>
                    <span className="block text-[12px] text-muted">oleh {nameOf(s)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {owners.map(({ owner: o, acc }) => {
                      const a = ackOf(s, acc)
                      return (
                        <span key={o.name} title={a ? `Diterima ${fmtTime(a.acked_at)}` : 'Belum diceklis'}
                          className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${a ? 'bg-ok/15 text-ok' : 'bg-line text-muted'}`}>
                          {a ? '✓' : '⏳'} {o.name}
                        </span>
                      )
                    })}
                  </span>
                  {i === 0 && !anyAck && (
                    <button onClick={() => onUndo(s)} className="px-2.5 py-1 rounded-md text-[13px] text-muted hover:bg-danger/10 hover:text-danger">Batalkan</button>
                  )}
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </section>
  )
}

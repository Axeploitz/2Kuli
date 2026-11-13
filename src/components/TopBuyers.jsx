import { num, rupiah } from '../lib/format'
import { cachedProfile } from '../lib/roblox'
import RobloxAvatar from './RobloxAvatar'

const keyOf = (r) => (r.buyer_user_id ? `id:${r.buyer_user_id}` : `u:${String(r.buyer_username).toLowerCase()}`)

// Kelompokkan transaksi per buyer, urutkan dari total nominal terbesar
export function rankBuyers(rows, limit = 5) {
  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    const g = map.get(k) || { key: k, sample: r, amount: 0, robux: 0, count: 0, last: r.purchase_date }
    g.amount += Number(r.amount)
    g.robux += Number(r.robux)
    g.count += 1
    if (r.purchase_date > g.last) { g.last = r.purchase_date; g.sample = r }
    map.set(k, g)
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.robux - a.robux).slice(0, limit)
}

export default function TopBuyers({ rows, month, loading }) {
  const top = rankBuyers(rows)

  return (
    <section className="card mt-8 shadow-2xl shadow-black/40" aria-labelledby="top-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-5 pt-5 pb-4 border-b border-line">
        <div>
          <p className="eyebrow mb-1">Peringkat</p>
          <h2 id="top-title" className="font-display font-bold text-xl tracking-tight">Top buyer</h2>
        </div>
        <p className="text-[13px] text-muted">{month ? 'Bulan yang dipilih' : 'Sepanjang waktu'} · berdasarkan total nominal</p>
      </div>

      {loading ? (
        <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 sm:p-5">
          {[0, 1, 2, 3, 4].map((i) => <li key={i} className="h-40 rounded-xl bg-raised animate-pulse" />)}
        </ol>
      ) : top.length === 0 ? (
        <p className="px-5 py-10 text-center text-muted">Belum ada data. Top buyer muncul setelah ada transaksi.</p>
      ) : (
        <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 sm:p-5">
          {top.map((g, i) => {
            const p = cachedProfile(g.sample)
            const display = p?.displayName || g.sample.buyer_display_name || g.sample.buyer_username
            const username = p?.name || g.sample.buyer_username
            const first = i === 0
            return (
              <li key={g.key}
                className={`relative flex lg:flex-col items-center lg:text-center gap-3 rounded-xl p-3.5 lg:p-4 lg:pt-5 border transition-colors ${
                  first ? 'border-gold/60 bg-gradient-to-b from-gold/15 to-transparent' : 'border-line bg-raised/40 hover:border-line-strong'}`}>
                <span className={`absolute top-2.5 left-3 text-[11px] font-bold tabular-nums ${first ? 'text-yellow' : 'text-muted'}`}>#{i + 1}</span>
                <span className="relative ml-5 lg:ml-0">
                  <RobloxAvatar src={p?.avatar} name={display} size={first ? 64 : 56} className={first ? 'ring-2 ring-yellow' : ''} />
                  {first && (
                    <span aria-hidden="true" className="absolute -top-2 -right-1 text-base drop-shadow">👑</span>
                  )}
                </span>
                <div className="flex-1 min-w-0 lg:w-full">
                  <p className="font-semibold truncate">{display}</p>
                  <p className="text-[13px] text-muted truncate">@{username}</p>
                  <p className={`mt-1.5 font-display font-bold tabular-nums tracking-tight ${first ? 'text-yellow text-lg' : 'text-fg'}`}>{rupiah(g.amount)}</p>
                  <p className="text-[12px] text-muted tabular-nums">R$ {num(g.robux)} · {num(g.count)} transaksi</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

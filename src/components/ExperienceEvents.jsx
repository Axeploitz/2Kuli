import { useEffect, useMemo, useState } from 'react'

const MAX_ENDED = 2 // event yang sudah selesai: tampilkan maksimal 2 terbaru per experience

const placeIdOf = (url) => url?.match(/games\/(\d+)/)?.[1] ?? null

const fmt = (iso, withYear = false) =>
  new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit',
  })

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' })
function relative(iso, now) {
  const diff = new Date(iso) - now
  const abs = Math.abs(diff)
  if (abs < 3600e3) return rtf.format(Math.round(diff / 60e3), 'minute')
  if (abs < 86400e3) return rtf.format(Math.round(diff / 3600e3), 'hour')
  return rtf.format(Math.round(diff / 86400e3), 'day')
}

function statusOf(e, now) {
  if (now < new Date(e.start)) return 'upcoming'
  if (now <= new Date(e.end)) return 'live'
  return 'ended'
}

const ORDER = { live: 0, upcoming: 1, ended: 2 }

export default function ExperienceEvents({ experiences }) {
  const list = useMemo(() => experiences.map((x) => ({ ...x, placeId: placeIdOf(x.url) })).filter((x) => x.placeId), [experiences])
  const [state, setState] = useState({ loading: true, error: '', groups: {} })
  const now = new Date()

  useEffect(() => {
    if (list.length === 0) return setState({ loading: false, error: '', groups: {} })
    const ctrl = new AbortController()
    fetch(`/api/events?places=${list.map((x) => x.placeId).join(',')}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => setState({ loading: false, error: '', groups: Object.fromEntries(d.groups.map((g) => [g.placeId, g])) }))
      .catch((e) => { if (e.name !== 'AbortError') setState({ loading: false, error: 'Gagal memuat event dari Roblox.', groups: {} }) })
    return () => ctrl.abort()
  }, [list])

  if (list.length === 0) return null

  return (
    <div className="space-y-14">
      {state.error && <p className="text-sm text-muted">{state.error} Coba muat ulang halaman.</p>}
      {!state.error && list.map((x) => {
        const g = state.groups[x.placeId]
        const all = (g?.events || []).map((e) => ({ ...e, status: statusOf(e, now) }))
        const active = all.filter((e) => e.status !== 'ended').sort((a, b) => ORDER[a.status] - ORDER[b.status] || new Date(a.start) - new Date(b.start))
        const ended = all.filter((e) => e.status === 'ended').sort((a, b) => new Date(b.end) - new Date(a.end)).slice(0, MAX_ENDED)
        const events = [...active, ...ended]
        const liveCount = all.filter((e) => e.status === 'live').length

        return (
          <div key={x.placeId}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div className="flex items-center gap-3">
                <img src={`/images/experiences/${x.image}`} alt="" className="w-10 h-10 rounded-lg object-cover border border-line" />
                <h3 className="font-display font-bold text-xl tracking-tight">{x.name}</h3>
                {liveCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow/10 px-2.5 py-1 text-xs font-semibold text-yellow">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow animate-pulse" aria-hidden="true" />
                    {liveCount} berlangsung
                  </span>
                )}
              </div>
              <a href={x.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-muted hover:text-gold-soft">Buka game →</a>
            </div>

            {state.loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[0, 1].map((i) => (
                  <div key={i} className="card overflow-hidden">
                    <div className="aspect-video bg-raised animate-pulse" />
                    <div className="p-5 space-y-3">
                      <div className="h-3 w-1/3 rounded bg-raised animate-pulse" />
                      <div className="h-5 w-2/3 rounded bg-raised animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <p className="text-muted">Belum ada event untuk experience ini.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {events.map((e) => <EventCard key={e.id} e={e} now={now} />)}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

const BADGE = {
  live: { text: 'Berlangsung', cls: 'bg-yellow text-bg' },
  upcoming: { text: 'Segera', cls: 'bg-bg/80 text-gold-soft border border-gold/50' },
  ended: { text: 'Selesai', cls: 'bg-bg/80 text-muted border border-line-strong' },
}

function EventCard({ e, now }) {
  const b = BADGE[e.status]
  const when =
    e.status === 'live' ? `Berakhir ${relative(e.end, now)}`
      : e.status === 'upcoming' ? `Mulai ${relative(e.start, now)}`
        : `Selesai ${relative(e.end, now)}`

  return (
    <li className={e.status === 'ended' ? 'opacity-60 hover:opacity-100 transition-opacity' : ''}>
      <a href={e.url} target="_blank" rel="noreferrer"
        className={`group flex flex-col h-full card overflow-hidden transition-colors ${e.status === 'live' ? 'border-gold/50 hover:border-yellow' : 'hover:border-gold/60'}`}>
        <div className="relative aspect-video bg-raised overflow-hidden">
          {e.thumbnail && <img src={e.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />}
          <span className={`absolute top-3 left-3 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${b.cls}`}>{b.text}</span>
        </div>
        <div className="flex flex-col flex-1 p-5">
          <p className="text-[13px] font-semibold text-gold tabular-nums">{when}</p>
          <h4 className="mt-1.5 font-display font-bold text-lg leading-snug tracking-tight">{e.title}</h4>
          {e.subtitle && e.subtitle !== e.title && <p className="mt-1 text-sm text-fg/80">{e.subtitle}</p>}
          {e.description && <p className="mt-3 text-sm text-muted leading-relaxed line-clamp-3 whitespace-pre-line">{e.description}</p>}
          <div className="mt-auto pt-4 flex items-end justify-between gap-3 text-[12px] text-muted">
            <span className="tabular-nums">{fmt(e.start)} – {fmt(e.end, true)} WIB</span>
            <span className="font-semibold text-fg group-hover:text-yellow shrink-0">Lihat →</span>
          </div>
        </div>
      </a>
    </li>
  )
}

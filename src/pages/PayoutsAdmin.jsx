import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNoIndex } from '../lib/useNoIndex'
import { num } from '../lib/format'
import { supabase } from '../lib/supabase'
import { checkOwner, ownerDirectory } from '../lib/transactions'
import {
  POOLS, addStockAdjustment, buildStockLedger, deletePayout, deleteStockAdjustment, listPayouts, listStockAdjustments, savePayout,
} from '../lib/payouts'
import { cachedProfile, loadProfiles } from '../lib/roblox'
import DashboardHeader from '../components/DashboardHeader'
import PayoutForm from '../components/PayoutForm'
import StockForm, { STOCK_KINDS } from '../components/StockForm'
import RobloxAvatar from '../components/RobloxAvatar'

const fmtDateTime = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const asProfileRow = (p) => ({ buyer_user_id: p.roblox_user_id, buyer_username: p.roblox_username })
const PAGE_SIZE = 25

export default function PayoutsAdmin() {
  useNoIndex()
  const { session, signOut } = useAuth()
  const [owner, setOwner] = useState(null)
  const [rows, setRows] = useState([])
  const [directory, setDirectory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | row
  const [adjustments, setAdjustments] = useState([])
  const [stockError, setStockError] = useState('')
  const [stockForm, setStockForm] = useState(null) // null | { kind: 'set'|'add'|'subtract', pool }
  const [pool, setPool] = useState('payout') // stock yang sedang dilihat: payout | username
  const [kindFilter, setKindFilter] = useState('all') // all | payout | adjust
  const [month, setMonth] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [, setTick] = useState(0)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [data, dir, adj] = await Promise.all([
        listPayouts(),
        ownerDirectory().catch(() => []),
        listStockAdjustments().then((a) => { setStockError(''); return a }).catch((e) => { setStockError(e.message); return [] }),
      ])
      setRows(data)
      setAdjustments(adj)
      setDirectory(dir)
      loadProfiles(data.map(asProfileRow)).then(() => setTick((t) => t + 1))
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    checkOwner()
      .then((ok) => { setOwner(ok); if (ok) load(); else setLoading(false) })
      .catch((e) => { setOwner(false); setLoading(false); setError(e.message) })
  }, [load])

  // Realtime: payout dari ceklis Diproses (Discord / website) langsung muncul
  useEffect(() => {
    if (!owner) return
    let t
    const ch = supabase.channel('payouts-realtime')
    const refresh = () => { clearTimeout(t); t = setTimeout(() => load(true), 600) }
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'payout_logs' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_adjustments' }, refresh)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [owner, load])

  useEffect(() => { setPage(1) }, [month, q, kindFilter, pool])
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(t)
  }, [notice])

  const nameOfId = (id) => directory.find((d) => d.id === id)?.name || '–'
  const myName = directory.find((d) => d.id === session?.user?.id)?.name || ''

  const inPool = (x) => (x.pool || 'payout') === pool
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(inPool)
      .filter((r) => !month || new Date(r.paid_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).startsWith(month))
      .filter((r) => !needle || r.roblox_username.toLowerCase().includes(needle) || (r.roblox_display_name || '').toLowerCase().includes(needle) || (r.notes || '').toLowerCase().includes(needle))
  }, [rows, month, q, pool]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const thisMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7)
    const sum = (list) => list.reduce((a, r) => a + Number(r.robux), 0)
    return {
      total: sum(filtered),
      count: filtered.length,
      month: sum(rows.filter(inPool).filter((r) => new Date(r.paid_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).startsWith(thisMonth))),
      people: new Set(filtered.map((r) => r.roblox_user_id || r.roblox_username.toLowerCase())).size,
    }
  }, [filtered, rows, pool]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stock = buku mutasi: penyesuaian manual + payout (otomatis & manual)
  const ledgers = useMemo(() => ({
    payout: buildStockLedger(adjustments, rows, 'payout'),
    username: buildStockLedger(adjustments, rows, 'username'),
  }), [adjustments, rows])
  const ledger = ledgers[pool]
  const lastSetOf = (p) => adjustments.find((a) => a.kind === 'set' && (a.pool || 'payout') === p)
  const entries = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ledger.entries
      .filter((e) => kindFilter === 'all' || (kindFilter === 'payout' ? e.type === 'payout' : e.type !== 'payout'))
      .filter((e) => !month || new Date(e.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).startsWith(month))
      .filter((e) => !needle || (e.type === 'payout'
        ? e.row.roblox_username.toLowerCase().includes(needle) || (e.row.roblox_display_name || '').toLowerCase().includes(needle) || (e.row.notes || '').toLowerCase().includes(needle)
        : (e.row.notes || '').toLowerCase().includes(needle) || STOCK_KINDS[e.type].title.toLowerCase().includes(needle)))
  }, [ledger, kindFilter, month, q])

  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const shown = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleStock(kind, robux, notes) {
    await addStockAdjustment(kind, robux, notes, stockForm.pool)
    setStockForm(null)
    setNotice(kind === 'set' ? 'Stock disesuaikan.' : kind === 'add' ? 'Stock ditambah.' : 'Stock dipotong.')
    load(true)
  }

  async function handleDeleteAdjustment(a) {
    if (!window.confirm(`Hapus "${STOCK_KINDS[a.kind].title}" R$ ${num(a.robux)}?\nStock akan dihitung ulang.`)) return
    try {
      await deleteStockAdjustment(a.id)
      setAdjustments((list) => list.filter((x) => x.id !== a.id))
      setNotice('Penyesuaian dihapus.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleSubmit(values) {
    const isNew = editing === 'new'
    await savePayout(isNew ? null : editing, values)
    setNotice(isNew ? 'Payout tercatat.' : 'Perubahan tersimpan.')
    setEditing(null)
    load(true)
  }

  async function handleDelete(row) {
    if (!window.confirm(`Hapus catatan payout R$ ${num(row.robux)} ke ${row.roblox_username}?`)) return
    try {
      await deletePayout(row)
      setRows((list) => list.filter((r) => r.id !== row.id))
      setNotice('Catatan payout dihapus.')
    } catch (e) {
      setError(e.message)
    }
  }

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Stock', 'Waktu', 'Username', 'Display name', 'User ID', 'Robux', 'Sumber', 'Oleh', 'Catatan'].join(','),
      ...filtered.map((r) => [POOLS[r.pool || 'payout'].name, r.paid_at, esc(r.roblox_username), esc(r.roblox_display_name), r.roblox_user_id ?? '', r.robux,
        r.source === 'auto' ? 'Transaksi' : 'Manual', esc(nameOfId(r.created_by)), esc(r.notes)].join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${pool === 'username' ? 'stock-username' : 'payouts'}${month ? '-' + month : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const closeForm = useCallback(() => setEditing(null), [])
  const header = <DashboardHeader name={myName} email={session?.user?.email} onSignOut={signOut} showTabs={owner !== false} />

  if (owner === false) {
    return (
      <div className="min-h-screen bg-gold-page">
        {header}
        <main className="max-w-xl mx-auto px-5 py-24">
          <div className="card p-6 sm:p-8 shadow-2xl shadow-black/40">
            <p className="eyebrow mb-3">Akses ditolak</p>
            <h1 className="font-display font-bold text-3xl tracking-tight">Akun belum terdaftar sebagai owner</h1>
            {error && <p className="mt-4 text-danger text-sm">{error}</p>}
          </div>
        </main>
      </div>
    )
  }

  const busy = loading || owner === null

  return (
    <div className="min-h-screen bg-gold-page">
      {header}

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bg/60 mb-2">Stock Robux</p>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-bg">Payouts</h1>
            <p className="text-bg/70 mt-1.5 text-sm max-w-[60ch]">
              Dua stock terpisah. Transaksi yang dicentang Diproses otomatis memotong stock sesuai metodenya.
            </p>
          </div>
          <button onClick={() => setEditing('new')} className="btn-dark px-5 py-3">
            <span className="text-lg leading-none -mt-0.5">+</span> Catat pengiriman manual
          </button>
        </div>

        {/* Dua stock: Group (payout) & Username */}
        {stockError && <p role="alert" className="mb-3 rounded-lg border border-danger/40 bg-[#2a1010] px-4 py-3 text-sm text-danger">{stockError}</p>}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4" aria-label="Stock Robux">
          {Object.entries(POOLS).map(([key, info]) => {
            const L = ledgers[key]
            const last = lastSetOf(key)
            const active = pool === key
            return (
              <div key={key} role="button" tabIndex={0} aria-pressed={active}
                onClick={() => setPool(key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPool(key) } }}
                className={`rounded-2xl p-5 sm:p-6 cursor-pointer transition-all shadow-2xl shadow-black/40 border ${
                  active ? 'bg-gradient-to-br from-[#2a2110] via-surface to-surface border-gold ring-2 ring-gold/40' : 'bg-surface border-line hover:border-gold/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-gold">{info.emoji} {info.name}</p>
                    <p className="text-[12px] text-muted">{info.sub}</p>
                  </div>
                  {active && <span className="rounded-md bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-yellow">Ditampilkan</span>}
                </div>
                <p className={`font-display font-extrabold text-4xl tabular-nums tracking-tight mt-2 ${L.stock < 0 ? 'text-danger' : 'text-yellow'}`}>
                  {busy ? '…' : `R$ ${num(L.stock)}`}
                </p>
                <p className="text-[12px] text-muted mt-1">
                  {last ? <>Disamakan R$ {num(last.robux)} · {fmtDateTime(last.happened_at)} · {nameOfId(last.created_by)}</> : 'Belum pernah disamakan. Klik "Sesuaikan".'}
                </p>
                {L.stock < 0 && !busy && <p className="text-[12px] text-danger mt-0.5">Stock minus, sesuaikan dengan angka sebenarnya.</p>}
                <div className="flex flex-wrap gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setStockForm({ kind: 'set', pool: key })} disabled={busy || !!stockError} className="btn-primary px-3 py-2 text-sm">🎯 Sesuaikan</button>
                  <button onClick={() => setStockForm({ kind: 'add', pool: key })} disabled={busy || !!stockError} className="btn-ghost px-3 py-2 text-sm">＋ Tambah</button>
                  <button onClick={() => setStockForm({ kind: 'subtract', pool: key })} disabled={busy || !!stockError} className="btn-ghost px-3 py-2 text-sm">− Potong</button>
                </div>
              </div>
            )
          })}
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-label="Ringkasan payout">
          <Stat label={`Robux keluar · ${POOLS[pool].name}${month ? ' · bulan dipilih' : ''}`} value={`R$ ${num(stats.total)}`} accent />
          <Stat label="Bulan ini" value={`R$ ${num(stats.month)}`} />
          <Stat label={pool === 'username' ? 'Jumlah pengiriman' : 'Jumlah payout'} value={num(stats.count)} />
          <Stat label="Penerima" value={num(stats.people)} />
        </section>

        <section className="card mt-8 shadow-2xl shadow-black/40">
          <div className="p-4 sm:p-5 border-b border-line flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className="label" htmlFor="pq">Cari</label>
              <input id="pq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username, display name, atau catatan" className="field py-2" />
            </div>
            <div className="w-full sm:w-auto">
              <label className="label" htmlFor="pm">Bulan</label>
              <div className="flex gap-1.5">
                <input id="pm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="field py-2 w-full sm:w-auto" />
                {month && <button onClick={() => setMonth('')} className="btn-ghost px-3 py-2" aria-label="Semua bulan">×</button>}
              </div>
            </div>
            <div>
              <span className="label">Jenis</span>
              <div className="flex rounded-lg border border-line-strong overflow-hidden text-sm" role="group" aria-label="Filter jenis mutasi">
                {[['all', 'Semua'], ['payout', 'Payout'], ['adjust', 'Penyesuaian']].map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setKindFilter(v)} aria-pressed={kindFilter === v}
                    className={`px-3 py-2 font-semibold ${kindFilter === v ? 'bg-gold/15 text-yellow' : 'text-muted hover:text-fg'}`}>{t}</button>
                ))}
              </div>
            </div>
            <button onClick={() => load(true)} disabled={busy} className="btn-ghost py-2">Refresh</button>
            <button onClick={exportCsv} disabled={!filtered.length} className="btn-ghost py-2">Export CSV</button>
          </div>

          {error && <p role="alert" className="m-4 sm:m-5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

          {busy ? (
            <p className="py-14 text-center text-muted">Memuat…</p>
          ) : shown.length === 0 ? (
            <p className="py-14 px-5 text-center text-muted">{ledger.entries.length ? 'Tidak ada mutasi yang cocok dengan filter.' : 'Belum ada mutasi. Mulai dengan "Sesuaikan stock", payout tercatat otomatis saat transaksi Via Payouts dicentang Diproses.'}</p>
          ) : (
            <ul>
              {shown.map((e) => {
                const r = e.row
                const delta = e.type === 'set' ? `= R$ ${num(e.robux)}` : e.type === 'add' ? `+ R$ ${num(e.robux)}` : `− R$ ${num(e.robux)}`
                const deltaColor = e.type === 'add' ? 'text-ok' : e.type === 'set' ? 'text-yellow' : 'text-gold-soft'
                let who
                if (e.type === 'payout') {
                  const p = cachedProfile(asProfileRow(r))
                  const display = p?.displayName || r.roblox_display_name || r.roblox_username
                  who = (
                    <div className="flex items-center gap-3 min-w-0">
                      <RobloxAvatar src={p?.avatar} name={display} size={40} />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{display}</p>
                        <p className="text-[13px] text-muted truncate">@{p?.name || r.roblox_username}</p>
                      </div>
                    </div>
                  )
                } else {
                  who = (
                    <div className="flex items-center gap-3 min-w-0">
                      <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full grid place-items-center bg-raised ring-1 ring-line-strong text-lg">
                        {e.type === 'set' ? '🎯' : e.type === 'add' ? '＋' : '−'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{STOCK_KINDS[e.type].title}</p>
                        <p className="text-[13px] text-muted truncate">{r.notes || (e.type === 'set' ? 'Disamakan dengan Roblox' : 'Tanpa catatan')}</p>
                      </div>
                    </div>
                  )
                }
                const src = e.type === 'payout'
                  ? (r.source === 'auto' ? ['Transaksi', 'bg-ok/15 text-ok'] : ['Payout manual', 'bg-gold/15 text-gold-soft'])
                  : ['Penyesuaian', 'bg-line text-muted']
                return (
                  <li key={`${e.type}:${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3.5 border-b border-line last:border-0">
                    <div className="flex-1 basis-56 min-w-0">{who}</div>
                    <div className="w-36">
                      <p className={`font-display font-bold text-lg tabular-nums ${deltaColor}`}>{delta}</p>
                      <p className="text-[12px] text-muted tabular-nums">Stock: R$ {num(e.balance)}</p>
                    </div>
                    <div className="text-[13px] min-w-0 flex-1 basis-56">
                      <p className="tabular-nums">{fmtDateTime(e.at)}</p>
                      <p className="text-muted truncate">
                        <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${src[1]}`}>{src[0]}</span>
                        oleh {nameOfId(r.created_by)}{e.type === 'payout' && r.notes && r.source === 'manual' ? ` · ${r.notes}` : ''}
                      </p>
                    </div>
                    {e.type === 'payout' && r.source === 'auto' ? (
                      <span className="text-[12px] text-muted w-28 text-right" title="Diatur dari ceklis Diproses di transaksi">Otomatis</span>
                    ) : (
                      <div className="flex gap-1.5 text-sm w-28 justify-end">
                        {e.type === 'payout' && <button onClick={() => setEditing(r)} className="px-2.5 py-1.5 rounded-md font-semibold hover:bg-raised hover:text-yellow">Edit</button>}
                        <button onClick={() => (e.type === 'payout' ? handleDelete(r) : handleDeleteAdjustment(r))}
                          className="px-2.5 py-1.5 rounded-md text-muted hover:bg-danger/10 hover:text-danger">Hapus</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 p-4 sm:px-5 border-t border-line text-sm" aria-label="Halaman">
              <button disabled={page === 1} onClick={() => setPage((x) => x - 1)} className="btn-ghost py-1.5">← Sebelumnya</button>
              <span className="text-muted tabular-nums">{page} / {pages}</span>
              <button disabled={page === pages} onClick={() => setPage((x) => x + 1)} className="btn-ghost py-1.5">Berikutnya →</button>
            </nav>
          )}
        </section>
      </main>

      {stockForm && (
        <StockForm kind={stockForm.kind} poolName={POOLS[stockForm.pool].name} current={ledgers[stockForm.pool].stock}
          onCancel={() => setStockForm(null)} onSubmit={handleStock} />
      )}
      {editing && (
        <PayoutForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} defaultPool={pool}
          onCancel={closeForm} onSubmit={handleSubmit} />
      )}

      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 rounded-lg border border-gold/40 bg-raised px-4 py-3 text-sm font-semibold shadow-2xl shadow-black/60">
          <span className="h-2 w-2 rounded-full bg-yellow" aria-hidden="true" />
          {notice}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className={`card p-4 sm:p-5 shadow-xl shadow-black/30 ${accent ? 'border-gold/50' : ''}`}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`font-display font-bold mt-2 tabular-nums tracking-tight break-words ${accent ? 'text-yellow text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>{value}</p>
    </div>
  )
}

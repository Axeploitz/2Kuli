import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNoIndex } from '../lib/useNoIndex'
import { fmtDate, num, rupiah } from '../lib/format'
import {
  checkOwner, createTransaction, deleteTransaction, listTransactions, signedUrls, updateTransaction,
} from '../lib/transactions'
import TransactionForm from '../components/TransactionForm'
import ProofViewer from '../components/ProofViewer'
import Logo from '../components/Logo'
import TopBuyers from '../components/TopBuyers'
import RobloxAvatar from '../components/RobloxAvatar'
import { cachedProfile, loadProfiles } from '../lib/roblox'

const PAGE_SIZE = 20

const SORTS = {
  'date-desc': { label: 'Terbaru', fn: (a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at) },
  'date-asc': { label: 'Terlama', fn: (a, b) => a.purchase_date.localeCompare(b.purchase_date) || a.created_at.localeCompare(b.created_at) },
  'amount-desc': { label: 'Nominal terbesar', fn: (a, b) => b.amount - a.amount },
  'robux-desc': { label: 'Robux terbanyak', fn: (a, b) => b.robux - a.robux },
}

export default function Dashboard() {
  useNoIndex()
  const { session, signOut } = useAuth()
  const [owner, setOwner] = useState(null) // null = sedang dicek
  const [rows, setRows] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [, setProfilesTick] = useState(0) // render ulang setelah foto profil Roblox dimuat

  const [month, setMonth] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState(null) // null | 'new' | row
  const [viewing, setViewing] = useState(null) // row

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listTransactions()
      setRows(data)
      loadProfiles(data).then(() => setProfilesTick((t) => t + 1))
      setUrls(await signedUrls(data.map((r) => r.proof_path)))
    } catch (e) {
      setError('Gagal memuat data: ' + e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    checkOwner()
      .then((ok) => { setOwner(ok); if (ok) load(); else setLoading(false) })
      .catch((e) => { setOwner(false); setLoading(false); setError(e.message) })
  }, [load])

  useEffect(() => { setPage(1) }, [month, q, sort])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(t)
  }, [notice])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => (!month || r.purchase_date.startsWith(month)))
      .filter((r) => (!needle || r.buyer_username.toLowerCase().includes(needle) || (r.buyer_display_name || '').toLowerCase().includes(needle) || (r.notes || '').toLowerCase().includes(needle)))
      .sort(SORTS[sort].fn)
  }, [rows, month, q, sort])

  const stats = useMemo(() => {
    const omzet = filtered.reduce((a, r) => a + Number(r.amount), 0)
    const robux = filtered.reduce((a, r) => a + Number(r.robux), 0)
    return { omzet, robux, count: filtered.length, rate: robux ? (omzet / robux) * 1000 : 0 }
  }, [filtered])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleSubmit(values, proof) {
    if (editing === 'new') await createTransaction(values, proof)
    else await updateTransaction(editing, values, proof)
    setNotice(editing === 'new' ? 'Transaksi tersimpan.' : 'Perubahan tersimpan.')
    setEditing(null)
    load()
  }

  async function handleDelete(row) {
    if (!window.confirm(`Hapus transaksi ${row.buyer_username} (${num(row.robux)} Robux) tanggal ${fmtDate(row.purchase_date)}?\nFoto bukti juga ikut terhapus.`)) return
    try {
      await deleteTransaction(row)
      setRows((list) => list.filter((x) => x.id !== row.id))
      setNotice('Transaksi dihapus.')
    } catch (e) {
      setError('Gagal menghapus: ' + e.message)
    }
  }

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Tanggal', 'Username', 'Nominal', 'Robux', 'Catatan', 'Ada bukti'].join(','),
      ...filtered.map((r) => [r.purchase_date, esc(r.buyer_username), r.amount, r.robux, esc(r.notes), r.proof_path ? 'ya' : 'tidak'].join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `transaksi-robux${month ? '-' + month : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const closeForm = useCallback(() => setEditing(null), [])
  const closeViewer = useCallback(() => setViewing(null), [])

  const header = (
    <header className="sticky top-0 z-20 bg-bg border-b border-black/40 shadow-lg shadow-black/20">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/"><Logo size={28} /></Link>
          <span className="hidden sm:inline text-line-strong">/</span>
          <span className="hidden sm:inline text-sm text-muted">Dashboard</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden md:inline text-muted">{session?.user?.email}</span>
          <button onClick={signOut} className="btn-ghost py-1.5 px-3">Keluar</button>
        </div>
      </div>
    </header>
  )

  if (owner === false) {
    return (
      <div className="min-h-screen bg-gold-page">
        {header}
        <main className="max-w-xl mx-auto px-5 py-24">
          <div className="card p-6 sm:p-8 shadow-2xl shadow-black/40">
          <p className="eyebrow mb-3">Akses ditolak</p>
          <h1 className="font-display font-bold text-3xl tracking-tight mb-4">Akun belum terdaftar sebagai owner</h1>
          <p className="text-muted leading-relaxed">
            Akun <span className="text-fg font-semibold">{session?.user?.email}</span> belum ada di tabel{' '}
            <code className="rounded bg-raised px-1.5 py-0.5 text-gold-soft">owners</code> di Supabase. Tambahkan email ini lalu muat ulang halaman.
          </p>
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
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bg/60 mb-2">Penjualan</p>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-bg">Transaksi Robux</h1>
          </div>
          <button onClick={() => setEditing('new')} className="btn-dark px-5 py-3">
            <span className="text-lg leading-none -mt-0.5">+</span> Transaksi baru
          </button>
        </div>

        {/* Ringkasan */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-label="Ringkasan">
          <Stat label="Total nominal" value={rupiah(stats.omzet)} accent month={month} />
          <Stat label="Robux terjual" value={`R$ ${num(stats.robux)}`} month={month} />
          <Stat label="Jumlah transaksi" value={num(stats.count)} month={month} />
          <Stat label="Rata-rata / 1.000 R$" value={stats.robux ? rupiah(stats.rate) : '–'}
            sub={stats.robux ? 'Total nominal ÷ Robux × 1.000' : 'Muncul setelah ada transaksi'} month={month} />
        </section>

        <TopBuyers rows={filtered} month={month} loading={busy} />

        {/* Data */}
        <section className="card mt-8 shadow-2xl shadow-black/40">
          <div className="p-4 sm:p-5 border-b border-line flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className="label" htmlFor="q">Cari</label>
              <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username, display name, atau catatan"
                className="field py-2" />
            </div>
            <div className="w-full sm:w-auto">
              <label className="label" htmlFor="month">Bulan</label>
              <div className="flex gap-1.5">
                <input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="field py-2 w-full sm:w-auto" />
                {month && <button onClick={() => setMonth('')} className="btn-ghost px-3 py-2" aria-label="Tampilkan semua bulan">×</button>}
              </div>
            </div>
            <div className="flex-1 sm:flex-none">
              <label className="label" htmlFor="sort">Urutkan</label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="field py-2 w-full sm:w-auto pr-8">
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button onClick={exportCsv} disabled={!filtered.length} className="btn-ghost py-2">Export CSV</button>
          </div>

          {error && <p role="alert" className="m-4 sm:m-5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

          {/* Tabel (desktop) */}
          <div className="hidden md:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.1em] text-muted border-b border-line">
                  <th className="py-3 pl-5 pr-3 font-semibold">Tanggal</th>
                  <th className="py-3 px-3 font-semibold">Buyer</th>
                  <th className="py-3 px-3 font-semibold text-right">Robux</th>
                  <th className="py-3 px-3 font-semibold text-right">Nominal</th>
                  <th className="py-3 px-3 font-semibold">Bukti</th>
                  <th className="py-3 pr-5"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {busy && <tr><td colSpan="6" className="py-14 text-center text-muted">Memuat…</td></tr>}
                {!busy && shown.length === 0 && <tr><td colSpan="6" className="py-14 text-center text-muted"><Empty filtered={rows.length > 0} /></td></tr>}
                {!busy && shown.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-raised/60 transition-colors">
                    <td className="py-3.5 pl-5 pr-3 whitespace-nowrap text-muted tabular-nums">{fmtDate(r.purchase_date)}</td>
                    <td className="py-3.5 px-3"><Buyer r={r} /></td>
                    <td className="py-3.5 px-3 text-right whitespace-nowrap tabular-nums text-gold-soft">R$ {num(r.robux)}</td>
                    <td className="py-3.5 px-3 text-right whitespace-nowrap tabular-nums font-semibold">{rupiah(r.amount)}</td>
                    <td className="py-3.5 px-3"><Thumb row={r} url={urls[r.proof_path]} onOpen={setViewing} /></td>
                    <td className="py-3.5 pr-5 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(r)} className="px-2.5 py-1.5 rounded-md text-sm font-semibold text-fg hover:bg-raised hover:text-yellow">Edit</button>
                      <button onClick={() => handleDelete(r)} className="px-2.5 py-1.5 rounded-md text-sm text-muted hover:bg-danger/10 hover:text-danger">Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Kartu (mobile) */}
          <ul className="md:hidden">
            {busy && <li className="py-12 text-center text-muted">Memuat…</li>}
            {!busy && shown.length === 0 && <li className="py-12 px-5 text-center text-muted"><Empty filtered={rows.length > 0} /></li>}
            {!busy && shown.map((r) => (
              <li key={r.id} className="p-4 border-b border-line last:border-0 flex gap-3.5">
                <Thumb row={r} url={urls[r.proof_path]} onOpen={setViewing} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-3">
                    <Buyer r={r} compact />
                    <p className="font-semibold whitespace-nowrap tabular-nums">{rupiah(r.amount)}</p>
                  </div>
                  <p className="text-sm text-muted tabular-nums">{fmtDate(r.purchase_date)} · <span className="text-gold-soft">R$ {num(r.robux)}</span></p>
                  {r.notes && <p className="text-sm text-muted truncate">{r.notes}</p>}
                  <div className="mt-2.5 flex gap-2 text-sm">
                    <button onClick={() => setEditing(r)} className="btn-ghost py-1 px-3">Edit</button>
                    <button onClick={() => handleDelete(r)} className="btn-danger py-1 px-3">Hapus</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 p-4 sm:px-5 border-t border-line text-sm" aria-label="Halaman">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost py-1.5">← Sebelumnya</button>
              <span className="text-muted tabular-nums">{page} / {pages}</span>
              <button disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="btn-ghost py-1.5">Berikutnya →</button>
            </nav>
          )}
        </section>
      </main>

      {editing && (
        <TransactionForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          proofUrl={editing !== 'new' ? urls[editing.proof_path] : null}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />
      )}
      {viewing && urls[viewing.proof_path] && (
        <ProofViewer url={urls[viewing.proof_path]} caption={`${viewing.buyer_username} · ${fmtDate(viewing.purchase_date)} · R$ ${num(viewing.robux)}`} onClose={closeViewer} />
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

function Buyer({ r, compact = false }) {
  const p = cachedProfile(r)
  const display = p?.displayName || r.buyer_display_name || r.buyer_username
  return (
    <div className="flex items-center gap-3 min-w-0">
      <RobloxAvatar src={p?.avatar} name={display} size={compact ? 28 : 36} />
      <div className="min-w-0">
        <p className="font-semibold truncate">{display}</p>
        <p className="text-[13px] text-muted truncate">@{p?.name || r.buyer_username}</p>
        {!compact && r.notes && <p className="text-[13px] text-muted/80 truncate max-w-[22rem]">{r.notes}</p>}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent, month }) {
  return (
    <div className={`card p-4 sm:p-5 shadow-xl shadow-black/30 ${accent ? 'border-gold/50' : ''}`}>
      <p className="text-[13px] text-muted">{label}{month && <span className="text-gold"> · bulan ini</span>}</p>
      <p className={`font-display font-bold mt-2 tabular-nums tracking-tight break-words ${accent ? 'text-yellow text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>{value}</p>
      {sub && <p className="text-[13px] text-muted mt-1">{sub}</p>}
    </div>
  )
}

function Thumb({ row, url, onOpen }) {
  const base = 'w-14 h-14 rounded-lg shrink-0'
  if (!row.proof_path) return <span className={`${base} inline-grid place-items-center border border-dashed border-line-strong text-[11px] text-muted`}>Kosong</span>
  if (!url) return <span className={`${base} inline-block bg-raised animate-pulse`} />
  return (
    <button onClick={() => onOpen(row)} className={`${base} overflow-hidden border border-line-strong hover:border-gold transition-colors`} aria-label={`Lihat bukti ${row.buyer_username}`}>
      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
    </button>
  )
}

function Empty({ filtered }) {
  return filtered ? 'Tidak ada transaksi yang cocok dengan filter.' : 'Belum ada transaksi. Klik "Transaksi baru" untuk mencatat yang pertama.'
}

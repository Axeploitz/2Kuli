import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNoIndex } from '../lib/useNoIndex'
import { fmtDate, num, rupiah } from '../lib/format'
import {
  checkOwner, createTransaction, deleteSplit, deleteTransaction, listSplits, listTransactions, ownerDirectory, canVerifyPayment, setTxStatus, setSplitAck,
  signedUrls, splitSaldo, updateTransaction,
} from '../lib/transactions'
import TopupToggle from '../components/TopupToggle'
import SaldoShares, { accountsOf, ackOf } from '../components/SaldoShares'
import TransactionForm from '../components/TransactionForm'
import ProofViewer from '../components/ProofViewer'
import DashboardHeader from '../components/DashboardHeader'
import TopBuyers from '../components/TopBuyers'
import RobloxAvatar from '../components/RobloxAvatar'
import { cachedProfile, loadProfiles } from '../lib/roblox'
import { community } from '../config/community'
import { supabase } from '../lib/supabase'

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
  const [splits, setSplits] = useState([])
  const [directory, setDirectory] = useState([]) // [{ id, email, name }] dari user Supabase
  const [splitting, setSplitting] = useState(false)
  const [ackBusy, setAckBusy] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [canVerify, setCanVerify] = useState(false) // hanya Thalvior
  const [statusBusy, setStatusBusy] = useState({}) // { 'id:field': true }
  const [, setProfilesTick] = useState(0) // render ulang setelah foto profil Roblox dimuat

  const [month, setMonth] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState(null) // null | 'new' | row
  const [viewing, setViewing] = useState(null) // row

  // silent = refresh di tempat (tabel tidak dikosongkan)
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const data = await listTransactions()
      setRows(data)
      loadProfiles(data).then(() => setProfilesTick((t) => t + 1))
      // Kalau migrasi 003 belum dijalankan, transaksi tetap tampil
      const [sp, dir] = await Promise.all([
        listSplits().catch((e) => { setError(e.message); return [] }),
        ownerDirectory().catch(() => []),
      ])
      setSplits(sp)
      setDirectory(dir)
      canVerifyPayment().then(setCanVerify)
      setUrls(await signedUrls(data.map((r) => r.proof_path)))
    } catch (e) {
      setError('Gagal memuat data: ' + e.message)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    checkOwner()
      .then((ok) => { setOwner(ok); if (ok) load(); else setLoading(false) })
      .catch((e) => { setOwner(false); setLoading(false); setError(e.message) })
  }, [load])

  // Realtime: transaksi baru dari bot Discord / perubahan owner lain langsung muncul tanpa refresh
  useEffect(() => {
    if (!owner) return
    let t
    const ch = supabase.channel('dashboard-realtime')
    const refresh = () => {
      clearTimeout(t)
      t = setTimeout(() => load(true), 600) // gabungkan perubahan beruntun
    }
    // Transaksi, bagi 2, dan ceklis owner lain langsung muncul tanpa refresh
    for (const table of ['robux_transactions', 'saldo_splits', 'saldo_split_acks']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    }
    ch.subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [owner, load])

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

  // Saldo selalu dihitung dari SEMUA transaksi (tidak ikut filter bulan)
  const totalAll = useMemo(() => rows.reduce((a, r) => a + Number(r.amount), 0), [rows])
  const splitTotal = splits.reduce((a, s) => a + Number(s.amount), 0)
  const saldo = totalAll - splitTotal
  const half = Math.floor(saldo / 2)

  // Nama pencatat: cocokkan ID akun (created_by) dengan user Supabase
  const nameOf = (row) => {
    const o = directory.find((d) => (row?.created_by && d.id === row.created_by) ||
      (row?.created_by_email && d.email.toLowerCase() === row.created_by_email.toLowerCase()))
    return o?.name || (row?.created_by_email ? row.created_by_email.split('@')[0] : '–')
  }
  const myName = nameOf({ created_by: session?.user?.id, created_by_email: session?.user?.email })

  // Transaksi yang dibuat sebelum Bagi 2 terakhir sudah ikut dibagi → tidak bisa dihapus
  const lastSplitAt = splits[0]?.created_at
  const inSplit = (r) => !!lastSplitAt && r.created_at <= lastSplitAt
  const LOCKED_TIP = 'Sudah ikut Bagi 2, tidak bisa dihapus. Gunakan Edit kalau ada salah catat.'

  // Bagi 2 berikutnya baru boleh setelah bagi 2 terakhir diceklis kedua owner
  const lastSplit = splits[0]
  const waitingFor = lastSplit ? accountsOf(directory).filter(({ acc }) => !ackOf(lastSplit, acc)).map(({ owner }) => owner.name) : []
  const splitLocked = waitingFor.length > 0

  async function handleAck(split, checked) {
    const me = session?.user?.id
    setAckBusy(`${split.id}:${me}`)
    try {
      await setSplitAck(split.id, me, checked)
      await load(true)
      setNotice(checked ? 'Bagianmu ditandai sudah diterima.' : 'Ceklis dibatalkan.')
    } catch (e) {
      setError('Gagal menyimpan ceklis: ' + e.message)
    }
    setAckBusy('')
  }

  async function handleSplit() {
    if (half <= 0 || splitLocked) return
    if (!window.confirm(`Bagi 2 saldo ${rupiah(half * 2)}?\n\nJustAxe dan Thalvior masing-masing mendapat ${rupiah(half)}.\nSaldo kembali ke ${rupiah(saldo - half * 2)}.`)) return
    setSplitting(true)
    try {
      const row = await splitSaldo()
      setSplits((list) => [{ ...row, saldo_split_acks: [] }, ...list])
      setNotice(`Saldo dibagi: ${rupiah(row.share)} untuk tiap owner.`)
    } catch (e) {
      setError('Gagal membagi saldo: ' + e.message)
    }
    setSplitting(false)
  }

  async function handleUndoSplit(s) {
    if (!window.confirm(`Batalkan pembagian ${rupiah(s.amount)}?\nUang ${rupiah(s.amount)} kembali ke Saldo.`)) return
    try {
      await deleteSplit(s.id)
      setSplits((list) => list.filter((x) => x.id !== s.id))
      setNotice('Pembagian dibatalkan.')
    } catch (e) {
      setError('Gagal membatalkan: ' + e.message)
    }
  }

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleSubmit(values, proof) {
    if (editing === 'new') await createTransaction(values, proof)
    else await updateTransaction(editing, values, proof)
    setNotice(editing === 'new' ? 'Transaksi tersimpan.' : 'Perubahan tersimpan.')
    setEditing(null)
    load(true)
  }

  // Ceklis status: langsung berubah di layar, dibatalkan kalau server menolak
  async function toggleStatus(row, field) {
    const key = `${row.id}:${field}`
    if (statusBusy[key]) return
    const value = !row[field]
    const label = field === 'payment_verified' ? 'Uang masuk' : 'Diproses'
    if (!value && !window.confirm(`Hapus ceklis "${label}" untuk transaksi ${row.buyer_username}?`)) return
    setStatusBusy((b) => ({ ...b, [key]: true }))
    const by = field === 'payment_verified' ? 'payment_verified_by' : 'processed_by'
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, [field]: value, [by]: value ? session?.user?.id : null } : r)))
    try {
      const updated = await setTxStatus(row.id, field, value)
      setRows((list) => list.map((r) => (r.id === row.id ? updated : r)))
    } catch (e) {
      setRows((list) => list.map((r) => (r.id === row.id ? row : r)))
      setError('Gagal mengubah status: ' + e.message)
    }
    setStatusBusy((b) => { const n = { ...b }; delete n[key]; return n })
  }

  const statusProps = (r) => ({
    row: r,
    canVerify,
    myId: session?.user?.id,
    busy: statusBusy,
    onToggle: toggleStatus,
    nameOfId: (id) => nameOf({ created_by: id }),
  })

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
      ['Tanggal', 'Username', 'Nominal', 'Robux', 'Catatan', 'Ada bukti', 'Dicatat oleh', 'Uang masuk', 'Diproses'].join(','),
      ...filtered.map((r) => [r.purchase_date, esc(r.buyer_username), r.amount, r.robux, esc(r.notes), r.proof_path ? 'ya' : 'tidak', esc(nameOf(r)), r.payment_verified ? 'ya' : 'belum', r.processed ? 'ya' : 'belum'].join(',')),
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

  const header = <DashboardHeader name={directory.length ? myName : ''} email={session?.user?.email} onSignOut={signOut} showTabs={owner !== false} />

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
          <div className="flex flex-wrap items-start gap-3">
            <TopupToggle nameOfId={(id) => nameOf({ created_by: id })} />
            <button onClick={() => setEditing('new')} className="btn-dark px-5 py-3">
              <span className="text-lg leading-none -mt-0.5">+</span> Transaksi baru
            </button>
          </div>
        </div>

        {/* Ringkasan */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4" aria-label="Ringkasan">
          <Stat label="Total nominal" value={rupiah(stats.omzet)} accent month={month} />
          <Stat label="Robux terjual" value={`R$ ${num(stats.robux)}`} month={month} />
          <Stat label="Jumlah transaksi" value={num(stats.count)} month={month} />
          <Stat label="Rata-rata / 1.000 R$" value={stats.robux ? rupiah(stats.rate) : '–'}
            sub={stats.robux ? 'Total nominal ÷ Robux × 1.000' : 'Muncul setelah ada transaksi'} month={month} />

          {/* Saldo: total nominal yang belum dibagi */}
          <div className="col-span-2 lg:col-span-1 rounded-xl p-4 sm:p-5 bg-gradient-to-br from-[#2a2110] via-surface to-surface border border-gold/60 shadow-xl shadow-black/30 flex flex-col">
            <p className="text-[13px] text-muted">Saldo <span className="text-gold">· belum dibagi</span></p>
            <p className={`font-display font-bold mt-2 tabular-nums tracking-tight break-words text-2xl sm:text-3xl ${saldo < 0 ? 'text-danger' : 'text-yellow'}`}>
              {busy ? '…' : rupiah(saldo)}
            </p>
            <p className="text-[13px] text-muted mt-1">
              {saldo < 0 ? 'Minus: ada transaksi dihapus setelah dibagi' : half > 0 ? `${rupiah(half)} / owner` : 'Tidak ada yang bisa dibagi'}
            </p>
            {splitLocked && !busy && (
              <p className="text-[12px] text-gold-soft mt-1.5">🔒 Menunggu ceklis {waitingFor.join(' & ')} untuk bagi 2 #{splits.length}</p>
            )}
            <button onClick={handleSplit} disabled={busy || splitting || half <= 0 || splitLocked} className="btn-primary mt-3 lg:mt-auto py-2 w-full"
              title={splitLocked ? 'Bagi 2 sebelumnya belum diceklis kedua owner' : undefined}>
              {splitting ? 'Membagi…' : 'Bagi 2'}
            </button>
          </div>
        </section>

        <SaldoShares splits={splits} directory={directory} rows={rows} loading={busy} onUndo={handleUndoSplit} nameOf={nameOf}
          myId={session?.user?.id} ackBusy={ackBusy} onAck={handleAck} />

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
            <button onClick={() => load(true)} disabled={busy || refreshing} className="btn-ghost py-2" title="Muat ulang data transaksi">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}>
                <path fillRule="evenodd" d="M15.3 4.7A7 7 0 1 0 17 10a1 1 0 1 0-2 0 5 5 0 1 1-1.46-3.54L12 8h5V3l-1.7 1.7Z" clipRule="evenodd" />
              </svg>
              {refreshing ? 'Memuat…' : 'Refresh'}
            </button>
            <button onClick={exportCsv} disabled={!filtered.length} className="btn-ghost py-2">Export CSV</button>
          </div>

          {error && <p role="alert" className="m-4 sm:m-5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

          {/* Tabel (desktop) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.1em] text-muted border-b border-line">
                  <th className="py-3 pl-5 pr-3 font-semibold">Tanggal</th>
                  <th className="py-3 px-3 font-semibold">Buyer</th>
                  <th className="py-3 px-3 font-semibold text-right">Robux</th>
                  <th className="py-3 px-3 font-semibold text-right">Nominal</th>
                  <th className="py-3 px-3 font-semibold">Bukti</th>
                  <th className="py-3 px-3 font-semibold">Dicatat oleh</th>
                  <th className="py-3 pr-5"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {busy && <tr><td colSpan="7" className="py-14 text-center text-muted">Memuat…</td></tr>}
                {!busy && shown.length === 0 && <tr><td colSpan="7" className="py-14 text-center text-muted"><Empty filtered={rows.length > 0} /></td></tr>}
                {!busy && shown.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-raised/60 transition-colors">
                    <td className="py-3.5 pl-5 pr-3 whitespace-nowrap text-muted tabular-nums">{fmtDate(r.purchase_date)}</td>
                    <td className="py-3.5 px-3"><Buyer r={r} /></td>
                    <td className="py-3.5 px-3 text-right whitespace-nowrap tabular-nums text-gold-soft">R$ {num(r.robux)}</td>
                    <td className="py-3.5 px-3 text-right whitespace-nowrap tabular-nums font-semibold">{rupiah(r.amount)}</td>
                    <td className="py-3.5 px-3"><Thumb row={r} url={urls[r.proof_path]} onOpen={setViewing} /></td>
                    <td className="py-3.5 px-3 whitespace-nowrap"><Recorder name={nameOf(r)} /></td>
                    <td className="py-3.5 pr-5 text-right whitespace-nowrap">
                      <StatusChecks {...statusProps(r)} />
                      <button onClick={() => setEditing(r)} className="px-2.5 py-1.5 rounded-md text-sm font-semibold text-fg hover:bg-raised hover:text-yellow">Edit</button>
                      <button onClick={() => handleDelete(r)} disabled={inSplit(r)} title={inSplit(r) ? LOCKED_TIP : undefined}
                        className="px-2.5 py-1.5 rounded-md text-sm text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed">
                        {inSplit(r) ? '🔒 Hapus' : 'Hapus'}
                      </button>
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
                  <p className="text-[13px] text-muted mt-0.5">Dicatat oleh <span className="text-fg font-semibold">{nameOf(r)}</span></p>
                  {r.notes && <p className="text-sm text-muted truncate">{r.notes}</p>}
                  <div className="mt-2.5 flex flex-wrap gap-2 text-sm">
                    <StatusChecks {...statusProps(r)} />
                    <button onClick={() => setEditing(r)} className="btn-ghost py-1 px-3">Edit</button>
                    <button onClick={() => handleDelete(r)} disabled={inSplit(r)} title={inSplit(r) ? LOCKED_TIP : undefined}
                      className="btn-danger py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed">{inSplit(r) ? '🔒 Hapus' : 'Hapus'}</button>
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

const fmtStamp = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// Dua ceklis di kiri tombol Edit: "Uang masuk" (khusus Thalvior) dan "Diproses" (semua owner)
function StatusChecks({ row, canVerify, myId, busy, onToggle, nameOfId }) {
  const paid = row.payment_verified
  const done = row.processed
  // Sudah diproses owner lain → terkunci (hanya yang mencentang yang bisa membatalkan)
  const lockedDone = done && row.processed_by && row.processed_by !== myId
  return (
    <span className="inline-flex gap-1.5 align-middle mr-1">
      <CheckPill
        checked={paid}
        label="Uang masuk"
        tone="ok"
        busy={busy[`${row.id}:payment_verified`]}
        disabled={!canVerify}
        title={paid
          ? `Uang sudah masuk · divalidasi ${nameOfId(row.payment_verified_by)}${row.payment_verified_at ? ', ' + fmtStamp(row.payment_verified_at) : ''}`
          : canVerify ? 'Tandai uang sudah masuk rekening' : 'Belum divalidasi · hanya Thalvior yang bisa memvalidasi'}
        onClick={() => onToggle(row, 'payment_verified')}
      />
      <CheckPill
        checked={done}
        label="Diproses"
        by={done && row.processed_by ? nameOfId(row.processed_by) : ''}
        tone="gold"
        busy={busy[`${row.id}:processed`]}
        disabled={lockedDone}
        title={done
          ? `Diproses oleh ${nameOfId(row.processed_by)}${row.processed_at ? ', ' + fmtStamp(row.processed_at) : ''}${lockedDone ? ' · terkunci, hanya dia yang bisa membatalkan' : ' · klik untuk membatalkan'}`
          : 'Tandai transaksi sudah diproses'}
        onClick={() => onToggle(row, 'processed')}
      />
    </span>
  )
}

function CheckPill({ checked, label, by, tone, busy, disabled, title, onClick }) {
  const on = tone === 'ok'
    ? 'border-ok/50 bg-ok/15 text-ok'
    : 'border-gold/60 bg-gold/15 text-yellow'
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} title={title}
      onClick={onClick} disabled={disabled || busy}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
        checked ? on : 'border-line-strong text-muted hover:text-fg hover:border-fg/40'} ${disabled && !checked ? 'opacity-50' : ''} ${busy ? 'opacity-60' : ''}`}>
      <span aria-hidden="true" className={`grid place-items-center w-4 h-4 rounded-[5px] border transition-colors ${
        checked ? (tone === 'ok' ? 'bg-ok border-ok' : 'bg-yellow border-yellow') : 'border-current'}`}>
        {checked && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-bg"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>
        )}
      </span>
      {label}
      {by && <span className="font-normal opacity-90">· {by}</span>}
      {disabled && (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="w-3 h-3"><path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" /></svg>
      )}
    </button>
  )
}

function Recorder({ name }) {
  const o = community.owners.find((x) => x.name === name)
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <RobloxAvatar src={o?.photo ? `/images/owners/${o.photo}` : null} name={name} size={24} />
      <span className={o ? 'font-semibold' : 'text-muted'}>{name}</span>
    </span>
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

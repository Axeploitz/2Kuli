import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNoIndex } from '../lib/useNoIndex'
import { fmtDay } from '../lib/format'
import { checkOwner, ownerDirectory } from '../lib/transactions'
import { deleteUpdate, imageUrl, listAllUpdates, patchUpdate, saveUpdate } from '../lib/updates'
import DashboardHeader from '../components/DashboardHeader'
import UpdateForm from '../components/UpdateForm'

export default function UpdatesAdmin() {
  useNoIndex()
  const { session, signOut } = useAuth()
  const [owner, setOwner] = useState(null)
  const [rows, setRows] = useState([])
  const [directory, setDirectory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | row

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [data, dir] = await Promise.all([listAllUpdates(), ownerDirectory().catch(() => [])])
      setRows(data)
      setDirectory(dir)
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

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(t)
  }, [notice])

  const nameOfId = (id) => directory.find((d) => d.id === id)?.name || '–'
  const myName = directory.find((d) => d.id === session?.user?.id)?.name || ''

  async function handleSubmit(values, image) {
    const isNew = editing === 'new'
    await saveUpdate(isNew ? null : editing, values, image)
    setNotice(isNew ? (values.published ? 'Update diterbitkan.' : 'Draf tersimpan.') : 'Perubahan tersimpan.')
    setEditing(null)
    load()
  }

  async function toggle(row, field) {
    try {
      const updated = await patchUpdate(row.id, { [field]: !row[field] })
      setRows((list) => list.map((r) => (r.id === row.id ? updated : r)))
      setNotice(field === 'published' ? (updated.published ? 'Update ditampilkan di website.' : 'Update disembunyikan (draf).') : (updated.pinned ? 'Update disematkan.' : 'Sematan dilepas.'))
      if (field === 'pinned') load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Hapus update "${row.title}"?\nGambarnya juga ikut terhapus.`)) return
    try {
      await deleteUpdate(row)
      setRows((list) => list.filter((r) => r.id !== row.id))
      setNotice('Update dihapus.')
    } catch (e) {
      setError('Gagal menghapus: ' + e.message)
    }
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
  const live = rows.filter((r) => r.published).length

  return (
    <div className="min-h-screen bg-gold-page">
      {header}

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bg/60 mb-2">Halaman landing</p>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-bg">Update</h1>
            <p className="text-bg/70 mt-1.5 text-sm">
              {busy ? 'Memuat…' : `${live} tayang · ${rows.length - live} draf. 6 update teratas tampil di bagian "Update terbaru" halaman utama.`}
            </p>
          </div>
          <button onClick={() => setEditing('new')} className="btn-dark px-5 py-3">
            <span className="text-lg leading-none -mt-0.5">+</span> Update baru
          </button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-[#2a1010] px-4 py-3 text-sm text-danger">{error}</p>}

        <section className="card shadow-2xl shadow-black/40">
          {busy ? (
            <ul>{[0, 1, 2].map((i) => <li key={i} className="m-4 h-24 rounded-xl bg-raised animate-pulse" />)}</ul>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-semibold">Belum ada update.</p>
              <p className="text-muted text-sm mt-1">Klik "Update baru" untuk membuat pengumuman pertama. Bagian Update di halaman utama baru muncul setelah ada update yang tayang.</p>
            </div>
          ) : (
            <ul>
              {rows.map((r) => {
                const img = imageUrl(r.image_path)
                return (
                  <li key={r.id} className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5 border-b border-line last:border-0">
                    <div className="w-full sm:w-40 aspect-[16/9] rounded-lg overflow-hidden shrink-0 border border-line-strong bg-raised grid place-items-center">
                      {img ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <span className="font-display font-bold text-gold/60 text-sm">{r.tag}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${r.published ? 'bg-ok/15 text-ok' : 'bg-line text-muted'}`}>
                          {r.published ? 'Tayang' : 'Draf'}
                        </span>
                        {r.pinned && <span className="rounded-md bg-yellow/15 px-2 py-0.5 text-[11px] font-bold text-yellow">Disematkan</span>}
                        <span className="rounded-md bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold-soft">{r.tag}</span>
                        {r.experience && <span className="text-[12px] text-muted">· {r.experience}</span>}
                      </div>
                      <p className="font-semibold text-[17px] leading-snug">{r.title}</p>
                      <p className="text-sm text-muted line-clamp-2 mt-0.5 whitespace-pre-line">{r.body}</p>
                      <p className="text-[12px] text-muted mt-1.5">{fmtDay(r.created_at)} · oleh {nameOfId(r.created_by)}</p>
                    </div>
                    <div className="flex sm:flex-col gap-1.5 shrink-0 text-sm">
                      <button onClick={() => setEditing(r)} className="btn-ghost py-1.5 px-3 flex-1">Edit</button>
                      <button onClick={() => toggle(r, 'published')} className="btn-ghost py-1.5 px-3 flex-1">{r.published ? 'Sembunyikan' : 'Tayangkan'}</button>
                      <button onClick={() => toggle(r, 'pinned')} className="btn-ghost py-1.5 px-3 flex-1">{r.pinned ? 'Lepas sematan' : 'Sematkan'}</button>
                      <button onClick={() => handleDelete(r)} className="btn-danger py-1.5 px-3 flex-1">Hapus</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {editing && (
        <UpdateForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing}
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

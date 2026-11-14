import { useEffect, useRef, useState } from 'react'
import { community } from '../config/community'
import { UPDATE_TAGS, imageUrl } from '../lib/updates'

export default function UpdateForm({ initial, onCancel, onSubmit }) {
  const editing = !!initial
  const [form, setForm] = useState(() => ({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    tag: initial?.tag ?? 'Update',
    experience: initial?.experience ?? '',
    published: initial?.published ?? true,
    pinned: initial?.pinned ?? false,
  }))
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(imageUrl(initial?.image_path))
  const [removeImage, setRemoveImage] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])
  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function pickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('File harus berupa gambar.')
    if (f.size > 15 * 1024 * 1024) return setError('Ukuran gambar maksimal 15 MB.')
    setError('')
    setFile(f)
    setRemoveImage(false)
    setPreview(URL.createObjectURL(f))
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    setRemoveImage(true)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const title = form.title.trim()
    const body = form.body.trim()
    if (!title) return setError('Judul wajib diisi.')
    if (!body) return setError('Isi update wajib diisi.')
    setSaving(true)
    try {
      await onSubmit(
        { title, body, tag: form.tag, experience: form.experience || null, published: form.published, pinned: form.pinned },
        { file, remove: removeImage && !file },
      )
    } catch (err) {
      setError('Gagal menyimpan: ' + (err.message || err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="uf-title"
        className="bg-surface w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-line sticky top-0 bg-surface z-10">
          <h2 id="uf-title" className="font-display font-bold text-xl tracking-tight">{editing ? 'Edit update' : 'Update baru'}</h2>
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost py-1 px-2.5" aria-label="Tutup">Esc</button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <label className="label" htmlFor="u-title">Judul</label>
            <input ref={titleRef} id="u-title" type="text" maxLength={120} className="field" placeholder="Contoh: Map baru di Mount Talaraya"
              value={form.title} onChange={set('title')} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="u-tag">Kategori</label>
              <select id="u-tag" className="field pr-8" value={form.tag} onChange={set('tag')}>
                {UPDATE_TAGS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="u-exp">Experience <span className="font-normal text-muted/70">(opsional)</span></label>
              <select id="u-exp" className="field pr-8" value={form.experience} onChange={set('experience')}>
                <option value="">Umum / semua</option>
                {community.experiences.map((x) => <option key={x.name}>{x.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="label" htmlFor="u-body">Isi update</label>
              <span className="text-[12px] text-muted tabular-nums">{form.body.length}/5000</span>
            </div>
            <textarea id="u-body" rows={7} maxLength={5000} className="field resize-y leading-relaxed"
              placeholder={'Tulis detail update di sini.\nEnter untuk baris baru.'}
              value={form.body} onChange={set('body')} />
          </div>

          <div>
            <span className="label">Gambar <span className="font-normal text-muted/70">(opsional)</span></span>
            {preview ? (
              <div className="rounded-xl border border-line-strong overflow-hidden">
                <img src={preview} alt="Pratinjau gambar update" className="w-full aspect-[16/9] object-cover bg-bg" />
                <div className="flex border-t border-line-strong text-sm font-semibold">
                  <button type="button" onClick={() => fileInput.current?.click()} className="flex-1 py-2.5 hover:bg-raised hover:text-yellow">Ganti gambar</button>
                  <button type="button" onClick={clearFile} className="flex-1 py-2.5 border-l border-line-strong text-muted hover:bg-danger/10 hover:text-danger">Hapus gambar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInput.current?.click()}
                className="w-full rounded-xl border border-dashed border-line-strong py-7 text-center hover:border-gold hover:bg-gold/5 transition-colors">
                <span className="block font-semibold">Pilih gambar</span>
                <span className="block mt-1 text-[13px] text-muted">Rasio 16:9 paling pas · otomatis diperkecil</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={pickFile} tabIndex={-1} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Toggle id="u-pub" checked={form.published} onChange={set('published')}
              title="Tampilkan di website" desc={form.published ? 'Langsung terlihat pengunjung' : 'Disimpan sebagai draf'} />
            <Toggle id="u-pin" checked={form.pinned} onChange={set('pinned')}
              title="Sematkan" desc="Selalu tampil paling atas" />
          </div>

          {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-line bg-surface sticky bottom-0">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost flex-1 py-3">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary flex-[2] py-3">
            {saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : form.published ? 'Terbitkan' : 'Simpan draf'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Toggle({ id, checked, onChange, title, desc }) {
  return (
    <label htmlFor={id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? 'border-gold/60 bg-gold/5' : 'border-line-strong hover:border-line-strong/80'}`}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <span aria-hidden="true" className={`relative w-9 h-5 rounded-full shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-yellow ${checked ? 'bg-yellow' : 'bg-line-strong'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-bg transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[12px] text-muted">{desc}</span>
      </span>
    </label>
  )
}

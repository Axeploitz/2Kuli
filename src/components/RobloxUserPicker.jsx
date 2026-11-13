import { useEffect, useId, useRef, useState } from 'react'
import { searchRobloxUsers } from '../lib/roblox'
import RobloxAvatar from './RobloxAvatar'

/**
 * Kolom pencarian username Roblox dengan saran (foto + display name + @username).
 * value: { id, name, displayName, avatar } | null
 */
export default function RobloxUserPicker({ id, value, onChange, initialQuery = '', autoFocus = false }) {
  const listId = useId()
  const inputRef = useRef(null)
  const [q, setQ] = useState(value ? '' : initialQuery)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [active, setActive] = useState(0)

  useEffect(() => { if (autoFocus && !value) inputRef.current?.focus() }, [autoFocus, value])

  // Cari dengan jeda 300 ms setelah berhenti mengetik
  useEffect(() => {
    if (value) return
    const term = q.trim()
    if (!/^[A-Za-z0-9_]{3,20}$/.test(term)) { setResults([]); setStatus('idle'); return }
    setStatus('loading')
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      searchRobloxUsers(term, ctrl.signal)
        .then((users) => { setResults(users); setActive(0); setStatus('done') })
        .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, value])

  function pick(u) {
    onChange(u)
    setOpen(false)
    setQ('')
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === 'Enter') e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
  }

  // Sudah dipilih: tampilkan kartu user
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/5 p-3">
        <RobloxAvatar src={value.avatar} name={value.displayName} size={48} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{value.displayName}</p>
          <p className="text-sm text-muted truncate">@{value.name}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-gold-soft">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>
            Akun Roblox terverifikasi
          </p>
        </div>
        <button type="button" onClick={() => { onChange(null); setQ(value.name); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          className="btn-ghost py-1.5 px-3 shrink-0">Ganti</button>
      </div>
    )
  }

  const showList = open && q.trim().length >= 3

  return (
    <div className="relative">
      <div className="relative">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted pointer-events-none">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.13 3.14a.75.75 0 1 0 1.06-1.06l-3.13-3.14A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          placeholder="Cari username Roblox…"
          className="field pl-9 pr-9"
          value={q}
          onChange={(e) => { setQ(e.target.value.replace(/\s/g, '')); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
        {status === 'loading' && (
          <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-line-strong border-t-gold animate-spin" />
        )}
      </div>

      {q && q.trim().length < 3 && <p className="mt-1.5 text-[12px] text-muted">Ketik minimal 3 karakter.</p>}

      {showList && (
        <ul id={listId} role="listbox"
          className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-line-strong bg-raised shadow-2xl shadow-black/60">
          {status === 'loading' && results.length === 0 && <li className="px-4 py-3 text-sm text-muted">Mencari…</li>}
          {status === 'error' && <li className="px-4 py-3 text-sm text-danger">Gagal terhubung ke Roblox. Coba lagi.</li>}
          {status === 'done' && results.length === 0 && <li className="px-4 py-3 text-sm text-muted">Username tidak ditemukan di Roblox.</li>}
          {results.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === active}>
              <button type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(u)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${i === active ? 'bg-line' : ''}`}>
                <RobloxAvatar src={u.avatar} name={u.displayName} size={40} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{u.displayName}</span>
                  <span className="block text-sm text-muted truncate">@{u.name}</span>
                </span>
                {u.exact && <span className="shrink-0 rounded-md bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold-soft">Cocok</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

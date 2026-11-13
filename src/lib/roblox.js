// Helper data user Roblox (lewat endpoint /api/roblox-users)

export async function searchRobloxUsers(q, signal) {
  const res = await fetch(`/api/roblox-users?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) throw new Error('Gagal mencari user Roblox')
  return (await res.json()).users || []
}

// Cache profil selama halaman terbuka, supaya tidak request berulang
const byId = new Map()
const byName = new Map()

export const cachedProfile = (row) =>
  (row.buyer_user_id && byId.get(String(row.buyer_user_id))) || byName.get(String(row.buyer_username || '').toLowerCase()) || null

/** rows: [{ buyer_user_id?, buyer_username }]. Mengisi cache lalu resolve. */
export async function loadProfiles(rows) {
  const ids = [...new Set(rows.map((r) => r.buyer_user_id).filter(Boolean).map(String))].filter((id) => !byId.has(id))
  const names = [...new Set(rows.filter((r) => !r.buyer_user_id).map((r) => String(r.buyer_username || '').toLowerCase()))]
    .filter((n) => /^[a-z0-9_]{3,20}$/.test(n) && !byName.has(n))
  if (!ids.length && !names.length) return

  for (let i = 0; i < Math.max(ids.length, names.length); i += 50) {
    const qs = new URLSearchParams()
    const idChunk = ids.slice(i, i + 50)
    const nameChunk = names.slice(i, i + 50)
    if (idChunk.length) qs.set('ids', idChunk.join(','))
    if (nameChunk.length) qs.set('usernames', nameChunk.join(','))
    try {
      const res = await fetch(`/api/roblox-users?${qs}`)
      if (!res.ok) continue
      const d = await res.json()
      for (const id of idChunk) byId.set(id, d.byId?.[id] || null)
      for (const n of nameChunk) byName.set(n, d.byName?.[n] || null)
    } catch { /* abaikan, tampil tanpa foto */ }
  }
}

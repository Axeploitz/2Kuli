// Ambil event (Roblox "Experience Events") untuk beberapa place sekaligus.
// Dipakai oleh fungsi Vercel (api/events.js) dan server dev Vite (vite.config.js).
// File berawalan "_" di folder api/ tidak dijadikan endpoint oleh Vercel.

const MAX_PLACES = 10

export function parsePlaces(raw) {
  return [...new Set(String(raw || '').split(',').map((s) => s.trim()).filter((s) => /^\d{1,20}$/.test(s)))].slice(0, MAX_PLACES)
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const clean = (s) => String(s || '').replace(/\*\*/g, '').trim()

export async function getEvents(placeIds) {
  const groups = await Promise.all(
    placeIds.map(async (placeId) => {
      try {
        const { universeId } = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`)
        const { data = [] } = await getJson(
          `https://apis.roblox.com/virtual-events/v1/universes/${universeId}/virtual-events?limit=25`
        )
        const events = data
          .filter((e) => e.eventStatus === 'active' && e.eventVisibility === 'public')
          .map((e) => ({
            id: e.id,
            title: clean(e.displayTitle || e.title),
            subtitle: clean(e.displaySubtitle || e.subtitle),
            description: clean(e.displayDescription || e.description),
            start: e.eventTime?.startUtc,
            end: e.eventTime?.endUtc,
            category: e.eventCategories?.[0]?.category || null,
            mediaId: [...(e.thumbnails || [])].sort((a, b) => a.rank - b.rank)[0]?.mediaId || null,
            url: `https://www.roblox.com/events/${e.id}`,
          }))
        return { placeId, universeId, events }
      } catch (err) {
        return { placeId, universeId: null, events: [], error: String(err.message || err) }
      }
    })
  )

  // Thumbnail semua event diambil sekali jalan
  const mediaIds = [...new Set(groups.flatMap((g) => g.events.map((e) => e.mediaId)).filter(Boolean))]
  const thumbs = {}
  for (let i = 0; i < mediaIds.length; i += 50) {
    try {
      const ids = mediaIds.slice(i, i + 50).join(',')
      const { data = [] } = await getJson(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&returnPolicy=PlaceHolder&size=768x432&format=Webp`
      )
      for (const t of data) if (t.state === 'Completed' && t.imageUrl) thumbs[t.targetId] = t.imageUrl
    } catch { /* tanpa thumbnail tetap jalan */ }
  }

  for (const g of groups) {
    for (const e of g.events) {
      e.thumbnail = thumbs[e.mediaId] || null
      delete e.mediaId
    }
  }
  return { updatedAt: new Date().toISOString(), groups }
}

// ---------------------------------------------------------------------------
// User Roblox: pencarian username, pencocokan persis, dan foto profil (headshot)
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

export const parseList = (raw, re, max = 50) =>
  [...new Set(String(raw || '').split(',').map((s) => s.trim()).filter((s) => re.test(s)))].slice(0, max)

export const parseUsernames = (raw) => parseList(raw, USERNAME_RE)
export const parseIds = (raw) => parseList(raw, /^\d{1,20}$/)

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function headshots(ids) {
  const out = {}
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const { data = [] } = await getJson(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.slice(i, i + 100).join(',')}&size=150x150&format=Webp&isCircular=false`
      )
      for (const t of data) if (t.state === 'Completed' && t.imageUrl) out[t.targetId] = t.imageUrl
    } catch { /* tanpa foto tetap jalan */ }
  }
  return out
}

const toUser = (u, avatars) => ({
  id: String(u.id),
  name: u.name,
  displayName: u.displayName || u.name,
  verified: !!u.hasVerifiedBadge,
  avatar: avatars[u.id] || null,
})

async function exactUsernames(usernames) {
  if (usernames.length === 0) return []
  const { data = [] } = await postJson('https://users.roblox.com/v1/usernames/users', { usernames, excludeBannedUsers: true })
  return data
}

// Saran username untuk kolom pencarian. Hasil yang persis sama selalu di urutan pertama.
export async function searchUsers(keyword) {
  const q = String(keyword || '').trim()
  if (!USERNAME_RE.test(q)) return []

  const [exact, fuzzy] = await Promise.all([
    exactUsernames([q]).catch(() => []),
    getJson(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(q)}&limit=10`)
      .then((d) => d.data || [])
      .catch(() =>
        // Cadangan kalau endpoint di atas kena limit
        getJson(`https://apis.roblox.com/search-api/omni-search?verticalType=user&searchQuery=${encodeURIComponent(q)}&pageToken=&globalSessionId=web&sessionId=web`)
          .then((d) => (d.searchResults?.[0]?.contents || []).map((c) => ({
            id: c.contentId, name: c.username, displayName: c.displayName, hasVerifiedBadge: c.hasVerifiedBadge,
          })))
          .catch(() => [])
      ),
  ])

  const seen = new Set()
  const list = [...exact, ...fuzzy].filter((u) => u?.id && !seen.has(String(u.id)) && seen.add(String(u.id))).slice(0, 6)
  const avatars = await headshots(list.map((u) => u.id))
  return list.map((u) => ({ ...toUser(u, avatars), exact: u.name.toLowerCase() === q.toLowerCase() }))
}

// Profil berdasarkan user id dan/atau username. Hasil: { byId: {id: user}, byName: {username_lower: user} }
export async function lookupUsers({ ids = [], usernames = [] }) {
  const [byIdRaw, byNameRaw] = await Promise.all([
    ids.length ? postJson('https://users.roblox.com/v1/users', { userIds: ids.map(Number), excludeBannedUsers: false }).then((d) => d.data || []).catch(() => []) : [],
    exactUsernames(usernames).catch(() => []),
  ])
  const avatars = await headshots([...new Set([...byIdRaw, ...byNameRaw].map((u) => u.id))])
  const byId = Object.fromEntries(byIdRaw.map((u) => [String(u.id), toUser(u, avatars)]))
  const byName = Object.fromEntries(byNameRaw.map((u) => [String(u.requestedUsername || u.name).toLowerCase(), toUser(u, avatars)]))
  return { byId, byName }
}

// Helper API Roblox (publik, tanpa login)

export const GROUP_ID = Number(process.env.ROBLOX_GROUP_ID || 559137025)
export const GROUP_URL = process.env.ROBLOX_GROUP_URL || `https://www.roblox.com/share/g/${GROUP_ID}`

async function get(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (res.status === 429) throw new Error('Roblox sedang membatasi request, coba lagi sebentar.')
  if (!res.ok) throw new Error(`Roblox API error ${res.status}`)
  return res.json()
}

export const isValidUsername = (s) => /^[A-Za-z0-9_]{3,20}$/.test(s)

/** Cari akun dari username persis. null kalau tidak ada. */
export async function findUserByName(username) {
  const d = await get('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  })
  const u = d.data?.[0]
  return u ? { id: u.id, name: u.name, displayName: u.displayName } : null
}

export async function findUserById(id) {
  const u = await get(`https://users.roblox.com/v1/users/${id}`)
  return { id: u.id, name: u.name, displayName: u.displayName, created: u.created }
}

export async function headshot(userId) {
  try {
    const d = await get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`)
    return d.data?.[0]?.imageUrl || null
  } catch {
    return null
  }
}

/** Role user di grup 2Kuli, atau null kalau belum member. */
export async function groupMembership(userId) {
  const d = await get(`https://groups.roblox.com/v2/users/${userId}/groups/roles?includeLocked=true`)
  const m = d.data?.find((g) => g.group.id === GROUP_ID)
  return m ? { role: m.role.name, rank: m.role.rank } : null
}

export async function groupInfo() {
  try {
    const g = await get(`https://groups.roblox.com/v1/groups/${GROUP_ID}`)
    return { name: g.name, members: g.memberCount }
  } catch {
    return { name: '2Kuli Project', members: null }
  }
}

export const PAYOUT_MIN_DAYS = 14
const DAY = 24 * 60 * 60 * 1000

/**
 * Apakah user boleh menerima payout Robux dari grup.
 * Lewat Roblox Open Cloud (ROBLOX_API_KEY, izin group:read): ambil tanggal join grup
 * lalu hitung aturan minimal 14 hari menjadi member.
 * status: 'eligible' | 'ineligible' | 'unchecked'; eligibleAt: tanggal mulai eligible
 */
export async function payoutEligibility(userId) {
  if (!process.env.ROBLOX_API_KEY) return { status: 'unchecked', reason: 'ROBLOX_API_KEY belum diisi' }
  return eligibilityByJoinDate(userId)
}

/** Open Cloud: GET /cloud/v2/groups/{id}/memberships?filter=user == 'users/{userId}' */
export async function groupJoinDate(userId) {
  const url = `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/memberships?maxPageSize=1&filter=${encodeURIComponent(`user == 'users/${userId}'`)}`
  const res = await fetch(url, { headers: { 'x-api-key': process.env.ROBLOX_API_KEY }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`)
  const d = await res.json()
  const m = d.groupMemberships?.[0]
  if (!m) return null // bukan member
  return m.createTime ? new Date(m.createTime) : undefined // undefined = member tapi tanggal tidak ada
}

async function eligibilityByJoinDate(userId) {
  try {
    const joined = await groupJoinDate(userId)
    if (joined === null) return { status: 'ineligible', raw: 'NotInGroup', source: 'api-key' }
    if (!joined) return { status: 'unchecked', reason: 'tanggal join tidak tersedia' }
    const eligibleAt = new Date(joined.getTime() + PAYOUT_MIN_DAYS * DAY)
    const ok = Date.now() >= eligibleAt.getTime()
    return { status: ok ? 'eligible' : 'ineligible', raw: ok ? 'Eligible' : 'PendingInGroup', joinedAt: joined, eligibleAt, source: 'api-key' }
  } catch (e) {
    return { status: 'unchecked', reason: e.message }
  }
}

export const profileUrl = (id) => `https://www.roblox.com/users/${id}/profile`

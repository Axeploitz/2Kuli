// Endpoint Vercel:
//   GET /api/roblox-users?q=keyword                 -> saran username (maks 6)
//   GET /api/roblox-users?ids=1,2&usernames=a,b     -> profil + foto
import { lookupUsers, parseIds, parseUsernames, searchUsers } from './_roblox.js'

export async function GET(request) {
  const p = new URL(request.url).searchParams

  if (p.has('q')) {
    const users = await searchUsers(p.get('q'))
    return Response.json({ users }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } })
  }

  const ids = parseIds(p.get('ids'))
  const usernames = parseUsernames(p.get('usernames'))
  if (!ids.length && !usernames.length) return Response.json({ error: 'Isi q, ids, atau usernames.' }, { status: 400 })

  const data = await lookupUsers({ ids, usernames })
  return Response.json(data, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}

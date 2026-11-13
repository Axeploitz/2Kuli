// Endpoint Vercel: GET /api/events?places=123,456
import { getEvents, parsePlaces } from './_roblox.js'

export async function GET(request) {
  const places = parsePlaces(new URL(request.url).searchParams.get('places'))
  if (places.length === 0) return Response.json({ error: 'Parameter places wajib diisi.' }, { status: 400 })

  const data = await getEvents(places)
  return Response.json(data, {
    headers: {
      // Disimpan di CDN Vercel 5 menit supaya cepat & tidak kena limit Roblox
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  })
}

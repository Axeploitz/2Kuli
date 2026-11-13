import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { GET as eventsGET } from './api/events.js'
import { GET as robloxUsersGET } from './api/roblox-users.js'

// Supaya endpoint di folder api/ juga jalan saat `npm run dev`.
// Di Vercel, file-file itu otomatis jadi serverless function.
const ROUTES = { '/api/events': eventsGET, '/api/roblox-users': robloxUsersGET }

function apiDev() {
  return {
    name: 'api-dev',
    configureServer(server) {
      for (const [path, handler] of Object.entries(ROUTES)) {
        server.middlewares.use(path, async (req, res) => {
          try {
            const response = await handler(new Request(new URL(req.originalUrl || req.url, 'http://localhost')))
            res.statusCode = response.status
            response.headers.forEach((v, k) => res.setHeader(k, v))
            res.end(Buffer.from(await response.arrayBuffer()))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: String(e.message || e) }))
          }
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDev()],
})

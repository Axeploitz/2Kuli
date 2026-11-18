// Konversi Rupiah ke mata uang lain pakai kurs live (tanpa API key).
// Sumber utama open.er-api.com, cadangan Frankfurter (ECB). Kurs di-cache 30 menit.

export const CURRENCIES = {
  MYR: { flag: '🇲🇾', symbol: 'RM', country: 'Malaysia', name: 'Ringgit Malaysia' },
  PHP: { flag: '🇵🇭', symbol: '₱', country: 'Filipina', name: 'Peso Filipina' },
  THB: { flag: '🇹🇭', symbol: '฿', country: 'Thailand', name: 'Baht Thailand' },
  SGD: { flag: '🇸🇬', symbol: 'S$', country: 'Singapura', name: 'Dolar Singapura' },
  USD: { flag: '🇺🇸', symbol: 'US$', country: 'Amerika Serikat', name: 'Dolar AS' },
}

const CACHE_MS = 30 * 60 * 1000
let cache = null // { usd: { IDR, MYR, ... }, updatedAt: Date, source }

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Basis USD supaya presisi tinggi (basis IDR dibulatkan terlalu kasar)
const SOURCES = [
  async () => {
    const d = await getJson('https://open.er-api.com/v6/latest/USD')
    if (d.result !== 'success') throw new Error('respon tidak valid')
    return { usd: d.rates, updatedAt: new Date(d.time_last_update_unix * 1000), source: 'ExchangeRate-API' }
  },
  async () => {
    const symbols = ['IDR', ...Object.keys(CURRENCIES).filter((c) => c !== 'USD')].join(',')
    const d = await getJson(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`)
    return { usd: { ...d.rates, USD: 1 }, updatedAt: new Date(`${d.date}T16:00:00Z`), source: 'Frankfurter (ECB)' }
  },
]

async function rates() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache
  for (const load of SOURCES) {
    try {
      const r = await load()
      if (!r.usd?.IDR) throw new Error('kurs IDR tidak ada')
      cache = { ...r, fetchedAt: Date.now() }
      return cache
    } catch (err) {
      console.warn('Kurs gagal diambil:', err.message)
    }
  }
  if (cache) return cache // pakai kurs terakhir kalau semua sumber sedang gagal
  throw new Error('Kurs mata uang sedang tidak bisa diambil, coba lagi sebentar.')
}

/** Konversi nominal Rupiah ke mata uang `code` */
export async function convertIdr(idr, code) {
  const r = await rates()
  const perIdr = r.usd[code] / r.usd.IDR
  if (!perIdr) throw new Error(`Kurs ${code} tidak tersedia.`)
  return { amount: idr * perIdr, idrPerUnit: 1 / perIdr, updatedAt: r.updatedAt, source: r.source }
}

export function formatMoney(amount, code) {
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  return `${CURRENCIES[code]?.symbol || code} ${n}`
}

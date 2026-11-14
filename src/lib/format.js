export const rupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0)

export const num = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0)

export const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

// Tanggal lokal (bukan UTC) dalam format YYYY-MM-DD
export const today = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// "1.250.000" -> 1250000 ; hanya ambil digit
export const digits = (s) => String(s ?? '').replace(/\D/g, '')

// "14 Nov 2026" dari timestamp ISO
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

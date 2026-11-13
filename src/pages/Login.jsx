import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNoIndex } from '../lib/useNoIndex'
import Logo from '../components/Logo'

export default function Login() {
  useNoIndex()
  const { session, loading, signIn, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to="/owner/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!configured) return setError('Supabase belum dikonfigurasi. Isi file .env terlebih dulu.')
    if (!email || !password) return setError('Isi email dan password.')
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError('Email atau password salah.')
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panel kiri */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-surface border-r border-line relative overflow-hidden isolate">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <img src="/images/experiences/saujana.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-surface/40" />
          <div className="bg-dots absolute inset-0" />
          <div className="glow-gold absolute -left-24 bottom-10 w-[520px] h-[420px]" />
        </div>
        <Link to="/"><Logo size={34} /></Link>
        <div>
          <div className="rule-gold w-24 mb-8" />
          <p className="font-display font-extrabold text-5xl xl:text-6xl tracking-[-0.03em] leading-[0.95] max-w-[12ch]">
            Area owner<span className="text-yellow">.</span>
          </p>
          <p className="mt-5 text-muted max-w-[38ch] leading-relaxed">
            Catat dan pantau transaksi Robux, lengkap dengan bukti pembayaran, dalam satu tempat.
          </p>
        </div>
        <p className="text-sm text-muted">Akses terbatas untuk akun terdaftar.</p>
      </aside>

      {/* Form */}
      <main className="flex flex-col p-6 sm:p-10">
        <Link to="/" className="lg:hidden mb-10"><Logo size={30} /></Link>
        <div className="flex-1 flex items-center justify-center">
          <form onSubmit={handleSubmit} className="w-full max-w-sm">
            <p className="eyebrow mb-3">Owner</p>
            <h1 className="font-display font-bold text-3xl tracking-tight mb-2">Masuk ke dashboard</h1>
            <p className="text-muted mb-8">Gunakan email dan password akun owner.</p>

            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} placeholder="nama@email.com"
              onChange={(e) => setEmail(e.target.value)} className="field mb-4" />

            <label className="label" htmlFor="password">Password</label>
            <div className="relative mb-5">
              <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="field pr-20" />
              <button type="button" onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-muted hover:text-gold-soft">
                {show ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>

            {error && <p role="alert" className="mb-5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-[15px]">
              {busy ? 'Memproses…' : 'Masuk'}
            </button>

            <Link to="/" className="inline-block mt-8 text-sm text-muted hover:text-fg">← Kembali ke beranda</Link>
          </form>
        </div>
      </main>
    </div>
  )
}

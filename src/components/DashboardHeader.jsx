import { Link, NavLink } from 'react-router-dom'
import Logo from './Logo'

const TABS = [
  { to: '/owner/dashboard', label: 'Transaksi', end: true },
  { to: '/owner/dashboard/update', label: 'Update' },
]

// Header dashboard owner + menu tab (Transaksi / Update)
export default function DashboardHeader({ name, email, onSignOut, showTabs = true }) {
  return (
    <header className="sticky top-0 z-20 bg-bg border-b border-black/40 shadow-lg shadow-black/20">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link to="/" className="shrink-0"><Logo size={28} /></Link>
          {showTabs && (
            <nav className="flex items-center gap-1 h-16" aria-label="Menu dashboard">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end}
                  className={({ isActive }) => `relative h-full inline-flex items-center px-3 text-sm font-semibold transition-colors ${
                    isActive ? 'text-yellow after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-yellow' : 'text-muted hover:text-fg'}`}>
                  {t.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm shrink-0">
          <span className="hidden md:inline text-muted">
            {name ? <>Masuk sebagai <span className="text-fg font-semibold">{name}</span></> : email}
          </span>
          <button onClick={onSignOut} className="btn-ghost py-1.5 px-3">Keluar</button>
        </div>
      </div>
    </header>
  )
}

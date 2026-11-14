import { useEffect, useState } from 'react'
import { community as c } from '../config/community'
import Logo from '../components/Logo'
import SmartImage from '../components/SmartImage'
import ExperienceEvents from '../components/ExperienceEvents'
import { DiscordIcon, RobloxIcon } from '../components/BrandIcons'
import Reveal from '../components/Reveal'
import LatestUpdates from '../components/LatestUpdates'
import { listPublishedUpdates } from '../lib/updates'

const wrap = 'max-w-6xl mx-auto px-5 sm:px-8'

export default function Home() {
  // Update dari dashboard owner; bagian ini hanya muncul kalau ada update yang tayang
  const [updates, setUpdates] = useState([])
  useEffect(() => { listPublishedUpdates(6).then(setUpdates).catch(() => {}) }, [])

  const navItems = [['#tentang', 'Tentang'], ['#owner', 'Owner'], ['#experience', 'Experience'],
    ...(updates.length ? [['#update', 'Update']] : []), ['#event', 'Event']]

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-bg/85 backdrop-blur border-b border-line">
        <div className={`${wrap} h-16 flex items-center justify-between`}>
          <a href="#top" aria-label={`${c.name}, ke atas`}><Logo size={30} /></a>
          <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
            {navItems.map(([href, t]) => (
              <a key={href} href={href} className="hidden sm:inline px-3 py-2 text-muted hover:text-fg transition-colors">{t}</a>
            ))}
            <a href="#gabung" className="btn-primary ml-2 py-2">Gabung</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden isolate">
        <HeroBackdrop images={c.experiences.map((x) => `/images/experiences/${x.image}`)} />
        <div className={`${wrap} pt-20 sm:pt-32 pb-20 sm:pb-32`}>
          <p className="eyebrow mb-6">Komunitas {c.name}</p>
          <h1 className="font-display font-extrabold tracking-[-0.03em] leading-[0.95] text-[clamp(2.75rem,8vw,6.25rem)] max-w-[14ch] drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
            {c.tagline.replace(/\.$/, '')}<span className="text-yellow">.</span>
          </h1>
          <p className="mt-7 text-lg sm:text-xl leading-relaxed text-fg/70 max-w-[56ch]">{c.intro}</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <a href="#gabung" className="btn-primary px-6 py-3 text-[15px]">Ikut bergabung</a>
            <a href="#experience" className="btn-ghost bg-bg/40 backdrop-blur px-6 py-3 text-[15px]">Lihat experience</a>
          </div>
        </div>
      </section>

      {/* Tentang */}
      <section id="tentang" className="section-line bg-surface-glow">
        <div className={`${wrap} py-20 sm:py-28 grid md:grid-cols-[1fr_1.4fr] gap-10 md:gap-20`}>
          <div>
            <p className="eyebrow mb-4">Tentang</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight leading-tight">Siapa kami</h2>
          </div>
          <div className="space-y-5 text-lg leading-relaxed text-fg/85 max-w-[62ch]">
            {c.about.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      </section>

      {/* Owner */}
      <section id="owner" className="section-line relative overflow-hidden isolate">
        <div aria-hidden="true" className="bg-dots absolute inset-0 -z-10 opacity-50" />
        <div aria-hidden="true" className="glow-gold absolute -z-10 right-[-10%] top-1/4 w-[620px] h-[620px] opacity-70" />
        <div className={`${wrap} py-20 sm:py-28 grid lg:grid-cols-[0.85fr_1.15fr] gap-12 lg:gap-20 items-center`}>
          <Reveal>
            <p className="eyebrow mb-4">Owner</p>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-tight leading-[1.05]">
              Di balik <span className="bg-gradient-to-r from-gold-soft via-yellow to-gold bg-clip-text text-transparent">{c.name}</span>
            </h2>
            {c.ownersIntro && <p className="mt-5 text-lg text-muted leading-relaxed max-w-[42ch]">{c.ownersIntro}</p>}
            <div className="mt-8 flex items-center gap-3 text-sm text-muted">
              <span className="h-px w-10 bg-gradient-to-r from-gold to-transparent" aria-hidden="true" />
              {c.owners.length} owner
            </div>
          </Reveal>

          <ul className="grid grid-cols-2 gap-4 sm:gap-6">
            {c.owners.map((m, i) => (
              <Reveal as="li" key={m.name} delay={150 + i * 140} className={i % 2 ? 'sm:mt-12' : ''}>
                <OwnerCard m={m} index={i} />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Experience */}
      <section id="experience" className="section-line relative overflow-hidden isolate">
        <div aria-hidden="true" className="glow-gold absolute -z-10 -right-40 top-20 w-[640px] h-[640px] opacity-70" />
        <div className={`${wrap} py-20 sm:py-28`}>
          <p className="eyebrow mb-4">Experience</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-3">Yang sudah kami buat</h2>
          <p className="text-muted mb-12 max-w-[52ch]">Experience Roblox buatan {c.name}.</p>
          <ul className="grid sm:grid-cols-2 gap-5 sm:gap-6">
            {c.experiences.map((x) => {
              const Card = x.url ? 'a' : 'div'
              return (
                <li key={x.name}>
                  <Card {...(x.url ? { href: x.url, target: '_blank', rel: 'noreferrer' } : {})}
                    className="group block card overflow-hidden hover:border-gold/60 transition-colors">
                    <div className="aspect-square bg-raised overflow-hidden">
                      <SmartImage
                        src={`/images/experiences/${x.image}`}
                        alt={x.name}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        fallback={
                          <div className="w-full h-full grid place-items-center bg-[radial-gradient(ellipse_at_top,rgba(201,162,74,0.18),transparent_70%)]">
                            <span className="font-display font-bold text-2xl text-gold/70 px-6 text-center">{x.name}</span>
                          </div>
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                      <h3 className="font-display font-bold text-xl tracking-tight">{x.name}</h3>
                      {x.url && <span className="text-sm font-semibold text-yellow shrink-0">Mainkan →</span>}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* Update */}
      {updates.length > 0 && (
        <section id="update" className="section-line relative overflow-hidden isolate">
          <div aria-hidden="true" className="glow-gold absolute -z-10 -left-48 top-24 w-[600px] h-[600px] opacity-60" />
          <div className={`${wrap} py-20 sm:py-28`}>
            <p className="eyebrow mb-4">Update</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-3">Kabar terbaru</h2>
            <p className="text-muted mb-12 max-w-[52ch]">Pengumuman, update game, dan info terbaru dari tim {c.name}.</p>
            <LatestUpdates updates={updates} />
          </div>
        </section>
      )}

      {/* Event */}
      <section id="event" className="section-line bg-surface-glow">
        <div className={`${wrap} py-20 sm:py-28`}>
          <p className="eyebrow mb-4">Event</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-3">Event di experience kami</h2>
          <p className="text-muted mb-12 max-w-[52ch]">Diambil langsung dari Roblox, jadi selalu sesuai dengan event yang sedang berjalan di game.</p>
          <ExperienceEvents experiences={c.experiences} />
        </div>
      </section>

      {/* Gabung */}
      <section id="gabung" className="section-line relative overflow-hidden isolate">
        <div aria-hidden="true" className="glow-gold absolute -z-10 left-1/2 -translate-x-1/2 top-10 w-[900px] h-[500px] opacity-80" />
        <div className={`${wrap} py-16 sm:py-24`}>
          <div className="bg-gold-panel relative overflow-hidden isolate rounded-3xl px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16 text-bg">
            {/* Dekorasi: pola titik gelap + watermark logo */}
            <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-[0.18]"
              style={{ backgroundImage: 'radial-gradient(rgba(60,35,0,0.9) 1px, transparent 1px)', backgroundSize: '18px 18px',
                maskImage: 'linear-gradient(115deg, transparent 35%, #000 100%)', WebkitMaskImage: 'linear-gradient(115deg, transparent 35%, #000 100%)' }} />
            {c.logo?.file && (
              <img aria-hidden="true" src={`/logo/${c.logo.file}`} alt=""
                className="absolute -z-10 right-4 bottom-4 sm:right-8 sm:bottom-6 w-[22rem] max-w-[70%] opacity-[0.09] mix-blend-multiply pointer-events-none select-none" />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-8 sm:gap-10 lg:gap-16 items-center">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bg/60 mb-4">Gabung komunitas</p>
                <h2 className="font-display font-extrabold tracking-[-0.03em] leading-[0.95] text-[clamp(2.4rem,6vw,4.25rem)]">
                  Mau ikut bergabung?
                </h2>
                <p className="mt-5 text-base sm:text-lg max-w-[44ch] text-bg/75 leading-relaxed">{c.join.text}</p>
              </div>

              <ul className="grid grid-cols-1 gap-3 sm:gap-4 min-w-0">
                {c.join.links.map((l) => {
                  const Icon = l.platform === 'discord' ? DiscordIcon : RobloxIcon
                  return (
                    <li key={l.label}>
                      <a href={l.href} target="_blank" rel="noreferrer" className={l.platform === 'discord' ? 'btn-discord' : 'btn-roblox'}>
                        <span className="grid place-items-center shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white/15 ring-1 ring-white/25">
                          <Icon className="w-6 h-6" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-bold text-base sm:text-lg leading-tight">{l.label}</span>
                          {l.sub && <span className="block text-[13px] sm:text-sm text-white/80 leading-snug">{l.sub}</span>}
                        </span>
                        <span aria-hidden="true" className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/15 text-lg">→</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="section-line">
        <div className={`${wrap} py-8 flex flex-wrap gap-4 items-center justify-between text-sm text-muted`}>
          <div className="flex items-center gap-3">
            <Logo size={22} showName={false} />
            <span>© {new Date().getFullYear()} {c.name}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function OwnerCard({ m, index }) {
  return (
    <article className="group relative rounded-2xl p-px bg-gradient-to-b from-gold/70 via-line-strong/50 to-line/30 transition-[background,transform,box-shadow] duration-500 hover:-translate-y-1.5 hover:from-yellow hover:via-gold/50 hover:shadow-[0_30px_60px_-25px_rgba(201,162,74,0.45)]">
      <div className="relative aspect-[4/5] rounded-[15px] overflow-hidden bg-raised isolate">
        <SmartImage
          src={`/images/owners/${m.photo}`}
          alt={m.name}
          className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"
          fallback={
            <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="font-display font-bold text-6xl text-gold/80">{initials(m.name)}</span>
            </div>
          }
        />
        {/* Gradasi bawah supaya nama terbaca */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-bg via-bg/35 to-transparent to-60%" />
        {/* Kilau saat hover */}
        <span aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[130%] group-hover:animate-[sheen_1.1s_ease-out]" />

        <span className="absolute top-3 left-3 sm:top-4 sm:left-4 rounded-full bg-bg/60 backdrop-blur px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gold-soft ring-1 ring-gold/30">
          {String(index + 1).padStart(2, '0')}
        </span>

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <span aria-hidden="true" className="block h-0.5 w-8 rounded-full bg-gradient-to-r from-yellow to-gold mb-3 transition-[width] duration-500 group-hover:w-14" />
          <h3 className="font-display font-bold text-xl sm:text-3xl tracking-tight leading-none">{m.name}</h3>
          <p className="mt-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">{m.role}</p>
        </div>
      </div>
    </article>
  )
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// Latar hero: artwork experience bergantian, redup & memudar, plus pola titik dan cahaya emas
function HeroBackdrop({ images }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (images.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((n) => (n + 1) % images.length), 7000)
    return () => clearInterval(t)
  }, [images.length])

  const fade = 'linear-gradient(to left, #000 25%, transparent 90%), linear-gradient(to top, transparent 0%, #000 35%)'
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <div className="absolute inset-y-0 right-0 w-full md:w-[62%]"
        style={{ maskImage: fade, WebkitMaskImage: fade, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}>
        {images.map((src, n) => (
          <img key={src} src={src} alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ${n === i ? 'opacity-45' : 'opacity-0'}`} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/40 to-transparent" />
      </div>
      <div className="bg-dots absolute inset-0" />
      <div className="glow-gold absolute -left-32 -top-40 w-[720px] h-[560px]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  )
}

import { useEffect, useState } from 'react'
import './LandingPage.css'
import Logo from './Logo'
import Icon from './Icon'

/**
 * LandingPage — OtagWork public tanıtım sayfası.
 *
 * Props:
 *   onLogin: () => void  — "Giriş Yap" butonlarına basıldığında çağrılır.
 *
 * Yapı: NavBar · Hero · Features · HowItWorks · Faq · Footer
 * Renkler: index.css :root token'larından beslenir.
 */
const LandingPage = ({ onLogin, onSignup }) => {
  return (
    <div className="lp-root">
      <NavBar onLogin={onLogin} onSignup={onSignup} />
      <Hero onLogin={onLogin} onSignup={onSignup} />
      <FeaturesGrid />
      <HowItWorks />
      <FaqAccordion />
      <Footer onLogin={onLogin} />
    </div>
  )
}

/* ────────────────────────────────────────────────
   1. STICKY NAVBAR
   ──────────────────────────────────────────────── */
const NavBar = ({ onLogin, onSignup }) => {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
      <div className="lp-nav-inner">
        <a href="#top" className="lp-nav-brand" aria-label="OtagWork ana">
          <Logo size={36} />
          <div className="lp-nav-brand-text">
            <span className="lp-nav-brand-name">OtagWork</span>
            <span className="lp-nav-brand-tag">İş & Ekip Platformu</span>
          </div>
        </a>

        <nav className="lp-nav-links" aria-label="Sayfa içi gezinme">
          <a href="#features">Özellikler</a>
          <a href="#how">Nasıl Çalışır</a>
          <a href="#faq">SSS</a>
        </nav>

        <div className="lp-nav-actions">
          <button className="lp-nav-secondary" onClick={onLogin} type="button">
            Giriş Yap
          </button>
          <button className="lp-nav-cta icon-stack" onClick={onSignup} type="button">
            Ücretsiz Kayıt Ol <Icon name="arrow_right" size={14} />
          </button>
        </div>
      </div>
    </header>
  )
}

/* ────────────────────────────────────────────────
   2. HERO
   ──────────────────────────────────────────────── */
const Hero = ({ onLogin, onSignup }) => (
  <section className="lp-hero" id="top">
    <div className="lp-hero-bg" aria-hidden="true" />
    <div className="lp-hero-inner">
      <div className="lp-hero-text fade-up">
        <span className="lp-hero-badge">
          <Icon name="sparkles" size={12} /> Yeni: Şerit takvim görünümü
        </span>
        <h1 className="lp-hero-title">
          İşlerinizi, ekibinizi ve saatinizi <span className="lp-hero-accent">tek bir çadırda</span> toplayın.
        </h1>
        <p className="lp-hero-sub">
          OtagWork; görev yönetimi, timesheet, izin ve raporlamayı modern bir
          arayüzde birleştirir. Sıkışık tablolar yerine net bir akış.
        </p>
        <div className="lp-hero-cta">
          <button className="lp-btn-primary icon-stack" onClick={onSignup} type="button">
            Ücretsiz Başla <Icon name="arrow_right" size={16} />
          </button>
          <button className="lp-btn-ghost" onClick={onLogin} type="button">Giriş Yap</button>
        </div>

        <ul className="lp-hero-mini" aria-label="Öne çıkanlar">
          <li><Icon name="check" size={14} /> Sürükle-bırak Kanban</li>
          <li><Icon name="check" size={14} /> PDF rapor</li>
          <li><Icon name="check" size={14} /> Mobil uyumlu</li>
        </ul>
      </div>

      <div className="lp-hero-visual fade-up" style={{ animationDelay: '120ms' }}>
        <div className="lp-hero-card lp-hero-card--a" aria-hidden="true">
          <div className="lp-hero-card-line lp-hero-card-line--w70" />
          <div className="lp-hero-card-line lp-hero-card-line--w50" />
          <div className="lp-hero-card-pill" />
        </div>
        <div className="lp-hero-card lp-hero-card--b" aria-hidden="true">
          <div className="lp-hero-card-line lp-hero-card-line--w40" />
          <div className="lp-hero-card-bar" />
        </div>
        <div className="lp-hero-logo">
          <Logo size={220} />
        </div>
      </div>
    </div>
  </section>
)

/* ────────────────────────────────────────────────
   3. ÖZELLİKLER GRID
   ──────────────────────────────────────────────── */
const FEATURES = [
  { icon: 'clipboard',     title: 'Kanban Panosu',          desc: 'Sürükle-bırak ile statü değişimi, sol kenar öncelik şeridi, gecikme rozeti.' },
  { icon: 'calendar_days', title: 'Şerit Takvim',           desc: 'Görevlerin başlangıç–bitiş aralığını haftalık şerit olarak görün.' },
  { icon: 'clock',         title: 'Timesheet & Saat Analizi', desc: 'Günlük girişler + haftalık etkinlik tipine göre dağılım grafiği.' },
  { icon: 'beach',         title: 'İzin Yönetimi',          desc: 'Bakiye, talep ve yönetici onayı — uçtan uca dijital akış.' },
  { icon: 'chart',         title: 'Ana Sayfa Özetleri',     desc: 'Bugün ne yapmalısınız? Tek bakışta tüm metrikler ve görevler.' },
  { icon: 'bell',          title: 'Bildirim & Onaylar',     desc: 'Atanan görev, ek süre, izin onayı — anında bildirim akışı.' },
]

const FeaturesGrid = () => (
  <section className="lp-section lp-features" id="features">
    <header className="lp-section-head">
      <p className="lp-section-kicker">Neler yapabilirsiniz</p>
      <h2 className="lp-section-title">Tek platform, eksiksiz iş akışı</h2>
      <p className="lp-section-sub">
        Görevden raporlamaya, izinden bildirime — günlük iş yönetiminin tüm parçaları aynı arayüzde.
      </p>
    </header>

    <div className="lp-features-grid">
      {FEATURES.map((f, i) => (
        <article
          key={f.title}
          className="lp-feature-card hover-lift fade-up"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="lp-feature-icon"><Icon name={f.icon} size={22} /></div>
          <h3 className="lp-feature-title">{f.title}</h3>
          <p className="lp-feature-desc">{f.desc}</p>
        </article>
      ))}
    </div>
  </section>
)

/* ────────────────────────────────────────────────
   4. NASIL ÇALIŞIR (3 adım)
   ──────────────────────────────────────────────── */
const STEPS = [
  { n: '01', icon: 'log_in',        title: 'Giriş Yap',  desc: 'Yönetici tarafından açılan hesap bilgileriniz ile güvenli giriş.' },
  { n: '02', icon: 'calendar_days', title: 'Planla',     desc: 'Görevini takvime ekle, başlangıç–bitiş şeridini ve önceliği belirle.' },
  { n: '03', icon: 'chart',         title: 'Raporla',    desc: 'Haftalık saat dağılımını gör, dilediğin tarih aralığı için PDF al.' },
]

const HowItWorks = () => (
  <section className="lp-section lp-how" id="how">
    <header className="lp-section-head">
      <p className="lp-section-kicker">Üç adımda</p>
      <h2 className="lp-section-title">Nasıl çalışır?</h2>
      <p className="lp-section-sub">Karmaşık kurulum yok. Giriş yap — planla — raporla.</p>
    </header>

    <div className="lp-how-grid">
      {STEPS.map((s, i) => (
        <div key={s.n} className="lp-step fade-up" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="lp-step-num">{s.n}</div>
          <div className="lp-step-icon"><Icon name={s.icon} size={20} /></div>
          <h3 className="lp-step-title">{s.title}</h3>
          <p className="lp-step-desc">{s.desc}</p>
        </div>
      ))}
    </div>
  </section>
)

/* ────────────────────────────────────────────────
   5. SSS (Accordion)
   ──────────────────────────────────────────────── */
const FAQ = [
  { q: 'Sistemi nasıl kullanmaya başlarım?',         a: 'Yöneticiniz size bir hesap oluşturur, giriş bilgileriniz e-posta ile iletilir. İlk girişten sonra Ana Sayfa üzerinden ekibinizin görevlerine hemen erişebilirsiniz.' },
  { q: 'Verilerim güvende mi?',                       a: 'Şifreler bcrypt ile hash\'lenir, oturumlar oturum çerezi ile yönetilir. Tüm kritik işlemler audit log altına alınır.' },
  { q: 'Mobil cihazlardan erişebilir miyim?',         a: 'Arayüz responsive olarak tasarlandı; mobil, tablet ve masaüstünde sorunsuz çalışır. Tarayıcıdan açmanız yeterli, ek uygulama gerekmez.' },
  { q: 'PDF rapor alabilir miyim?',                   a: 'Evet. Timesheet sayfasından dilediğiniz tarih aralığını seçerek PDF raporu indirebilirsiniz. Hızlı seçim chip\'leri (Bu Ay, Geçen Ay, Son 30 Gün, Bu Yıl) ile pratik kullanım.' },
]

const FaqAccordion = () => {
  const [open, setOpen] = useState(0)
  return (
    <section className="lp-section lp-faq" id="faq">
      <header className="lp-section-head">
        <p className="lp-section-kicker">Sıkça sorulanlar</p>
        <h2 className="lp-section-title">Akıllarda kalan sorular</h2>
      </header>

      <div className="lp-faq-list">
        {FAQ.map((item, i) => {
          const isOpen = open === i
          return (
            <div key={i} className={`lp-faq-item ${isOpen ? 'lp-faq-item--open' : ''}`}>
              <button
                type="button"
                className="lp-faq-q"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
              >
                <span>{item.q}</span>
                <Icon name="chevron_right" size={16} className="lp-faq-chev" />
              </button>
              <div id={`faq-panel-${i}`} className="lp-faq-a" role="region">
                <p>{item.a}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────
   6. FOOTER
   ──────────────────────────────────────────────── */
const Footer = ({ onLogin }) => (
  <footer className="lp-footer">
    <div className="lp-footer-top">
      <div className="lp-footer-brand">
        <div className="icon-stack" style={{ gap: 10 }}>
          <Logo size={32} />
          <strong>OtagWork</strong>
        </div>
        <p>İş akışınızı sadeleştirin, ekibinizi hizalayın.</p>
        <button className="lp-btn-primary icon-stack" onClick={onLogin} type="button" style={{ alignSelf: 'flex-start' }}>
          Giriş Yap <Icon name="arrow_right" size={14} />
        </button>
      </div>

      <div className="lp-footer-cols">
        <div>
          <h4>Ürün</h4>
          <a href="#features">Özellikler</a>
          <a href="#how">Nasıl Çalışır</a>
          <a href="#faq">SSS</a>
        </div>
        <div>
          <h4>Şirket</h4>
          <a href="#top">Hakkımızda</a>
          <a href="#top">İletişim</a>
        </div>
        <div>
          <h4>Yasal</h4>
          <a href="#top">Gizlilik</a>
          <a href="#top">Kullanım Koşulları</a>
        </div>
      </div>
    </div>

    <div className="lp-footer-bottom">
      <span>© 2026 OtagWork · Tüm hakları saklıdır.</span>
      <span>Modern Otağ · v1.0</span>
    </div>
  </footer>
)

export default LandingPage

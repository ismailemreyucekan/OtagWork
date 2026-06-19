import { useState } from 'react'
import './LoginPage.css'
import './SignupPage.css'
import Logo from './Logo'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'
const SESSION_KEY = 'iay_session'

/**
 * SignupPage — bireysel veya takım kuran kayıt akışı.
 *
 * Akış:
 *   1. Plan seç (Bireysel / Takım)
 *   2. Form: ad, soyad, e-posta, şifre, [takım için: takım adı]
 *   3. POST /auth/register-solo veya /auth/register-team
 *   4. Başarılıysa session'a yaz + sayfa yenilenir (App.jsx login view'a düşer
 *      ve LoginPage zaten oturum var diye dashboard'a yönlendirir).
 *
 * Props:
 *   onBackToLanding()  — sol üst geri linki
 *   onGoToLogin()      — "Zaten hesabım var" linki
 */
const SignupPage = ({ onBackToLanding, onGoToLogin }) => {
  const [plan, setPlan] = useState('solo')  // 'solo' | 'team'
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    team_name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Client-side doğrulama
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password) {
      setError('Lütfen tüm zorunlu alanları doldurun.')
      return
    }
    if (form.password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.')
      return
    }
    if (plan === 'team' && !form.team_name.trim()) {
      setError('Takım adını girin.')
      return
    }

    setLoading(true)
    try {
      const endpoint = plan === 'solo' ? '/auth/register-solo' : '/auth/register-team'
      const body = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      }
      if (plan === 'team') body.team_name = form.team_name.trim()

      const res = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.message || 'Kayıt başarısız.')
        return
      }

      // Başarılı → session'a yaz, dashboard'a düşür
      // LoginPage zaten SESSION_KEY okuyup dashboard'a yönlendiriyor.
      // localStorage'ı kalıcı tutuyoruz (signup sonrası "beni hatırla" varsayılan).
      const userPayload = {
        ...data.user,
        organization: data.organization,  // dashboard tarafında plan/role kontrolü için
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(userPayload))
      window.location.reload()
    } catch (err) {
      console.error(err)
      setError('Bağlantı hatası. Sunucuya ulaşılamıyor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-split signup-split">
      {/* SOL — Marka paneli */}
      <aside className="login-promo">
        <div className="login-promo-inner">
          <div className="promo-brand">
            <Logo size={56} variant="inverse" />
            <div>
              <div className="promo-brand-name">OtagWork</div>
              <div className="promo-brand-tag">Ücretsiz Kayıt Ol</div>
            </div>
          </div>

          <h2 className="promo-headline">
            Birkaç saniyede başlayın — kart bilgisi gerekmez.
          </h2>
          <p className="promo-sub">
            Bireysel mi çalışıyorsunuz, takım mı yönetiyorsunuz?
            İhtiyacınıza uygun planı seçin, hemen kullanmaya başlayın.
          </p>

          <ul className="promo-features">
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Bireysel Plan</strong>
                <span>Solo çalışanlar için: kendi görev, izin ve timesheet'inizi yönetin.</span>
              </div>
            </li>
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Takım Planı</strong>
                <span>Üye ekleyin, rol verin, izinleri onaylayın — workspace sizin.</span>
              </div>
            </li>
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Her Zaman Yükseltebilirsiniz</strong>
                <span>Solo başlayın, ekibiniz büyüdükçe Takım'a geçin.</span>
              </div>
            </li>
          </ul>

          <p className="promo-footer">© 2026 OtagWork · Tüm hakları saklıdır.</p>
        </div>
      </aside>

      {/* SAĞ — Signup formu */}
      <main className="login-pane">
        <div className="login-pane-inner sp-pane">
          <button type="button" className="login-back-link" onClick={onBackToLanding}>
            ← Ana sayfaya dön
          </button>

          <div className="login-header">
            <h1 className="login-title">Hesap oluştur</h1>
            <p className="login-subtitle">Hangi planla başlamak istiyorsunuz?</p>
          </div>

          {/* Plan seçimi — radyo kartlar */}
          <div className="sp-plan-grid">
            <button
              type="button"
              className={`sp-plan-card ${plan === 'solo' ? 'sp-plan-card--active' : ''}`}
              onClick={() => setPlan('solo')}
            >
              <div className="sp-plan-icon"><Icon name="user" size={22} /></div>
              <div className="sp-plan-label">Bireysel</div>
              <div className="sp-plan-desc">Tek başına kullan</div>
            </button>
            <button
              type="button"
              className={`sp-plan-card ${plan === 'team' ? 'sp-plan-card--active' : ''}`}
              onClick={() => setPlan('team')}
            >
              <div className="sp-plan-icon"><Icon name="users" size={22} /></div>
              <div className="sp-plan-label">Takım</div>
              <div className="sp-plan-desc">Ekibinle birlikte</div>
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
            {error && <div className="error-message">{error}</div>}

            <div className="sp-row">
              <div className="form-group">
                <label htmlFor="first_name">Ad</label>
                <input
                  type="text" id="first_name" name="first_name"
                  value={form.first_name} onChange={handleChange}
                  autoComplete="given-name" required disabled={loading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="last_name">Soyad</label>
                <input
                  type="text" id="last_name" name="last_name"
                  value={form.last_name} onChange={handleChange}
                  autoComplete="family-name" required disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">E-posta</label>
              <input
                type="email" id="email" name="email"
                value={form.email} onChange={handleChange}
                autoComplete="email" placeholder="ornek@email.com"
                required disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Şifre <span className="sp-hint">(en az 6 karakter)</span></label>
              <input
                type="password" id="password" name="password"
                value={form.password} onChange={handleChange}
                autoComplete="new-password" placeholder="••••••••"
                required minLength={6} disabled={loading}
              />
            </div>

            {plan === 'team' && (
              <div className="form-group sp-fade-in">
                <label htmlFor="team_name">Takım / Şirket Adı</label>
                <input
                  type="text" id="team_name" name="team_name"
                  value={form.team_name} onChange={handleChange}
                  placeholder="Acme Inc."
                  required={plan === 'team'} disabled={loading}
                />
              </div>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Hesap oluşturuluyor…' : (plan === 'solo' ? 'Bireysel Hesap Oluştur' : 'Takım Workspace Oluştur')}
            </button>
          </form>

          <p className="login-foot">
            Zaten hesabınız var mı? {' '}
            <button type="button" className="sp-link" onClick={onGoToLogin}>Giriş Yapın</button>
          </p>
        </div>
      </main>
    </div>
  )
}

export default SignupPage

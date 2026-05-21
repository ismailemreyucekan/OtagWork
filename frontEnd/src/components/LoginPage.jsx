import { useState, useEffect } from 'react'
import './LoginPage.css'
import AdminDashboard from './AdminDashboard'
import UserDashboard from './UserDashboard'
import Logo from './Logo'

const API_URL = 'http://localhost:5000/api'
const SESSION_KEY = 'iay_session'

const LoginPage = () => {
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loggedInUser, setLoggedInUser] = useState(null)

  // Şifre sıfırlama akışı
  const [resetOpen, setResetOpen] = useState(false)
  const [resetStep, setResetStep] = useState('request') // 'request' | 'verify' | 'done'
  const [resetEmail, setResetEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetNewPw, setResetNewPw] = useState('')
  const [resetMsg, setResetMsg] = useState({ type: '', text: '' })
  const [resetLoading, setResetLoading] = useState(false)

  // Sayfa açılırken kayıtlı oturumu kontrol et
  useEffect(() => {
    const saved =
      localStorage.getItem(SESSION_KEY) ||
      sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        const user = JSON.parse(saved)
        setLoggedInUser(user)
      } catch {
        localStorage.removeItem(SESSION_KEY)
        sessionStorage.removeItem(SESSION_KEY)
      }
    }
    // URL'de ?reset_token= varsa şifre sıfırlama modalını aç
    const params = new URLSearchParams(window.location.search)
    const tk = params.get('reset_token')
    if (tk) {
      setResetToken(tk)
      setResetStep('verify')
      setResetOpen(true)
    }
  }, [])

  const handleRequestReset = async (e) => {
    e?.preventDefault()
    setResetMsg({ type: '', text: '' })
    if (!resetEmail.trim()) return
    setResetLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      })
      const data = await res.json()
      setResetMsg({ type: 'success', text: data.message || 'Bağlantı gönderildi.' })
      // Dev: token e-postada/loglarda; kullanıcı manuel girebilsin diye verify adımına geç
      setResetStep('verify')
    } catch (_) {
      setResetMsg({ type: 'error', text: 'İstek gönderilemedi.' })
    } finally {
      setResetLoading(false)
    }
  }

  const handleResetSubmit = async (e) => {
    e?.preventDefault()
    setResetMsg({ type: '', text: '' })
    if (!resetToken.trim() || !resetNewPw) return
    if (resetNewPw.length < 6) {
      setResetMsg({ type: 'error', text: 'Şifre en az 6 karakter olmalı.' })
      return
    }
    setResetLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), new_password: resetNewPw }),
      })
      const data = await res.json()
      if (data.success) {
        setResetStep('done')
        setResetMsg({ type: 'success', text: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' })
        // URL'yi temizle
        if (window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      } else {
        setResetMsg({ type: 'error', text: data.message || 'Şifre güncellenemedi.' })
      }
    } catch (_) {
      setResetMsg({ type: 'error', text: 'İstek gönderilemedi.' })
    } finally {
      setResetLoading(false)
    }
  }

  const closeResetModal = () => {
    setResetOpen(false)
    setResetStep('request')
    setResetEmail('')
    setResetToken('')
    setResetNewPw('')
    setResetMsg({ type: '', text: '' })
  }

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const userData = data.user
        // "Beni hatırla" işaretliyse localStorage, değilse sessionStorage
        if (rememberMe) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
        } else {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(userData))
        }
        setLoggedInUser(userData)
      } else {
        setError(data.message || 'Giriş başarısız')
      }
    } catch (err) {
      console.error('Login hatası:', err)
      setError('Bağlantı hatası. Lütfen backend sunucusunun çalıştığından emin olun.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setLoggedInUser(null)
    setFormData({ email: '', password: '' })
    setRememberMe(false)
  }

  if (loggedInUser) {
    return (
      <div className="login-container">
        {loggedInUser.user_type === 'admin' || loggedInUser.user_type === 'manager' ? (
          <AdminDashboard user={loggedInUser} onLogout={handleLogout} />
        ) : (
          <UserDashboard user={loggedInUser} onLogout={handleLogout} />
        )}
      </div>
    )
  }

  return (
    <div className="login-split">
      {/* SOL — Tanıtım paneli */}
      <aside className="login-promo">
        <div className="login-promo-inner">
          <div className="promo-brand">
            <Logo size={56} variant="inverse" />
            <div>
              <div className="promo-brand-name">OtagWork</div>
              <div className="promo-brand-tag">Ekip & İş Akışı Platformu</div>
            </div>
          </div>

          <h2 className="promo-headline">
            Görevlerinizi, takımlarınızı ve zamanınızı tek bir yerden yönetin.
          </h2>
          <p className="promo-sub">
            OtagWork; günlük iş takibi, izin yönetimi, takım planlaması ve raporlamayı
            modern bir arayüzde birleştirir.
          </p>

          <ul className="promo-features">
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Kanban &amp; Takvim</strong>
                <span>Görevlerinizi sürükleyin, başlangıç–bitiş aralığını şerit görünümünde takip edin.</span>
              </div>
            </li>
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Timesheet &amp; Saat Analizi</strong>
                <span>Haftalık çalışma saatlerini etkinlik tipine göre görselleştirin.</span>
              </div>
            </li>
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>İzin &amp; Onay Akışları</strong>
                <span>Bakiye, talep ve yönetici onayı — uçtan uca dijital.</span>
              </div>
            </li>
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Ana Sayfa Özetleri</strong>
                <span>Bugün ne yapmalısınız? Tek bakışta her şey.</span>
              </div>
            </li>
          </ul>

          <p className="promo-footer">© 2026 OtagWork · Tüm hakları saklıdır.</p>
        </div>
      </aside>

      {/* SAĞ — Giriş paneli */}
      <main className="login-pane">
        <div className="login-pane-inner">
          <div className="login-header">
            <h1 className="login-title">Hoş geldiniz</h1>
            <p className="login-subtitle">Hesabınıza giriş yaparak devam edin.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="email">E-posta</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                autoComplete="username"
                placeholder="ornek@email.com"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Şifre</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <div className="form-options">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                />
                <span>Beni hatırla</span>
              </label>
              <a
                href="#"
                className="forgot-password"
                onClick={(e) => { e.preventDefault(); setResetOpen(true); setResetStep('request'); setResetEmail(formData.email || '') }}
              >Şifremi unuttum</a>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <p className="login-foot">
            Hesabınız mı yok? Yönetici ile iletişime geçin.
          </p>
        </div>
      </main>

      {/* ── ŞİFRE SIFIRLAMA MODALI ── */}
      {resetOpen && (
        <div className="reset-overlay" onClick={closeResetModal}>
          <div className="reset-modal" onClick={(e) => e.stopPropagation()}>
            <button className="reset-close" onClick={closeResetModal}>×</button>

            {resetStep === 'request' && (
              <>
                <h2 className="reset-title">Şifremi Unuttum</h2>
                <p className="reset-sub">E-posta adresini gir. Sıfırlama bağlantısını sana gönderelim.</p>
                <form className="reset-form" onSubmit={handleRequestReset}>
                  <input
                    type="email"
                    placeholder="E-posta adresiniz"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={resetLoading}
                  />
                  {resetMsg.text && (
                    <div className={`reset-msg ${resetMsg.type}`}>{resetMsg.text}</div>
                  )}
                  <button type="submit" className="reset-btn" disabled={resetLoading}>
                    {resetLoading ? 'Gönderiliyor…' : 'Bağlantı Gönder'}
                  </button>
                  <button type="button" className="reset-link" onClick={() => setResetStep('verify')}>
                    Zaten bir tokenim var
                  </button>
                </form>
              </>
            )}

            {resetStep === 'verify' && (
              <>
                <h2 className="reset-title">Yeni Şifre Oluştur</h2>
                <p className="reset-sub">E-postandaki bağlantıdaki token ile yeni şifreni belirle.</p>
                <form className="reset-form" onSubmit={handleResetSubmit}>
                  <input
                    type="text"
                    placeholder="Token"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    required
                    disabled={resetLoading}
                  />
                  <input
                    type="password"
                    placeholder="Yeni şifre (en az 6 karakter)"
                    value={resetNewPw}
                    onChange={(e) => setResetNewPw(e.target.value)}
                    required
                    minLength={6}
                    disabled={resetLoading}
                  />
                  {resetMsg.text && (
                    <div className={`reset-msg ${resetMsg.type}`}>{resetMsg.text}</div>
                  )}
                  <button type="submit" className="reset-btn" disabled={resetLoading}>
                    {resetLoading ? 'Güncelleniyor…' : 'Şifremi Sıfırla'}
                  </button>
                  <button type="button" className="reset-link" onClick={() => setResetStep('request')}>
                    Tekrar bağlantı iste
                  </button>
                </form>
              </>
            )}

            {resetStep === 'done' && (
              <>
                <h2 className="reset-title">Tamam!</h2>
                <p className="reset-sub">{resetMsg.text || 'Şifreniz güncellendi.'}</p>
                <button className="reset-btn" onClick={closeResetModal}>Giriş Ekranına Dön</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage

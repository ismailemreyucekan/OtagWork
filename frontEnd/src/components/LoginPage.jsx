import { useState, useEffect } from 'react'
import './LoginPage.css'
import AdminDashboard from './AdminDashboard'
import UserDashboard from './UserDashboard'

const API_URL = 'http://localhost:5000/api'
const SESSION_KEY = 'iay_session'

const LoginPage = () => {
  const [userType, setUserType] = useState(null)
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loggedInUser, setLoggedInUser] = useState(null)

  // 2FA akışı (login 2. adım)
  const [twoFactor, setTwoFactor] = useState({ required: false, userId: null, code: '' })

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

  const handleUserTypeSelect = (type) => {
    setUserType(type)
    setFormData({ email: '', password: '' })
    setError('')
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
          user_type: userType,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // 2FA gerekiyorsa adım 2'ye geç
        if (data['2fa_required']) {
          setTwoFactor({ required: true, userId: data.user_id, code: '' })
          return
        }
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

  const handleTwoFactorSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    if (!twoFactor.code || twoFactor.code.length !== 6) {
      setError('6 haneli kodu girin')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: twoFactor.userId, code: twoFactor.code }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const userData = data.user
        if (rememberMe) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
        } else {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(userData))
        }
        setLoggedInUser(userData)
        setTwoFactor({ required: false, userId: null, code: '' })
      } else {
        setError(data.message || 'Kod hatalı')
      }
    } catch (_) {
      setError('Doğrulama başarısız')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setLoggedInUser(null)
    setUserType(null)
    setFormData({ email: '', password: '' })
    setRememberMe(false)
    setTwoFactor({ required: false, userId: null, code: '' })
  }

  const handleBack = () => {
    setUserType(null)
    setFormData({ email: '', password: '' })
    setError('')
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
    <div className="login-container">
      {!userType ? (
        <div className="welcome-screen">
          <div className="welcome-header">
            <div className="logo">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="45" fill="#FFD700" stroke="#FFA500" strokeWidth="2"/>
                <text x="50" y="65" fontSize="50" fontWeight="bold" fill="#0a0e27" textAnchor="middle">İ</text>
              </svg>
            </div>
            <h1 className="welcome-title">İş Akış Yönetim Sistemi</h1>
            <p className="welcome-subtitle">Sisteme giriş yapmak için bir seçenek seçin</p>
          </div>

          <div className="login-cards-container">
            <div
              className="login-card-item user-card"
              onClick={() => handleUserTypeSelect('user')}
            >
              <div className="card-icon-wrapper user-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="card-title">Kullanıcı Girişi</h2>
              <p className="card-description">Normal kullanıcılar için giriş sayfası. Dashboard ve sistem sayfalarına erişim sağlar.</p>
              <div className="card-action">
                <span className="action-text">Giriş Yap</span>
                <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <div
              className="login-card-item admin-card"
              onClick={() => handleUserTypeSelect('admin')}
            >
              <div className="card-icon-wrapper admin-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L4 5V11C4 16.55 7.16 21.74 12 23C16.84 21.74 20 16.55 20 11V5L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="card-title">Admin Girişi</h2>
              <p className="card-description">Yöneticiler için özel giriş sayfası. Admin paneli ve sistem yönetimi erişimi sağlar.</p>
              <div className="card-action">
                <span className="action-text">Giriş Yap</span>
                <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <div className="footer">
            <p>© 2025 İş Akış Yönetim Sistemi. Tüm hakları saklıdır.</p>
          </div>
        </div>
      ) : (
        <div className="login-card">
          <div className="login-form-container">
            <button className="back-button" onClick={handleBack}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div className="login-header">
              <div className={`user-type-icon ${userType}`}>
                {userType === 'admin' ? (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20.59 22C20.59 18.13 16.74 15 12 15C7.26 15 3.41 18.13 3.41 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20 8L22 10L20 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 8L2 10L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <h1 className="login-title">
                {userType === 'admin' ? 'Admin Girişi' : 'Kullanıcı Girişi'}
              </h1>
              <p className="login-subtitle">Hesabınıza giriş yapın</p>
            </div>

            {twoFactor.required ? (
              <form className="login-form" onSubmit={handleTwoFactorSubmit} autoComplete="off">
                {error && <div className="error-message">{error}</div>}
                <div className="form-group">
                  <label htmlFor="totp">Doğrulama Kodu</label>
                  <input
                    type="text"
                    id="totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 haneli kod"
                    maxLength={6}
                    value={twoFactor.code}
                    onChange={(e) => setTwoFactor({ ...twoFactor, code: e.target.value.replace(/\D/g, '') })}
                    disabled={loading}
                    autoFocus
                    required
                  />
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                    Authenticator uygulamasındaki 6 haneli kodu girin.
                  </p>
                </div>
                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Doğrulanıyor…' : 'Doğrula'}
                </button>
                <button
                  type="button"
                  className="reset-link"
                  onClick={() => setTwoFactor({ required: false, userId: null, code: '' })}
                >
                  ← Giriş bilgilerini değiştir
                </button>
              </form>
            ) : (
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
                  autoComplete="off"
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
                  autoComplete="new-password"
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
            )}
          </div>
        </div>
      )}

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
                <h2 className="reset-title">✓ Tamam!</h2>
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

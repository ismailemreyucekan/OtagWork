import { useEffect, useState } from 'react'
import './LoginPage.css'
import './SignupPage.css'
import Logo from './Logo'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'
const SESSION_KEY = 'iay_session'

/**
 * InviteAcceptPage — davet linki ile gelen kullanıcı için kayıt formu.
 *
 * URL: /?invite=<token>  → App.jsx bu sayfayı açar.
 *
 * Akış:
 *   1. GET /auth/invite/:token  → davet bilgisi (org adı, e-posta, rol)
 *   2. Kullanıcı ad-soyad + şifre girer
 *   3. POST /auth/accept-invite → hesap oluşur ve org'a katılır
 *   4. Session'a yaz, sayfa yenilenir → dashboard
 *
 * Props:
 *   token            — URL'den gelen davet token'ı
 *   onBackToLogin()  — alt linkten geri dönüş
 */
const InviteAcceptPage = ({ token, onBackToLogin }) => {
  const [invite, setInvite] = useState(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [inviteError, setInviteError] = useState('')

  const [form, setForm] = useState({ first_name: '', last_name: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Token'ı al, davet bilgisini çek
  useEffect(() => {
    if (!token) return
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/auth/invite/${encodeURIComponent(token)}`)
        const data = await res.json()
        if (!active) return
        if (!res.ok || !data.success) {
          setInviteError(data.message || 'Davet bulunamadı')
        } else {
          setInvite(data.invite)
        }
      } catch (e) {
        setInviteError('Davet sunucudan alınamadı')
      } finally {
        if (active) setLoadingInvite(false)
      }
    })()
    return () => { active = false }
  }, [token])

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')

    if (!form.first_name.trim() || !form.last_name.trim() || !form.password) {
      setSubmitError('Lütfen tüm alanları doldurun.')
      return
    }
    if (form.password.length < 6) {
      setSubmitError('Şifre en az 6 karakter olmalı.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/auth/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          password: form.password,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setSubmitError(data.message || 'Hesap oluşturulamadı.')
        return
      }
      const payload = { ...data.user, organization: data.organization }
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
      // URL'den token'ı temizle, sonra yenile
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        window.history.replaceState({}, '', url.toString())
      } catch {}
      window.location.reload()
    } catch (e) {
      setSubmitError('Bağlantı hatası. Sunucuya ulaşılamıyor.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ───
  return (
    <div className="login-split signup-split">
      <aside className="login-promo">
        <div className="login-promo-inner">
          <div className="promo-brand">
            <Logo size={56} variant="inverse" />
            <div>
              <div className="promo-brand-name">OtagWork</div>
              <div className="promo-brand-tag">Davet Kabulü</div>
            </div>
          </div>

          {invite ? (
            <>
              <h2 className="promo-headline">
                <strong>{invite.organization?.name}</strong> sizi davet etti.
              </h2>
              <p className="promo-sub">
                <strong>{invite.email}</strong> e-postası ile <strong>{invite.role === 'manager' ? 'yönetici' : 'çalışan'}</strong> olarak
                workspace'e katılacaksınız. Birkaç saniyede hesabınızı oluşturun.
              </p>
            </>
          ) : (
            <>
              <h2 className="promo-headline">Workspace'e Katıl</h2>
              <p className="promo-sub">Davet bilgileriniz yükleniyor…</p>
            </>
          )}

          <ul className="promo-features">
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Hızlı Katılım</strong>
                <span>Sadece ad-soyad ve şifre belirleyin; gerisi hazır.</span>
              </div>
            </li>
            <li>
              <span className="promo-feature-bullet">✓</span>
              <div>
                <strong>Güvenli</strong>
                <span>Davet linki tek kullanımlık ve 7 gün geçerli.</span>
              </div>
            </li>
          </ul>

          <p className="promo-footer">© 2026 OtagWork · Tüm hakları saklıdır.</p>
        </div>
      </aside>

      <main className="login-pane">
        <div className="login-pane-inner sp-pane">
          <div className="login-header">
            <h1 className="login-title">Hesabınızı oluşturun</h1>
            <p className="login-subtitle">
              {invite?.organization?.name ? `${invite.organization.name} workspace'ine katılıyorsunuz.` : 'Davet detayları doğrulanıyor…'}
            </p>
          </div>

          {/* Davet hatası */}
          {loadingInvite && (
            <div className="error-message" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              Davet kontrol ediliyor…
            </div>
          )}
          {!loadingInvite && inviteError && (
            <>
              <div className="error-message">{inviteError}</div>
              <button type="button" className="login-button" onClick={onBackToLogin}>
                Giriş Sayfasına Dön
              </button>
            </>
          )}

          {/* Davet geçerli — form */}
          {!loadingInvite && !inviteError && invite && (
            <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
              {submitError && <div className="error-message">{submitError}</div>}

              {/* E-posta (read-only, görsel ipucu) */}
              <div className="form-group">
                <label>E-posta</label>
                <input type="email" value={invite.email} disabled
                       style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }} />
              </div>

              <div className="sp-row">
                <div className="form-group">
                  <label htmlFor="first_name">Ad</label>
                  <input
                    type="text" id="first_name" name="first_name"
                    value={form.first_name} onChange={handleChange}
                    autoComplete="given-name" required disabled={submitting}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="last_name">Soyad</label>
                  <input
                    type="text" id="last_name" name="last_name"
                    value={form.last_name} onChange={handleChange}
                    autoComplete="family-name" required disabled={submitting}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Şifre <span className="sp-hint">(en az 6 karakter)</span></label>
                <input
                  type="password" id="password" name="password"
                  value={form.password} onChange={handleChange}
                  autoComplete="new-password" placeholder="••••••••"
                  required minLength={6} disabled={submitting}
                />
              </div>

              <button type="submit" className="login-button icon-stack" disabled={submitting}>
                {submitting ? 'Katılınıyor…' : (
                  <><Icon name="check" size={16} /> Workspace'e Katıl</>
                )}
              </button>

              <p className="login-foot">
                Yanlış davet mi geldi? {' '}
                <button type="button" className="sp-link" onClick={onBackToLogin}>Giriş Sayfasına Dön</button>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

export default InviteAcceptPage

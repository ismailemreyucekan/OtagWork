import { useState } from 'react'
import './SecuritySettings.css'

const API_URL = 'http://localhost:5000/api'

const SecuritySettings = ({ user, open, onClose }) => {
  const [step, setStep] = useState('overview') // 'overview' | 'setup' | 'verify' | 'disable'
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  // Dashboard ilk login'de totp_enabled bilgisi gelmiyor; basit yaklaşım: backend'den her açılışta sor.
  // Şimdilik UI state olarak tut.
  const [enabled, setEnabled] = useState(false)

  if (!open) return null

  const startSetup = async () => {
    setMsg({ type: '', text: '' })
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/auth/2fa/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (data.success) {
        setSecret(data.secret)
        setUri(data.provisioning_uri)
        setStep('verify')
      } else {
        setMsg({ type: 'error', text: data.message || 'Kurulum başarısız' })
      }
    } catch (_) { setMsg({ type: 'error', text: 'Kurulum başarısız' }) }
    finally { setBusy(false) }
  }

  const enable2fa = async (e) => {
    e?.preventDefault()
    setMsg({ type: '', text: '' })
    if (code.length !== 6) { setMsg({ type: 'error', text: '6 haneli kod gerekli' }); return }
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/auth/2fa/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, code }),
      })
      const data = await res.json()
      if (data.success) {
        setEnabled(true)
        setStep('overview')
        setMsg({ type: 'success', text: '2FA başarıyla aktive edildi. Sonraki girişlerde kod gerekecek.' })
        setCode('')
      } else {
        setMsg({ type: 'error', text: data.message || 'Aktivasyon başarısız' })
      }
    } catch (_) { setMsg({ type: 'error', text: 'Aktivasyon başarısız' }) }
    finally { setBusy(false) }
  }

  const disable2fa = async (e) => {
    e?.preventDefault()
    setMsg({ type: '', text: '' })
    if (code.length !== 6) { setMsg({ type: 'error', text: '6 haneli kod gerekli' }); return }
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, code }),
      })
      const data = await res.json()
      if (data.success) {
        setEnabled(false)
        setStep('overview')
        setMsg({ type: 'success', text: '2FA devre dışı bırakıldı.' })
        setCode('')
      } else {
        setMsg({ type: 'error', text: data.message || 'İşlem başarısız' })
      }
    } catch (_) { setMsg({ type: 'error', text: 'İşlem başarısız' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="sec-overlay" onClick={onClose}>
      <div className="sec-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sec-close" onClick={onClose}>×</button>
        <h2 className="sec-title">🔐 Güvenlik Ayarları</h2>

        {step === 'overview' && (
          <>
            <p className="sec-sub">
              <strong>İki Faktörlü Doğrulama (2FA)</strong> — Hesabınıza ekstra bir güvenlik katmanı ekler.
            </p>
            {msg.text && <div className={`sec-msg ${msg.type}`}>{msg.text}</div>}

            <div className="sec-status">
              <span>Durum:</span>
              <span className={`sec-badge ${enabled ? 'on' : 'off'}`}>
                {enabled ? 'Aktif' : 'Pasif'}
              </span>
            </div>

            {!enabled ? (
              <button className="sec-btn" onClick={startSetup} disabled={busy}>
                {busy ? 'Hazırlanıyor…' : '2FA Kur'}
              </button>
            ) : (
              <button className="sec-btn danger" onClick={() => setStep('disable')}>
                2FA'yı Kapat
              </button>
            )}
          </>
        )}

        {step === 'verify' && (
          <>
            <p className="sec-sub">
              Authenticator uygulamanıza (Google Authenticator, Authy, Microsoft Authenticator) bu kodu ekleyin:
            </p>
            <div className="sec-secret-box">
              <code>{secret}</code>
              <button
                className="sec-copy"
                onClick={() => navigator.clipboard?.writeText(secret)}
                title="Kopyala"
              >Kopyala</button>
            </div>
            <details className="sec-details">
              <summary>Tam URI (gelişmiş)</summary>
              <code className="sec-uri">{uri}</code>
            </details>

            <form className="sec-form" onSubmit={enable2fa}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Uygulamadaki 6 haneli kodu girin"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              {msg.text && <div className={`sec-msg ${msg.type}`}>{msg.text}</div>}
              <div className="sec-actions">
                <button type="button" className="sec-btn ghost" onClick={() => setStep('overview')}>İptal</button>
                <button type="submit" className="sec-btn" disabled={busy}>Doğrula ve Aktive Et</button>
              </div>
            </form>
          </>
        )}

        {step === 'disable' && (
          <>
            <p className="sec-sub">
              2FA'yı kapatmak için authenticator uygulamanızdaki mevcut kodu girin.
            </p>
            <form className="sec-form" onSubmit={disable2fa}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 haneli kod"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              {msg.text && <div className={`sec-msg ${msg.type}`}>{msg.text}</div>}
              <div className="sec-actions">
                <button type="button" className="sec-btn ghost" onClick={() => setStep('overview')}>İptal</button>
                <button type="submit" className="sec-btn danger" disabled={busy}>2FA'yı Kapat</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default SecuritySettings

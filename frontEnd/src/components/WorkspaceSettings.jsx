import { useEffect, useState } from 'react'
import './MembersPage.css'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'
const SESSION_KEY = 'iay_session'

/**
 * WorkspaceSettings — owner-only sayfası.
 * - Workspace bilgisini gösterir (ad, slug, plan)
 * - Solo plan'da "Takım'a Yükselt" butonu
 *
 * Props:
 *   user   — aktif kullanıcı (org_role='owner' bekleniyor)
 */
const WorkspaceSettings = ({ user }) => {
  const [org, setOrg] = useState(user.organization || null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  // Upgrade modal
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [teamName, setTeamName] = useState(user.organization?.name || '')

  useEffect(() => {
    // Fresh fetch — login sonrası state'teki org güncel olmayabilir
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/organization/me`, { headers: { 'X-User-Id': user.id } })
        const data = await res.json()
        if (active && data.success) setOrg(data.organization)
      } catch {}
    })()
    return () => { active = false }
  }, [user.id])

  const flash = (type, text) => {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type: '', text: '' }), 4000)
  }

  const upgrade = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/organization/upgrade-to-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({ team_name: teamName.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Yükseltme başarısız')
        return
      }
      setOrg(data.organization)
      // localStorage'daki user objesinin organization'ını da güncelle
      try {
        const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null')
        if (stored) {
          stored.organization = data.organization
          const k = localStorage.getItem(SESSION_KEY) ? localStorage : sessionStorage
          k.setItem(SESSION_KEY, JSON.stringify(stored))
        }
      } catch {}
      flash('success', "Workspace 'Takım' planına yükseltildi.")
      setShowUpgrade(false)
    } catch {
      flash('error', 'Bağlantı hatası')
    } finally {
      setBusy(false)
    }
  }

  if (!org) return <div className="loading-state">Yükleniyor…</div>

  return (
    <div className="mp-wrap">
      <header className="mp-header">
        <div>
          <p className="page-kicker">Workspace bilgileri ve planı</p>
          <h2 className="page-title" style={{ fontSize: 22, margin: 0 }}>Workspace Ayarları</h2>
        </div>
      </header>

      {msg.text && <div className={`mp-toast mp-toast--${msg.type}`}>{msg.text}</div>}

      <section className="mp-list">
        <article className="mp-member" style={{ gridTemplateColumns: '1fr auto' }}>
          <div>
            <div className="mp-member-name">{org.name}</div>
            <div className="mp-member-email">slug: {org.slug}</div>
          </div>
          <div>
            <span className={`mp-role-pill mp-role-pill--${org.plan_type === 'team' ? 'manager' : 'member'}`}>
              {org.plan_type === 'team' ? 'Takım Planı' : 'Solo Planı'}
            </span>
          </div>
        </article>

        {/* Plan yükseltme — sadece solo'da */}
        {org.plan_type === 'solo' && (
          <article className="mp-member" style={{ gridTemplateColumns: '1fr auto', background: 'var(--primary-soft)', borderColor: 'var(--primary)' }}>
            <div>
              <div className="mp-member-name">Takıma Yükselt</div>
              <div className="mp-member-email">
                Ekip üyeleri ekleyin, rol atayın, izinleri onaylayın.
                Verileriniz korunur; sadece yeni özellikler eklenir.
              </div>
            </div>
            <button className="primary-button icon-stack" onClick={() => setShowUpgrade(true)}>
              <Icon name="users" size={14} /> Takım Kur
            </button>
          </article>
        )}
      </section>

      {/* Upgrade modal */}
      {showUpgrade && (
        <div className="modal-overlay" onClick={() => !busy && setShowUpgrade(false)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack"><Icon name="users" size={18} /> Takıma Yükselt</h2>
              <button className="modal-close" onClick={() => setShowUpgrade(false)}>×</button>
            </div>
            <div className="modal-form">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Workspace'iniz "team" planına yükseltilecek. Üye ekleyebilir, rol atayabilir, davet linki üretebilirsiniz.
                <br />Bu işlem geri alınabilir bir aksiyon değil.
              </p>
              <form onSubmit={upgrade}>
                <div className="form-group">
                  <label>Takım / Şirket Adı</label>
                  <input
                    type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Acme Inc."
                    required disabled={busy}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setShowUpgrade(false)} disabled={busy}>İptal</button>
                  <button type="submit" className="primary-button icon-stack" disabled={busy}>
                    {busy ? 'Yükseltiliyor…' : (<><Icon name="check" size={14} /> Yükselt</>)}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkspaceSettings

import { useEffect, useState, useCallback } from 'react'
import './MembersPage.css'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'

/**
 * MembersPage — workspace üye yönetimi (manager+ erişimi).
 *
 * - GET  /organization/members         → liste
 * - POST /organization/members         → direkt ekle
 * - POST /organization/invites         → davet linki üret
 * - PUT  /organization/members/:id/role → rol değiştir (owner)
 * - DELETE /organization/members/:id    → çıkar
 *
 * Props:
 *   user             — aktif kullanıcı (org_role, organization_id)
 *   onClose?         — modal modunda ise kapatma callback'i
 */
const MembersPage = ({ user }) => {
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ type: '', text: '' })

  // Add modal: 'direct' | 'invite' | null
  const [addMode, setAddMode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [direct, setDirect] = useState({ first_name: '', last_name: '', email: '', password: '', role: 'member' })
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member' })
  const [lastInvite, setLastInvite] = useState(null)  // gösterilecek davet linki

  const isOwner = user.org_role === 'owner'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`${API_URL}/organization/members`, { headers: { 'X-User-Id': user.id } }),
        fetch(`${API_URL}/organization/invites`,  { headers: { 'X-User-Id': user.id } }).catch(() => null),
      ])
      const mData = await mRes.json()
      if (mData.success) setMembers(mData.members || [])
      if (iRes) {
        try {
          const iData = await iRes.json()
          if (iData.success) setInvites(iData.invites || [])
        } catch {}
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Üyeler yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => { load() }, [load])

  const flash = (type, text) => {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type: '', text: '' }), 4000)
  }

  // ── Direkt ekleme ───────────────────────────────────────
  const submitDirect = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/organization/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(direct),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Üye eklenemedi')
        return
      }
      flash('success', `${data.member.email} eklendi`)
      setDirect({ first_name: '', last_name: '', email: '', password: '', role: 'member' })
      setAddMode(null)
      load()
    } catch (e) {
      flash('error', 'Bağlantı hatası')
    } finally {
      setBusy(false)
    }
  }

  // ── Davet linki ─────────────────────────────────────────
  const submitInvite = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/organization/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(inviteForm),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Davet üretilemedi')
        return
      }
      // Davet linki paylaşıma hazır göster
      const url = `${window.location.origin}/?invite=${encodeURIComponent(data.invite.token)}`
      setLastInvite({ url, email: data.invite.email, role: data.invite.role })
      flash('success', `${data.invite.email} için davet üretildi`)
      setInviteForm({ email: '', role: 'member' })
      load()
    } catch (e) {
      flash('error', 'Bağlantı hatası')
    } finally {
      setBusy(false)
    }
  }

  // ── Rol değiştir ────────────────────────────────────────
  const changeRole = async (memberId, newRole) => {
    if (!isOwner) return
    try {
      const res = await fetch(`${API_URL}/organization/members/${memberId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({ role: newRole }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Rol değiştirilemedi')
        return
      }
      flash('success', 'Rol güncellendi')
      load()
    } catch {
      flash('error', 'Bağlantı hatası')
    }
  }

  // ── Üyeyi çıkar ─────────────────────────────────────────
  const removeMember = async (memberId, email) => {
    if (!window.confirm(`${email} workspace'ten çıkarılsın mı?`)) return
    try {
      const res = await fetch(`${API_URL}/organization/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': user.id },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Üye çıkarılamadı')
        return
      }
      flash('success', 'Üye çıkarıldı')
      load()
    } catch {
      flash('error', 'Bağlantı hatası')
    }
  }

  // ── Daveti iptal et ─────────────────────────────────────
  const cancelInvite = async (inviteId) => {
    if (!window.confirm('Bu davet iptal edilsin mi?')) return
    try {
      await fetch(`${API_URL}/organization/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': user.id },
      })
      load()
    } catch {}
  }

  const copyLink = (url) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => flash('success', 'Davet linki kopyalandı'))
    }
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="mp-wrap">
      <header className="mp-header">
        <div>
          <p className="page-kicker">Workspace üyeleri ve davet linkleri</p>
          <h2 className="page-title" style={{ fontSize: 22, margin: 0 }}>Üyeler ({members.length})</h2>
        </div>
        <div className="mp-actions">
          <button className="ghost-button icon-stack" onClick={() => setAddMode('invite')}>
            <Icon name="link" size={14} /> Davet Linki
          </button>
          <button className="primary-button icon-stack" onClick={() => setAddMode('direct')}>
            <Icon name="plus" size={14} /> Direkt Ekle
          </button>
        </div>
      </header>

      {msg.text && <div className={`mp-toast mp-toast--${msg.type}`}>{msg.text}</div>}

      {/* Son üretilen davet linki */}
      {lastInvite && (
        <div className="mp-invite-banner">
          <Icon name="link" size={16} />
          <div className="mp-invite-banner-body">
            <strong>{lastInvite.email}</strong> için davet linki üretildi ({lastInvite.role}):
            <code>{lastInvite.url}</code>
          </div>
          <button className="ghost-button icon-stack" onClick={() => copyLink(lastInvite.url)}>
            <Icon name="check" size={12} /> Kopyala
          </button>
          <button className="icon-button" onClick={() => setLastInvite(null)} title="Kapat"><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* Üyeler tablosu */}
      <section className="mp-list">
        {loading && <div className="loading-state">Yükleniyor…</div>}
        {!loading && members.length === 0 && <div className="loading-state">Henüz üye yok</div>}
        {!loading && members.map(m => (
          <article key={m.id} className="mp-member">
            <div className="mp-avatar">{(m.first_name?.[0] || '?').toUpperCase()}{(m.last_name?.[0] || '').toUpperCase()}</div>
            <div className="mp-member-info">
              <div className="mp-member-name">
                {m.first_name} {m.last_name}
                {m.id === user.id && <span className="mp-self-tag">Sen</span>}
              </div>
              <div className="mp-member-email">{m.email}</div>
            </div>
            <div className="mp-member-role">
              {isOwner && m.id !== user.id ? (
                <select value={m.org_role} onChange={(e) => changeRole(m.id, e.target.value)} className="select-input">
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="member">Member</option>
                </select>
              ) : (
                <span className={`mp-role-pill mp-role-pill--${m.org_role}`}>{m.org_role}</span>
              )}
            </div>
            <div className="mp-member-actions">
              {isOwner && m.id !== user.id && m.org_role !== 'owner' && (
                <button className="icon-button danger" onClick={() => removeMember(m.id, m.email)} title="Çıkar">
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* Bekleyen davetler */}
      {invites.filter(i => i.is_valid).length > 0 && (
        <section className="mp-invites">
          <h3 className="mp-section-title">Bekleyen Davetler</h3>
          {invites.filter(i => i.is_valid).map(inv => (
            <article key={inv.id} className="mp-invite-row">
              <div className="mp-avatar mp-avatar--ghost"><Icon name="hourglass" size={14} /></div>
              <div className="mp-member-info">
                <div className="mp-member-name">{inv.email}</div>
                <div className="mp-member-email">{inv.role} • {new Date(inv.expires_at).toLocaleDateString('tr-TR')} sona erer</div>
              </div>
              <button className="icon-button" onClick={() => cancelInvite(inv.id)} title="Daveti iptal et">
                <Icon name="x" size={14} />
              </button>
            </article>
          ))}
        </section>
      )}

      {/* ── ADD MODAL ── */}
      {addMode && (
        <div className="modal-overlay" onClick={() => !busy && setAddMode(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack">
                <Icon name={addMode === 'direct' ? 'plus' : 'link'} size={18} />
                {addMode === 'direct' ? 'Üye Ekle' : 'Davet Linki Üret'}
              </h2>
              <button className="modal-close" onClick={() => setAddMode(null)}>×</button>
            </div>
            <div className="modal-form">
              {/* Sekme barı */}
              <div className="mp-tabs">
                <button className={`mp-tab ${addMode === 'direct' ? 'active' : ''}`} onClick={() => setAddMode('direct')}>
                  Direkt Ekle
                </button>
                <button className={`mp-tab ${addMode === 'invite' ? 'active' : ''}`} onClick={() => setAddMode('invite')}>
                  Davet Linki
                </button>
              </div>

              {addMode === 'direct' && (
                <form onSubmit={submitDirect}>
                  <div className="sp-row">
                    <div className="form-group">
                      <label>Ad</label>
                      <input value={direct.first_name} onChange={(e) => setDirect({ ...direct, first_name: e.target.value })} required disabled={busy} />
                    </div>
                    <div className="form-group">
                      <label>Soyad</label>
                      <input value={direct.last_name} onChange={(e) => setDirect({ ...direct, last_name: e.target.value })} required disabled={busy} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>E-posta</label>
                    <input type="email" value={direct.email} onChange={(e) => setDirect({ ...direct, email: e.target.value })} required disabled={busy} />
                  </div>
                  <div className="form-group">
                    <label>Geçici Şifre <span className="sp-hint">(en az 6 karakter)</span></label>
                    <input type="text" value={direct.password} onChange={(e) => setDirect({ ...direct, password: e.target.value })} required minLength={6} disabled={busy} />
                  </div>
                  <div className="form-group">
                    <label>Rol</label>
                    <select value={direct.role} onChange={(e) => setDirect({ ...direct, role: e.target.value })} disabled={busy}>
                      <option value="member">Member (çalışan)</option>
                      <option value="manager">Manager (yönetici)</option>
                    </select>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="ghost-button" onClick={() => setAddMode(null)} disabled={busy}>İptal</button>
                    <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Ekleniyor…' : 'Ekle'}</button>
                  </div>
                </form>
              )}

              {addMode === 'invite' && (
                <form onSubmit={submitInvite}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Kullanıcıya gönderilebilen tek-kullanımlık bir link üretilir. 7 gün geçerlidir.
                  </p>
                  <div className="form-group">
                    <label>E-posta</label>
                    <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required disabled={busy} />
                  </div>
                  <div className="form-group">
                    <label>Rol</label>
                    <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} disabled={busy}>
                      <option value="member">Member (çalışan)</option>
                      <option value="manager">Manager (yönetici)</option>
                    </select>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="ghost-button" onClick={() => setAddMode(null)} disabled={busy}>İptal</button>
                    <button type="submit" className="primary-button icon-stack" disabled={busy}>
                      {busy ? 'Üretiliyor…' : (<><Icon name="link" size={14} /> Link Üret</>)}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MembersPage

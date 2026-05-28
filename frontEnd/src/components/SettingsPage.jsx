import { useState, useEffect } from 'react'
import './SettingsPage.css'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'
const SESSION_KEY = 'iay_session'

/**
 * SettingsPage — kullanıcının hesap ayarları.
 *
 * 3 sekme:
 *   - Hesap     : ad, soyad, telefon (e-posta read-only)
 *   - Güvenlik  : şifre değiştirme
 *   - Timesheet : projeler, aktivite tipleri, çalışma şekilleri (read-only liste)
 *
 * Props:
 *   user     — aktif kullanıcı
 *   onUserUpdate(updatedUser)  — başarılı güncelleme sonrası parent'a haber
 */
const SettingsPage = ({ user, onUserUpdate }) => {
  const [tab, setTab] = useState('account')  // 'account' | 'security' | 'timesheet'
  const [msg, setMsg] = useState({ type: '', text: '' })

  // Hesap bilgileri
  const [account, setAccount] = useState({
    first_name: user.first_name || '',
    last_name:  user.last_name  || '',
    phone_number: user.phone_number || '',
  })
  const [accountBusy, setAccountBusy] = useState(false)

  // Şifre
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdBusy, setPwdBusy] = useState(false)

  // Timesheet ayarları — bu workspace'in projeler/aktivite/çalışma şekilleri
  const [tsList, setTsList] = useState([])  // tüm kayıtlar tek dizi
  const [tsLoading, setTsLoading] = useState(false)
  const [tsBusy, setTsBusy] = useState(false)
  // Add/Edit modal — admin paneliyle aynı
  const [tsModal, setTsModal] = useState({
    open: false, type: 'project', editing: null,
    value: '', display_order: 0, is_active: true,
  })

  const flash = (type, text) => {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type: '', text: '' }), 4000)
  }

  // Timesheet ayarlarını çek (include_inactive=true: aktif+pasif tümü gelir)
  const loadTsSettings = async () => {
    setTsLoading(true)
    try {
      const res = await fetch(`${API_URL}/timesheet-settings?include_inactive=true`, {
        headers: { 'X-User-Id': String(user.id) },
      })
      const data = await res.json()
      if (data.success) setTsList(data.settings || [])
    } catch {} finally { setTsLoading(false) }
  }

  useEffect(() => {
    if (tab !== 'timesheet') return
    loadTsSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const tsByType = (type) => tsList.filter(s => s.setting_type === type)

  // Modal aç (yeni veya düzenle)
  const openTsModal = (type, editing = null) => {
    setTsModal({
      open: true, type, editing,
      value: editing?.value || '',
      display_order: editing?.display_order || 0,
      is_active: editing ? editing.is_active : true,
    })
  }

  // Submit (POST veya PUT)
  const submitTsModal = async (e) => {
    e.preventDefault()
    if (!tsModal.value.trim()) return
    setTsBusy(true)
    try {
      const url = tsModal.editing
        ? `${API_URL}/timesheet-settings/${tsModal.editing.id}`
        : `${API_URL}/timesheet-settings`
      const method = tsModal.editing ? 'PUT' : 'POST'
      const body = {
        setting_type: tsModal.type,
        value: tsModal.value.trim(),
        display_order: Number(tsModal.display_order) || 0,
        is_active: tsModal.is_active,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(user.id) },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Kaydedilemedi')
        return
      }
      setTsModal({ open: false, type: 'project', editing: null, value: '', display_order: 0, is_active: true })
      loadTsSettings()
    } catch {
      flash('error', 'Bağlantı hatası')
    } finally {
      setTsBusy(false)
    }
  }

  const deleteSetting = async (id, value) => {
    if (!window.confirm(`"${value}" silinsin mi?`)) return
    setTsBusy(true)
    try {
      const res = await fetch(`${API_URL}/timesheet-settings/${id}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': String(user.id) },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Silinemedi')
        return
      }
      loadTsSettings()
    } catch {
      flash('error', 'Bağlantı hatası')
    } finally {
      setTsBusy(false)
    }
  }

  // Tip → görsel başlık
  const TS_TYPE_META = {
    project:       { title: 'Projeler',         singular: 'Proje',         add: '+ Proje Ekle' },
    activity_type: { title: 'Aktivite Tipleri', singular: 'Aktivite Tipi', add: '+ Aktivite Tipi Ekle' },
    work_mode:     { title: 'Çalışma Şekilleri', singular: 'Çalışma Şekli', add: '+ Çalışma Şekli Ekle' },
  }

  // ── Hesap kaydet ──
  const saveAccount = async (e) => {
    e.preventDefault()
    setAccountBusy(true)
    try {
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Güncellenemedi')
        return
      }
      flash('success', 'Bilgiler güncellendi')

      // Session ve parent'i senkronize et
      const merged = { ...user, ...data.user, organization: user.organization }
      const storage = localStorage.getItem(SESSION_KEY) ? localStorage : sessionStorage
      storage.setItem(SESSION_KEY, JSON.stringify(merged))
      onUserUpdate?.(merged)
    } catch (e) {
      flash('error', 'Bağlantı hatası')
    } finally {
      setAccountBusy(false)
    }
  }

  // ── Şifre değiştir ──
  const changePassword = async (e) => {
    e.preventDefault()
    if (pwd.next.length < 6) { flash('error', 'Yeni şifre en az 6 karakter olmalı'); return }
    if (pwd.next !== pwd.confirm) { flash('error', 'Şifre tekrarı eşleşmiyor'); return }

    setPwdBusy(true)
    try {
      // Doğrulamak için önce eski şifre ile login deneyelim (basit yöntem)
      const verifyRes = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: pwd.current }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok || !verifyData.success) {
        flash('error', 'Mevcut şifre hatalı')
        return
      }

      // Yeni şifreyi kaydet
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd.next }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        flash('error', data.message || 'Şifre değiştirilemedi')
        return
      }
      flash('success', 'Şifre güncellendi')
      setPwd({ current: '', next: '', confirm: '' })
    } catch (e) {
      flash('error', 'Bağlantı hatası')
    } finally {
      setPwdBusy(false)
    }
  }

  return (
    <div className="settings-wrap">
      {msg.text && <div className={`mp-toast mp-toast--${msg.type}`}>{msg.text}</div>}

      {/* Sekmeler */}
      <div className="settings-tabs">
        <button className={`settings-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
          <Icon name="user" size={14} /> Hesap
        </button>
        <button className={`settings-tab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>
          <Icon name="lock" size={14} /> Güvenlik
        </button>
        <button className={`settings-tab ${tab === 'timesheet' ? 'active' : ''}`} onClick={() => setTab('timesheet')}>
          <Icon name="clock" size={14} /> Timesheet
        </button>
      </div>

      {/* HESAP */}
      {tab === 'account' && (
        <section className="settings-card">
          <h3>Profil Bilgileri</h3>
          <p className="settings-desc">Adınızı, soyadınızı ve telefon numaranızı güncelleyebilirsiniz.</p>
          <form onSubmit={saveAccount} className="settings-form">
            <div className="form-row">
              <div className="form-group">
                <label>Ad</label>
                <input value={account.first_name} onChange={(e) => setAccount({ ...account, first_name: e.target.value })} required disabled={accountBusy} />
              </div>
              <div className="form-group">
                <label>Soyad</label>
                <input value={account.last_name} onChange={(e) => setAccount({ ...account, last_name: e.target.value })} required disabled={accountBusy} />
              </div>
            </div>
            <div className="form-group">
              <label>E-posta <span className="settings-hint">(değiştirilemez)</span></label>
              <input type="email" value={user.email} disabled
                     style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }} />
            </div>
            <div className="form-group">
              <label>Telefon</label>
              <input type="tel" value={account.phone_number} onChange={(e) => setAccount({ ...account, phone_number: e.target.value })} placeholder="+90 ..." disabled={accountBusy} />
            </div>
            <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
              <button type="submit" className="primary-button icon-stack" disabled={accountBusy}>
                {accountBusy ? 'Kaydediliyor…' : (<><Icon name="check" size={14} /> Kaydet</>)}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* GÜVENLİK */}
      {tab === 'security' && (
        <section className="settings-card">
          <h3>Şifre Değiştir</h3>
          <p className="settings-desc">Mevcut şifrenizi doğrulayın ve yenisini belirleyin (en az 6 karakter).</p>
          <form onSubmit={changePassword} className="settings-form">
            <div className="form-group">
              <label>Mevcut Şifre</label>
              <input type="password" autoComplete="current-password"
                     value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                     required disabled={pwdBusy} />
            </div>
            <div className="form-group">
              <label>Yeni Şifre</label>
              <input type="password" autoComplete="new-password"
                     value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                     required minLength={6} disabled={pwdBusy} />
            </div>
            <div className="form-group">
              <label>Yeni Şifre Tekrar</label>
              <input type="password" autoComplete="new-password"
                     value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                     required minLength={6} disabled={pwdBusy} />
            </div>
            <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
              <button type="submit" className="primary-button icon-stack" disabled={pwdBusy}>
                {pwdBusy ? 'Güncelleniyor…' : (<><Icon name="lock" size={14} /> Şifreyi Güncelle</>)}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TIMESHEET AYARLARI — Admin tarzı tablolar */}
      {tab === 'timesheet' && (
        <section className="settings-card">
          <h3>Timesheet Seçenekleri</h3>
          <p className="settings-desc">
            Timesheet kaydederken kullanacağınız seçenekler. Aktivite Tipleri ve Çalışma Şekilleri
            için varsayılan değerler hazırdır — istediğiniz zaman ekleyip silebilir, sırasını
            değiştirebilirsiniz. Projeler boş başlar; kendiniz ekleyin.
          </p>

          {tsLoading ? (
            <div className="loading-state">Yükleniyor…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {['project', 'activity_type', 'work_mode'].map(type => {
                const rows = tsByType(type)
                const meta = TS_TYPE_META[type]
                return (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {meta.title}
                      </h4>
                      <button className="primary-button icon-stack" onClick={() => openTsModal(type)} disabled={tsBusy}>
                        <Icon name="plus" size={14} /> {meta.singular} Ekle
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="user-table">
                        <thead>
                          <tr>
                            <th>{meta.singular}</th>
                            <th>Durum</th>
                            <th>Sıra</th>
                            <th style={{ width: 90 }}>İşlemler</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: 18, color: 'var(--text-subtle)' }}>
                                Henüz {meta.singular.toLowerCase()} eklenmemiş
                              </td>
                            </tr>
                          ) : rows.map(s => (
                            <tr key={s.id}>
                              <td>{s.value}</td>
                              <td>
                                <span className={`pill pill-status ${s.is_active ? 'pill-success' : 'pill-muted'}`}>
                                  {s.is_active ? 'Aktif' : 'Pasif'}
                                </span>
                              </td>
                              <td>{s.display_order}</td>
                              <td className="actions-cell">
                                <button className="icon-button" onClick={() => openTsModal(type, s)} title="Düzenle">
                                  <Icon name="edit" size={14} />
                                </button>
                                <button className="icon-button danger" onClick={() => deleteSetting(s.id, s.value)} title="Sil">
                                  <Icon name="trash" size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Add/Edit Modal ── */}
      {tsModal.open && (
        <div className="modal-overlay" onClick={() => !tsBusy && setTsModal({ ...tsModal, open: false })}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack">
                <Icon name={tsModal.editing ? 'edit' : 'plus'} size={18} />
                {tsModal.editing ? `${TS_TYPE_META[tsModal.type].singular} Düzenle` : `Yeni ${TS_TYPE_META[tsModal.type].singular}`}
              </h2>
              <button className="modal-close" onClick={() => setTsModal({ ...tsModal, open: false })}>×</button>
            </div>
            <form className="modal-form" onSubmit={submitTsModal}>
              <div className="form-group">
                <label>{TS_TYPE_META[tsModal.type].singular} *</label>
                <input
                  type="text"
                  value={tsModal.value}
                  onChange={(e) => setTsModal({ ...tsModal, value: e.target.value })}
                  required disabled={tsBusy} autoFocus
                />
              </div>
              <div className="form-group">
                <label>Sıra <span className="settings-hint">(küçük olan önce gözükür)</span></label>
                <input
                  type="number"
                  value={tsModal.display_order}
                  onChange={(e) => setTsModal({ ...tsModal, display_order: e.target.value })}
                  disabled={tsBusy}
                />
              </div>
              <div className="form-group">
                <label className="icon-stack" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={tsModal.is_active}
                    onChange={(e) => setTsModal({ ...tsModal, is_active: e.target.checked })}
                    disabled={tsBusy}
                  />
                  Aktif (timesheet eklerken seçilebilir)
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setTsModal({ ...tsModal, open: false })} disabled={tsBusy}>İptal</button>
                <button type="submit" className="primary-button icon-stack" disabled={tsBusy || !tsModal.value.trim()}>
                  {tsBusy ? 'Kaydediliyor…' : (<><Icon name="check" size={14} /> {tsModal.editing ? 'Güncelle' : 'Ekle'}</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPage

import { useEffect, useState, useCallback } from 'react'
import './AuditLog.css'

const API_URL = 'http://localhost:5000/api'

const EVENT_LABEL = {
  login_success: 'Giriş Başarılı',
  login_failed: 'Giriş Başarısız',
  logout: 'Çıkış',
  password_reset_requested: 'Şifre Sıfırlama Talebi',
  password_reset_done: 'Şifre Sıfırlandı',
  '2fa_enabled': '2FA Aktive',
  '2fa_disabled': '2FA Kapatıldı',
  '2fa_verified': '2FA Doğrulandı',
  '2fa_failed': '2FA Hatalı Kod',
  user_created: 'Kullanıcı Oluşturuldu',
  user_deleted: 'Kullanıcı Silindi',
}

const EVENT_COLOR = {
  login_success: '#10b981',
  login_failed: '#ef4444',
  password_reset_requested: '#3b82f6',
  password_reset_done: '#10b981',
  '2fa_enabled': '#10b981',
  '2fa_disabled': '#f59e0b',
  '2fa_verified': '#10b981',
  '2fa_failed': '#ef4444',
}

const fmtTime = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('tr-TR') } catch { return iso }
}

const AuditLog = ({ user }) => {
  const [entries, setEntries] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = `${API_URL}/audit?requester_id=${user.id}&limit=200${filter ? `&event=${filter}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) setEntries(data.entries || [])
    } catch (_) {}
    finally { setLoading(false) }
  }, [user.id, filter])

  useEffect(() => { load() }, [load])

  return (
    <div className="al-wrap">
      <div className="al-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tüm olaylar</option>
          <option value="login_success">Giriş başarılı</option>
          <option value="login_failed">Giriş başarısız</option>
          <option value="password_reset_done">Şifre sıfırlandı</option>
          <option value="2fa_enabled">2FA aktive</option>
          <option value="2fa_failed">2FA hatalı</option>
        </select>
        <button className="al-refresh" onClick={load} disabled={loading}>
          {loading ? 'Yükleniyor…' : '🔄 Yenile'}
        </button>
      </div>

      <div className="al-table-wrap">
        <table className="al-table">
          <thead>
            <tr>
              <th>Olay</th>
              <th>Kullanıcı</th>
              <th>Hedef</th>
              <th>IP</th>
              <th>Detay</th>
              <th>Zaman</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="al-empty">Kayıt bulunamadı.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td>
                  <span className="al-event" style={{ background: (EVENT_COLOR[e.event] || '#94a3b8') + '22', color: EVENT_COLOR[e.event] || '#475569' }}>
                    {EVENT_LABEL[e.event] || e.event}
                  </span>
                </td>
                <td>{e.actor ? `${e.actor.first_name} ${e.actor.last_name}` : '—'}</td>
                <td>{e.target || '—'}</td>
                <td className="al-mono">{e.ip_address || '—'}</td>
                <td className="al-detail">{e.detail || '—'}</td>
                <td className="al-mono">{fmtTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AuditLog

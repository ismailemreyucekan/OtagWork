import { useEffect, useState, useCallback } from 'react'
import './LeavesPanel.css'

const API_URL = 'http://localhost:5000/api'

const TYPE_LABEL = {
  yillik: 'Yıllık İzin',
  mazeret: 'Mazeret',
  saglik: 'Sağlık',
  ucretsiz: 'Ücretsiz',
  dogum: 'Doğum',
  diger: 'Diğer',
}

const STATUS_LABEL = {
  onay_bekliyor: 'Onay Bekliyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
}

const STATUS_COLOR = {
  onay_bekliyor: '#f59e0b',
  onaylandi: '#10b981',
  reddedildi: '#ef4444',
  iptal: '#94a3b8',
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('tr-TR') } catch { return iso }
}

const todayStr = () => new Date().toISOString().slice(0, 10)

/**
 * mode='user'    → kendi taleplerini görür, yeni talep oluşturur, iptal eder
 * mode='manager' → ekip üyelerinin taleplerini görür ve onaylar/reddeder
 */
const LeavesPanel = ({ user, mode = 'user' }) => {
  const [items, setItems] = useState([])
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    leave_type: 'yillik',
    start_date: todayStr(),
    end_date: todayStr(),
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = mode === 'manager'
        ? `${API_URL}/leaves?manager_id=${user.id}`
        : `${API_URL}/leaves?user_id=${user.id}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) setItems(data.leaves || [])
      if (mode === 'user') {
        const br = await fetch(`${API_URL}/leaves/balance/${user.id}`).then(r => r.json())
        if (br.success) setBalance(br)
      }
    } catch (_) {}
    finally { setLoading(false) }
  }, [user.id, mode])

  useEffect(() => { load() }, [load])

  const submitRequest = async (e) => {
    e?.preventDefault()
    setMsg({ type: '', text: '' })
    if (!form.start_date || !form.end_date) { setMsg({ type: 'error', text: 'Tarihler zorunlu' }); return }
    if (form.end_date < form.start_date) { setMsg({ type: 'error', text: 'Bitiş başlangıçtan önce olamaz' }); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ...form, user_id: user.id }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg({ type: 'success', text: 'Talebiniz oluşturuldu.' })
        setForm({ leave_type: 'yillik', start_date: todayStr(), end_date: todayStr(), reason: '' })
        load()
      } else {
        setMsg({ type: 'error', text: data.message || 'Talep oluşturulamadı' })
      }
    } catch (_) { setMsg({ type: 'error', text: 'Talep oluşturulamadı' }) }
    finally { setSubmitting(false) }
  }

  const handleApprove = async (id) => {
    try {
      await fetch(`${API_URL}/leaves/${id}/approval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'onaylandi', approver_id: user.id }),
      })
      load()
    } catch (_) {}
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return
    try {
      await fetch(`${API_URL}/leaves/${rejectModal.id}/approval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reddedildi', approver_id: user.id, reject_reason: rejectModal.reason }),
      })
      setRejectModal({ open: false, id: null, reason: '' })
      load()
    } catch (_) {}
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Talebinizi iptal etmek istiyor musunuz?')) return
    try {
      await fetch(`${API_URL}/leaves/${id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      load()
    } catch (_) {}
  }

  return (
    <div className="lv-wrap">
      {mode === 'user' && balance && (
        <div className="lv-balance">
          <div className="lv-bal-card">
            <div className="lv-bal-label">Yıllık Hak</div>
            <div className="lv-bal-value">{balance.annual_quota} gün</div>
          </div>
          <div className="lv-bal-card success">
            <div className="lv-bal-label">Kullanılan</div>
            <div className="lv-bal-value">{balance.approved_days} gün</div>
          </div>
          <div className="lv-bal-card warn">
            <div className="lv-bal-label">Beklemede</div>
            <div className="lv-bal-value">{balance.pending_days} gün</div>
          </div>
          <div className="lv-bal-card primary">
            <div className="lv-bal-label">Kalan</div>
            <div className="lv-bal-value">{balance.remaining} gün</div>
          </div>
        </div>
      )}

      {mode === 'user' && (
        <form className="lv-form" onSubmit={submitRequest}>
          <h3>Yeni İzin Talebi</h3>
          <div className="lv-form-row">
            <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <textarea
            rows={2}
            placeholder="Açıklama (opsiyonel)"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          {msg.text && <div className={`lv-msg ${msg.type}`}>{msg.text}</div>}
          <button type="submit" className="lv-btn" disabled={submitting}>
            {submitting ? 'Gönderiliyor…' : 'Talep Oluştur'}
          </button>
        </form>
      )}

      <div className="lv-list-section">
        <h3>{mode === 'manager' ? 'Ekip İzin Talepleri' : 'Taleplerim'}</h3>
        {loading && <div className="lv-empty">Yükleniyor…</div>}
        {!loading && items.length === 0 && <div className="lv-empty">Kayıt bulunmuyor.</div>}

        <div className="lv-list">
          {items.map(l => (
            <div key={l.id} className="lv-item">
              <div className="lv-item-main">
                <div className="lv-item-head">
                  {mode === 'manager' && l.user && (
                    <span className="lv-user">{l.user.first_name} {l.user.last_name}</span>
                  )}
                  <span className="lv-type">{TYPE_LABEL[l.leave_type] || l.leave_type}</span>
                  <span className="lv-status" style={{ background: STATUS_COLOR[l.status] + '22', color: STATUS_COLOR[l.status] }}>
                    {STATUS_LABEL[l.status] || l.status}
                  </span>
                </div>
                <div className="lv-item-dates">
                  📅 {fmtDate(l.start_date)} → {fmtDate(l.end_date)} <span className="lv-days">({l.days} gün)</span>
                </div>
                {l.reason && <div className="lv-reason">"{l.reason}"</div>}
                {l.reject_reason && <div className="lv-reject">Ret sebebi: {l.reject_reason}</div>}
                {l.approver && (
                  <div className="lv-approver">
                    {l.status === 'onaylandi' ? '✓' : '✗'} {l.approver.first_name} {l.approver.last_name}
                  </div>
                )}
              </div>
              <div className="lv-item-actions">
                {mode === 'manager' && l.status === 'onay_bekliyor' && (
                  <>
                    <button className="lv-btn-sm success" onClick={() => handleApprove(l.id)}>Onayla</button>
                    <button className="lv-btn-sm danger" onClick={() => setRejectModal({ open: true, id: l.id, reason: '' })}>Reddet</button>
                  </>
                )}
                {mode === 'user' && l.status === 'onay_bekliyor' && (
                  <button className="lv-btn-sm ghost" onClick={() => handleCancel(l.id)}>İptal Et</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {rejectModal.open && (
        <div className="lv-overlay" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>
          <div className="lv-modal" onClick={(e) => e.stopPropagation()}>
            <h3>İzin Talebini Reddet</h3>
            <textarea
              rows={3}
              placeholder="Ret sebebi (zorunlu)"
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              autoFocus
            />
            <div className="lv-modal-actions">
              <button className="lv-btn-sm ghost" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>Vazgeç</button>
              <button className="lv-btn-sm danger" onClick={handleReject} disabled={!rejectModal.reason.trim()}>Reddet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeavesPanel

import { useEffect, useState, useCallback } from 'react'
import './TaskTimeline.css'

const API_URL = 'http://localhost:5000/api'

const actionLabel = (a) => ({
  created: 'görevi oluşturdu',
  status_changed: 'durumu değiştirdi',
  approval_changed: 'onay durumunu güncelledi',
  assignee_changed: 'atanan kişiyi değiştirdi',
  due_date_changed: 'son tarihi değiştirdi',
  extension_requested: 'ek süre talep etti',
  extension_reviewed: 'ek süreyi inceledi',
  commented: 'yorum ekledi',
}[a] || a)

const statusTr = (v) => ({
  beklemede: 'Beklemede',
  devam_ediyor: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
  onay_bekliyor: 'Onay Bekliyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
}[v] || v)

const fmt = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return iso }
}

const TaskTimeline = ({ taskId, currentUserId }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/timeline`)
      const data = await res.json()
      if (data.success) setItems(data.timeline || [])
    } catch (_) { /* sessiz geç */ }
    finally { setLoading(false) }
  }, [taskId])

  useEffect(() => { load() }, [load])

  const handleAdd = async (e) => {
    e?.preventDefault()
    setErr('')
    const text = body.trim()
    if (!text) return
    if (!currentUserId) { setErr('Oturum açık olmalı'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ user_id: currentUserId, body: text }),
      })
      const data = await res.json()
      if (data.success) {
        setBody('')
        await load()
      } else {
        setErr(data.message || 'Yorum eklenemedi')
      }
    } catch (_) {
      setErr('Yorum gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (commentId) => {
    try {
      await fetch(`${API_URL}/comments/${commentId}?user_id=${currentUserId}`, { method: 'DELETE' })
      await load()
    } catch (_) {}
  }

  return (
    <div className="tt-wrap">
      <div className="tt-header">
        <span className="tt-title">Zaman Çizelgesi & Yorumlar</span>
        {loading && <span className="tt-loading">Yükleniyor…</span>}
      </div>

      <div className="tt-list">
        {!loading && items.length === 0 && (
          <div className="tt-empty">Henüz aktivite veya yorum yok.</div>
        )}
        {items.map((it, idx) => {
          if (it.kind === 'comment') {
            const c = it.data
            const isOwn = c.user?.id === currentUserId
            return (
              <div key={`c-${c.id}`} className={`tt-item comment ${isOwn ? 'own' : ''}`}>
                <div className="tt-bullet" />
                <div className="tt-body">
                  <div className="tt-meta">
                    <strong>{c.user ? `${c.user.first_name} ${c.user.last_name}` : '—'}</strong>
                    <span className="tt-time">{fmt(c.created_at)}</span>
                  </div>
                  <div className="tt-text">{c.body}</div>
                  {isOwn && (
                    <button className="tt-link danger" onClick={() => handleDelete(c.id)}>Sil</button>
                  )}
                </div>
              </div>
            )
          }
          const a = it.data
          const who = a.actor ? `${a.actor.first_name} ${a.actor.last_name}` : 'Sistem'
          let detail = ''
          if (a.action === 'status_changed' || a.action === 'approval_changed' || a.action === 'extension_reviewed') {
            detail = `${statusTr(a.old_value) ? statusTr(a.old_value) + ' → ' : ''}${statusTr(a.new_value)}`
          } else if (a.action === 'due_date_changed') {
            detail = `${a.old_value || '—'} → ${a.new_value || '—'}`
          } else if (a.action === 'created') {
            detail = a.new_value || ''
          } else if (a.action === 'extension_requested') {
            detail = a.new_value || ''
          }
          return (
            <div key={`a-${a.id}`} className="tt-item activity">
              <div className="tt-bullet" />
              <div className="tt-body">
                <div className="tt-meta">
                  <span><strong>{who}</strong> {actionLabel(a.action)}</span>
                  <span className="tt-time">{fmt(a.created_at)}</span>
                </div>
                {detail && <div className="tt-detail">{detail}</div>}
                {a.note && <div className="tt-note">"{a.note}"</div>}
              </div>
            </div>
          )
        })}
      </div>

      <form className="tt-form" onSubmit={handleAdd}>
        <textarea
          rows={2}
          placeholder="Yorum yaz…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
        />
        {err && <div className="tt-error">{err}</div>}
        <div className="tt-form-actions">
          <button type="submit" className="tt-submit" disabled={submitting || !body.trim()}>
            {submitting ? 'Gönderiliyor…' : 'Yorum Ekle'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default TaskTimeline

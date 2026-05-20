import { useEffect, useState, useCallback } from 'react'
import './TaskRelations.css'

const API_URL = 'http://localhost:5000/api'

const statusLabel = (s) => ({ beklemede: 'Beklemede', devam_ediyor: 'Devam', tamamlandi: 'Tamamlandı', iptal: 'İptal' }[s] || s)
const statusColor = (s) => ({ beklemede: '#94a3b8', devam_ediyor: '#3b82f6', tamamlandi: '#10b981', iptal: '#ef4444' }[s] || '#94a3b8')

const TaskRelations = ({ task, currentUserId, allTasks = [] }) => {
  const [subtasks, setSubtasks] = useState([])
  const [deps, setDeps] = useState({ blockers: [], blocked: [] })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Subtask formu
  const [showSubForm, setShowSubForm] = useState(false)
  const [subTitle, setSubTitle] = useState('')
  const [subDue, setSubDue] = useState('')

  // Dependency formu
  const [showDepForm, setShowDepForm] = useState(false)
  const [depBlockerId, setDepBlockerId] = useState('')

  const load = useCallback(async () => {
    if (!task?.id) return
    setLoading(true)
    try {
      const [s, d] = await Promise.all([
        fetch(`${API_URL}/tasks/${task.id}/subtasks`).then(r => r.json()),
        fetch(`${API_URL}/tasks/${task.id}/dependencies`).then(r => r.json()),
      ])
      if (s.success) setSubtasks(s.subtasks || [])
      if (d.success) setDeps({ blockers: d.blockers || [], blocked: d.blocked || [] })
    } catch (_) {}
    finally { setLoading(false) }
  }, [task?.id])

  useEffect(() => { load() }, [load])

  const handleAddSubtask = async (e) => {
    e?.preventDefault()
    setErr('')
    if (!subTitle.trim() || !subDue) { setErr('Başlık ve son tarih gerekli'); return }
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          title: subTitle.trim(),
          due_date: subDue,
          assigned_by: currentUserId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSubTitle('')
        setSubDue('')
        setShowSubForm(false)
        load()
      } else {
        setErr(data.message || 'Alt görev eklenemedi')
      }
    } catch (_) { setErr('Alt görev eklenemedi') }
  }

  const handleAddDep = async (e) => {
    e?.preventDefault()
    setErr('')
    if (!depBlockerId) { setErr('Engelleyici görev seç'); return }
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocker_id: Number(depBlockerId), actor_id: currentUserId }),
      })
      const data = await res.json()
      if (data.success) {
        setDepBlockerId('')
        setShowDepForm(false)
        load()
      } else {
        setErr(data.message || 'Bağımlılık eklenemedi')
      }
    } catch (_) { setErr('Bağımlılık eklenemedi') }
  }

  const handleRemoveDep = async (depId) => {
    try {
      await fetch(`${API_URL}/dependencies/${depId}`, { method: 'DELETE' })
      load()
    } catch (_) {}
  }

  // Aynı görev + zaten engelleyici olanlar dışındakileri seçenek listesinde göster
  const depCandidates = allTasks
    .filter(t => t.id !== task.id)
    .filter(t => !deps.blockers.some(d => d.blocker_id === t.id))

  return (
    <div className="tr-wrap">
      {/* ── ALT GÖREVLER ── */}
      <div className="tr-section">
        <div className="tr-head">
          <span className="tr-title">Alt Görevler {subtasks.length > 0 && <span className="tr-count">{subtasks.filter(s => s.status === 'tamamlandi').length}/{subtasks.length}</span>}</span>
          <button className="tr-btn" onClick={() => setShowSubForm(v => !v)}>+ Alt Görev</button>
        </div>

        {showSubForm && (
          <form className="tr-form" onSubmit={handleAddSubtask}>
            <input
              type="text"
              placeholder="Alt görev başlığı"
              value={subTitle}
              onChange={e => setSubTitle(e.target.value)}
            />
            <input
              type="date"
              value={subDue}
              onChange={e => setSubDue(e.target.value)}
            />
            <button type="submit" className="tr-btn primary">Ekle</button>
            <button type="button" className="tr-btn" onClick={() => setShowSubForm(false)}>İptal</button>
          </form>
        )}

        <div className="tr-list">
          {subtasks.length === 0 && !showSubForm && (
            <div className="tr-empty">Alt görev yok.</div>
          )}
          {subtasks.map(st => (
            <div key={st.id} className="tr-item">
              <span className="tr-dot" style={{ background: statusColor(st.status) }} />
              <span className={`tr-text ${st.status === 'tamamlandi' ? 'done' : ''}`}>{st.title}</span>
              <span className="tr-status" style={{ color: statusColor(st.status) }}>{statusLabel(st.status)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── BAĞIMLILIKLAR ── */}
      <div className="tr-section">
        <div className="tr-head">
          <span className="tr-title">Bağımlılıklar (Önce tamamlanmalı)</span>
          <button className="tr-btn" onClick={() => setShowDepForm(v => !v)}>+ Bağımlılık</button>
        </div>

        {showDepForm && (
          <form className="tr-form" onSubmit={handleAddDep}>
            <select value={depBlockerId} onChange={e => setDepBlockerId(e.target.value)}>
              <option value="">Engelleyen görev seç…</option>
              {depCandidates.map(t => (
                <option key={t.id} value={t.id}>#{t.id} — {t.title}</option>
              ))}
            </select>
            <button type="submit" className="tr-btn primary">Ekle</button>
            <button type="button" className="tr-btn" onClick={() => setShowDepForm(false)}>İptal</button>
          </form>
        )}

        <div className="tr-list">
          {deps.blockers.length === 0 && !showDepForm && (
            <div className="tr-empty">Engelleyici görev yok.</div>
          )}
          {deps.blockers.map(d => (
            <div key={d.id} className="tr-item">
              <span className="tr-dot" style={{ background: statusColor(d.blocker?.status) }} />
              <span className={`tr-text ${d.blocker?.status === 'tamamlandi' ? 'done' : ''}`}>
                {d.blocker?.title}
              </span>
              <span className="tr-status" style={{ color: statusColor(d.blocker?.status) }}>{statusLabel(d.blocker?.status)}</span>
              <button className="tr-btn danger" onClick={() => handleRemoveDep(d.id)}>Kaldır</button>
            </div>
          ))}
        </div>

        {deps.blocked.length > 0 && (
          <div className="tr-list" style={{ marginTop: 10 }}>
            <div className="tr-sub-title">Bu görev şunları engelliyor:</div>
            {deps.blocked.map(d => (
              <div key={d.id} className="tr-item subtle">
                <span className="tr-dot" style={{ background: statusColor(d.blocked?.status) }} />
                <span className="tr-text">{d.blocked?.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {err && <div className="tr-error">{err}</div>}
      {loading && <div className="tr-loading">Yükleniyor…</div>}
    </div>
  )
}

export default TaskRelations

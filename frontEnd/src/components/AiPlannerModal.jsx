import { useState, useEffect } from 'react'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'

const todayISO = () => new Date().toISOString().split('T')[0]

const addDaysISO = (isoDate, days) => {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const emptyInput = () => ({
  project_name: '',
  description: '',
  start_date: todayISO(),
  end_date: '',
  daily_hours: '3',
  experience: 'orta',
  technologies: '',
})

const priorityOptions = [
  { v: 'dusuk',   l: 'Düşük' },
  { v: 'orta',    l: 'Orta' },
  { v: 'yuksek',  l: 'Yüksek' },
  { v: 'kritik',  l: 'Kritik' },
]

const experienceOptions = [
  { v: 'baslangic', l: 'Başlangıç' },
  { v: 'orta',      l: 'Orta' },
  { v: 'ileri',     l: 'İleri' },
]

/**
 * AI Proje Planlayıcı modalı.
 *
 * Akış: input → loading → preview (düzenlenebilir) → committing → onCreated
 *
 * Props:
 *   open        : modal açık mı
 *   user        : { id, ... }
 *   onClose     : () => void
 *   onCreated   : (project, tasks) => void   — başarılı commit sonrası
 *   mode        : 'personal' | 'team' — kişisel kullanımda AI ekip/toplantı görevleri önermez
 */
const AiPlannerModal = ({ open, user, onClose, onCreated, mode = 'personal' }) => {
  const [stage, setStage] = useState('input') // input | loading | preview | committing | error
  const [form, setForm] = useState(emptyInput())
  const [plan, setPlan] = useState(null)       // { summary, tasks, model }
  const [previewTasks, setPreviewTasks] = useState([])
  const [projectMeta, setProjectMeta] = useState({ name: '', description: '', end_date: '' })
  const [errorMsg, setErrorMsg] = useState('')
  // Takım modunda görev atanabilecek üyeler (yöneticinin kapsamındaki kullanıcılar)
  const [members, setMembers] = useState([])

  // Takım modunda atanabilir üyeleri çek (modal her açıldığında)
  useEffect(() => {
    if (!open || mode !== 'team') return
    fetch(`${API_URL}/users`, { headers: { 'X-User-Id': String(user.id) } })
      .then(r => r.json())
      .then(d => { if (d.success) setMembers((d.users || []).filter(u => u.is_active)) })
      .catch(() => {})
  }, [open, mode, user.id])

  // Modal kapanınca state'i temizle
  useEffect(() => {
    if (!open) {
      setStage('input')
      setForm(emptyInput())
      setPlan(null)
      setPreviewTasks([])
      setProjectMeta({ name: '', description: '', end_date: '' })
      setErrorMsg('')
    }
  }, [open])

  if (!open) return null

  const updateForm = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const requestPlan = async () => {
    setErrorMsg('')

    if (!form.project_name.trim())  { setErrorMsg('Proje adı zorunlu'); return }
    if (!form.description.trim())   { setErrorMsg('Açıklama zorunlu'); return }
    if (!form.start_date)           { setErrorMsg('Başlama tarihi zorunlu'); return }
    const dh = parseFloat(form.daily_hours)
    if (!dh || dh <= 0)             { setErrorMsg('Günlük saat pozitif olmalı'); return }
    if (form.end_date && form.end_date < form.start_date) {
      setErrorMsg('Teslim tarihi başlama tarihinden önce olamaz'); return
    }

    setStage('loading')
    try {
      const techList = form.technologies
        .split(',').map(t => t.trim()).filter(Boolean)
      const res = await fetch(`${API_URL}/ai/plan-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': String(user.id),
        },
        body: JSON.stringify({
          user_id: user.id,
          project_name: form.project_name.trim(),
          description: form.description.trim(),
          start_date: form.start_date,
          end_date: form.end_date || null,
          daily_hours: dh,
          experience: form.experience,
          technologies: techList,
          mode,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setErrorMsg(data.error || data.message || 'AI planı üretilemedi')
        setStage('error')
        return
      }
      if (!data.tasks || data.tasks.length === 0) {
        setErrorMsg('AI hiç görev üretmedi. Açıklamayı daha somut yazıp tekrar deneyin.')
        setStage('error')
        return
      }

      // Preview için görevleri düzenlenebilir hale getir
      const editable = data.tasks.map((t, i) => ({
        _id: `ai-${i}-${Date.now()}`,
        title: t.title || '',
        description: t.description || '',
        start_date: t.suggested_start_date || form.start_date,
        due_date: t.suggested_due_date || addDaysISO(form.start_date, 1),
        priority: t.priority || 'orta',
        estimated_hours: t.estimated_hours || 0,
        assigned_to: String(user.id),  // varsayılan: planı oluşturan
      }))
      setPlan(data)
      setPreviewTasks(editable)
      setProjectMeta({
        name: form.project_name.trim(),
        description: form.description.trim(),
        end_date: form.end_date || '',
      })
      setStage('preview')
    } catch (e) {
      setErrorMsg('Bağlantı hatası: ' + e.message)
      setStage('error')
    }
  }

  const updatePreviewTask = (id, key, val) => {
    setPreviewTasks(tasks => tasks.map(t => t._id === id ? { ...t, [key]: val } : t))
  }

  const removePreviewTask = (id) => {
    setPreviewTasks(tasks => tasks.filter(t => t._id !== id))
  }

  const addBlankTask = () => {
    setPreviewTasks(tasks => [
      ...tasks,
      {
        _id: `manual-${tasks.length}-${Date.now()}`,
        title: '',
        description: '',
        start_date: form.start_date,
        due_date: addDaysISO(form.start_date, 1),
        priority: 'orta',
        estimated_hours: 0,
        assigned_to: String(user.id),
      },
    ])
  }

  const commitPlan = async () => {
    setErrorMsg('')

    if (!projectMeta.name.trim()) { setErrorMsg('Proje adı boş olamaz'); return }
    if (previewTasks.length === 0) { setErrorMsg('En az bir görev gerekli'); return }
    for (let i = 0; i < previewTasks.length; i++) {
      const t = previewTasks[i]
      if (!t.title.trim()) { setErrorMsg(`${i + 1}. görevin başlığı boş`); return }
      if (!t.due_date)     { setErrorMsg(`${i + 1}. görevin teslim tarihi boş`); return }
    }

    setStage('committing')
    try {
      const res = await fetch(`${API_URL}/ai/commit-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': String(user.id),
        },
        body: JSON.stringify({
          user_id: user.id,
          project: {
            name: projectMeta.name.trim(),
            description: projectMeta.description.trim(),
            start_date: form.start_date || null,
            end_date: projectMeta.end_date || form.end_date || null,
          },
          tasks: previewTasks.map(t => ({
            title: t.title.trim(),
            description: t.description.trim(),
            start_date: t.start_date || null,
            due_date: t.due_date,
            priority: t.priority,
            // Takım modunda kişiye atama; kişisel modda gönderilmez (backend oluşturana atar)
            assigned_to: mode === 'team' ? (t.assigned_to || null) : null,
          })),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setErrorMsg(data.message || 'Plan kaydedilemedi')
        setStage('error')
        return
      }
      if (onCreated) onCreated(data.project, data.tasks)
      onClose()
    } catch (e) {
      setErrorMsg('Bağlantı hatası: ' + e.message)
      setStage('error')
    }
  }

  const busy = stage === 'loading' || stage === 'committing'

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal-content ai-modal"
        style={{ maxWidth: 760 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="icon-stack">
            <Icon name="sparkles" size={18} /> AI Proje Planlayıcı
          </h2>
          <button className="modal-close" disabled={busy} onClick={onClose}>×</button>
        </div>

        <div className="modal-form">

          {/* ─── INPUT AŞAMASI ─── */}
          {stage === 'input' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                {mode === 'personal'
                  ? 'Projeyi anlat — AI sadece senin tek başına yapacağın somut görevleri çıkarsın (ekip toplantısı vb. önermez).'
                  : 'Projeyi anlat — AI ekip kapsamında bir plan çıkarsın (toplantı, koordinasyon görevleri de olabilir).'}
              </p>

              <div className="form-group">
                <label>Proje Adı <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  placeholder="Örn: Bitirme Projesi — İş Akışı Yönetim Sistemi"
                  value={form.project_name}
                  onChange={e => updateForm('project_name', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Açıklama / Hedef <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea
                  rows={3}
                  placeholder="Ne tür bir proje? Hangi çıktı bekleniyor? Hangi adımları içermesini istersin?"
                  value={form.description}
                  onChange={e => updateForm('description', e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Başlama Tarihi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => updateForm('start_date', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Teslim Tarihi (opsiyonel)</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => updateForm('end_date', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Günlük Çalışma (saat) <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="number"
                    min="0.5"
                    max="12"
                    step="0.5"
                    value={form.daily_hours}
                    onChange={e => updateForm('daily_hours', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Deneyim Seviyesi</label>
                  <select
                    value={form.experience}
                    onChange={e => updateForm('experience', e.target.value)}
                  >
                    {experienceOptions.map(o => (
                      <option key={o.v} value={o.v}>{o.l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Teknolojiler (virgülle ayır)</label>
                <input
                  type="text"
                  placeholder="React, Flask, PostgreSQL"
                  value={form.technologies}
                  onChange={e => updateForm('technologies', e.target.value)}
                />
              </div>

              {errorMsg && (
                <div className="error-message" style={{ marginTop: 4 }}>{errorMsg}</div>
              )}

              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button type="button" className="ghost-button" onClick={onClose}>İptal</button>
                <button
                  type="button"
                  className="primary-button icon-stack"
                  onClick={requestPlan}
                >
                  <Icon name="sparkles" size={14} /> Plan Oluştur
                </button>
              </div>
            </>
          )}

          {/* ─── LOADING ─── */}
          {stage === 'loading' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="ai-spinner" />
              <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>
                AI plan hazırlıyor… birkaç saniye sürebilir.
              </p>
            </div>
          )}

          {/* ─── PREVIEW (düzenlenebilir) ─── */}
          {stage === 'preview' && plan && (
            <div className="ai-review">
              {plan.summary && (
                <section className="ai-block ai-block--general">
                  <h3 className="icon-stack"><Icon name="message" size={14} /> Plan Özeti</h3>
                  <p>{plan.summary}</p>
                </section>
              )}

              <div className="form-group" style={{ marginTop: 4 }}>
                <label>Proje Adı</label>
                <input
                  type="text"
                  value={projectMeta.name}
                  onChange={e => setProjectMeta(m => ({ ...m, name: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Proje Açıklaması</label>
                <textarea
                  rows={2}
                  value={projectMeta.description}
                  onChange={e => setProjectMeta(m => ({ ...m, description: e.target.value }))}
                />
              </div>

              <h3 className="icon-stack" style={{ margin: '14px 0 8px', fontSize: 14, fontWeight: 600 }}>
                <Icon name="clipboard" size={14} /> Görevler ({previewTasks.length})
              </h3>

              {previewTasks.length === 0 ? (
                <div className="ai-plan-empty">Hiç görev yok — manuel ekleyin.</div>
              ) : (
                previewTasks.map((t, idx) => (
                  <div key={t._id} className="ai-plan-task-row">
                    <div className="ai-plan-task-row__head">
                      <span className="ai-plan-task-row__num">#{idx + 1}</span>
                      <input
                        type="text"
                        placeholder="Görev başlığı"
                        value={t.title}
                        onChange={e => updatePreviewTask(t._id, 'title', e.target.value)}
                        className="ai-plan-task-row__title"
                      />
                      <button
                        type="button"
                        className="ai-plan-task-row__remove"
                        title="Sil"
                        onClick={() => removePreviewTask(t._id)}
                      >×</button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Açıklama"
                      value={t.description}
                      onChange={e => updatePreviewTask(t._id, 'description', e.target.value)}
                    />
                    <div className="ai-plan-task-row__meta">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Başlangıç</label>
                        <input
                          type="date"
                          value={t.start_date || ''}
                          onChange={e => updatePreviewTask(t._id, 'start_date', e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Teslim</label>
                        <input
                          type="date"
                          value={t.due_date || ''}
                          onChange={e => updatePreviewTask(t._id, 'due_date', e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Öncelik</label>
                        <select
                          value={t.priority}
                          onChange={e => updatePreviewTask(t._id, 'priority', e.target.value)}
                        >
                          {priorityOptions.map(o => (
                            <option key={o.v} value={o.v}>{o.l}</option>
                          ))}
                        </select>
                      </div>
                      {t.estimated_hours > 0 && (
                        <span className="ai-plan-task-row__hours">
                          ~{t.estimated_hours} sa
                        </span>
                      )}
                    </div>

                    {/* Takım modunda görevi bir üyeye ata */}
                    {mode === 'team' && (
                      <div className="form-group" style={{ marginBottom: 0, marginTop: 8 }}>
                        <label className="icon-stack"><Icon name="user" size={12} /> Atanan kişi</label>
                        <select
                          value={t.assigned_to || String(user.id)}
                          onChange={e => updatePreviewTask(t._id, 'assigned_to', e.target.value)}
                        >
                          {/* Liste boşsa en azından planı oluşturan görünsün */}
                          {members.length === 0 && (
                            <option value={String(user.id)}>{user.first_name} {user.last_name} (ben)</option>
                          )}
                          {members.map(m => (
                            <option key={m.id} value={String(m.id)}>
                              {m.first_name} {m.last_name}{String(m.id) === String(user.id) ? ' (ben)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))
              )}

              <button
                type="button"
                className="ghost-button icon-stack"
                style={{ marginTop: 8 }}
                onClick={addBlankTask}
              >
                <Icon name="plus" size={14} /> Görev Ekle
              </button>

              {plan.model && (
                <p className="ai-footer" style={{ marginTop: 12 }}>
                  Model: <code>{plan.model}</code> · Plan onaylayana kadar kaydedilmez.
                </p>
              )}

              {errorMsg && (
                <div className="error-message" style={{ marginTop: 8 }}>{errorMsg}</div>
              )}

              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => { setStage('input'); setErrorMsg('') }}
                >← Geri</button>
                <button
                  type="button"
                  className="ghost-button icon-stack"
                  onClick={requestPlan}
                >
                  <Icon name="sparkles" size={14} /> Yeniden Üret
                </button>
                <button
                  type="button"
                  className="primary-button icon-stack"
                  onClick={commitPlan}
                  disabled={previewTasks.length === 0}
                >
                  <Icon name="check_circle" size={14} /> Onayla & Görev Ekle
                </button>
              </div>
            </div>
          )}

          {/* ─── COMMITTING ─── */}
          {stage === 'committing' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="ai-spinner" />
              <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>
                Görevler oluşturuluyor…
              </p>
            </div>
          )}

          {/* ─── ERROR ─── */}
          {stage === 'error' && (
            <div>
              <div className="error-message" style={{ marginBottom: 14 }}>
                {errorMsg || 'Bilinmeyen hata.'}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onClose}
                >Kapat</button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => { setStage(plan ? 'preview' : 'input'); setErrorMsg('') }}
                >Tekrar Dene</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default AiPlannerModal

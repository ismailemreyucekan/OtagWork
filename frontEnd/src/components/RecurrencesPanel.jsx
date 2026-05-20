import { useEffect, useState, useCallback } from 'react'
import './RecurrencesPanel.css'

const API_URL = 'http://localhost:5000/api'

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

const FREQ_LABEL = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' }
const PRIO_LABEL = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', kritik: 'Kritik' }

const RecurrencesPanel = ({ user, users = [] }) => {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    priority: 'orta',
    frequency: 'weekly',
    weekdays: [1], // Salı varsayılan
    day_of_month: 1,
    due_days_offset: 1,
  })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/recurrences?owner_id=${user.id}`)
      const data = await res.json()
      if (data.success) setRules(data.rules || [])
    } catch (_) {}
    finally { setLoading(false) }
  }, [user.id])

  useEffect(() => { load() }, [load])

  const toggleWeekday = (d) => {
    setForm(f => ({
      ...f,
      weekdays: f.weekdays.includes(d)
        ? f.weekdays.filter(x => x !== d)
        : [...f.weekdays, d].sort()
    }))
  }

  const create = async (e) => {
    e?.preventDefault()
    setMsg({ type: '', text: '' })
    if (!form.title.trim() || !form.assigned_to) {
      setMsg({ type: 'error', text: 'Başlık ve atanan kişi gerekli' })
      return
    }
    if (form.frequency === 'weekly' && form.weekdays.length === 0) {
      setMsg({ type: 'error', text: 'En az bir gün seçin' })
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to: Number(form.assigned_to),
        assigned_by: user.id,
        priority: form.priority,
        frequency: form.frequency,
        due_days_offset: Number(form.due_days_offset),
      }
      if (form.frequency === 'weekly') payload.weekdays = form.weekdays.join(',')
      if (form.frequency === 'monthly') payload.day_of_month = Number(form.day_of_month)

      const res = await fetch(`${API_URL}/recurrences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setMsg({ type: 'success', text: 'Kural oluşturuldu' })
        setForm({ ...form, title: '', description: '' })
        load()
      } else {
        setMsg({ type: 'error', text: data.message || 'Oluşturulamadı' })
      }
    } catch (_) { setMsg({ type: 'error', text: 'Oluşturulamadı' }) }
    finally { setSubmitting(false) }
  }

  const toggleActive = async (rule) => {
    await fetch(`${API_URL}/recurrences/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    load()
  }

  const remove = async (id) => {
    if (!window.confirm('Bu kuralı silmek istiyor musunuz?')) return
    await fetch(`${API_URL}/recurrences/${id}`, { method: 'DELETE' })
    load()
  }

  const runNow = async () => {
    setMsg({ type: '', text: '' })
    try {
      const res = await fetch(`${API_URL}/recurrences/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (data.success) {
        setMsg({ type: 'success', text: `Üretildi: ${data.generated.length} görev` })
      }
    } catch (_) {}
  }

  const formatSchedule = (r) => {
    if (r.frequency === 'daily') return 'Her gün'
    if (r.frequency === 'weekly') {
      const wds = (r.weekdays || '').split(',').filter(Boolean).map(d => WEEKDAYS[Number(d)]).join(', ')
      return `Her hafta: ${wds || '—'}`
    }
    if (r.frequency === 'monthly') return `Her ayın ${r.day_of_month}.`
    return r.frequency
  }

  return (
    <div className="rc-wrap">
      <form className="rc-form" onSubmit={create}>
        <h3>Yeni Tekrarlayan Görev</h3>

        <div className="rc-row">
          <input
            type="text"
            placeholder="Görev başlığı"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
            <option value="">Atanacak kişi…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {Object.entries(PRIO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <textarea
          rows={2}
          placeholder="Açıklama (opsiyonel)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <div className="rc-row">
          <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
            <option value="daily">Günlük</option>
            <option value="weekly">Haftalık</option>
            <option value="monthly">Aylık</option>
          </select>

          {form.frequency === 'weekly' && (
            <div className="rc-weekdays">
              {WEEKDAYS.map((label, idx) => (
                <button
                  type="button"
                  key={idx}
                  className={`rc-day ${form.weekdays.includes(idx) ? 'on' : ''}`}
                  onClick={() => toggleWeekday(idx)}
                >{label}</button>
              ))}
            </div>
          )}

          {form.frequency === 'monthly' && (
            <input
              type="number"
              min={1} max={28}
              value={form.day_of_month}
              onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
              style={{ width: 80 }}
            />
          )}

          <label className="rc-offset">
            Son tarih ofseti (gün):
            <input
              type="number"
              min={0} max={30}
              value={form.due_days_offset}
              onChange={(e) => setForm({ ...form, due_days_offset: e.target.value })}
            />
          </label>
        </div>

        {msg.text && <div className={`rc-msg ${msg.type}`}>{msg.text}</div>}

        <div className="rc-actions">
          <button type="submit" className="rc-btn primary" disabled={submitting}>
            {submitting ? 'Kaydediliyor…' : 'Kural Oluştur'}
          </button>
          <button type="button" className="rc-btn ghost" onClick={runNow}>
            ▶ Şimdi Üret
          </button>
        </div>
      </form>

      <div className="rc-list">
        <h3>Aktif Kurallar</h3>
        {loading && <div className="rc-empty">Yükleniyor…</div>}
        {!loading && rules.length === 0 && <div className="rc-empty">Henüz kural yok.</div>}
        {rules.map(r => (
          <div key={r.id} className={`rc-item ${r.is_active ? '' : 'paused'}`}>
            <div className="rc-item-info">
              <div className="rc-item-title">{r.title}</div>
              <div className="rc-item-meta">
                {formatSchedule(r)} · {PRIO_LABEL[r.priority] || r.priority}
                {r.assignee && ` · → ${r.assignee.first_name} ${r.assignee.last_name}`}
              </div>
              {r.last_generated_on && (
                <div className="rc-item-last">Son üretim: {new Date(r.last_generated_on).toLocaleDateString('tr-TR')}</div>
              )}
            </div>
            <div className="rc-item-actions">
              <button className="rc-btn-sm" onClick={() => toggleActive(r)}>
                {r.is_active ? '⏸ Duraklat' : '▶ Aktive Et'}
              </button>
              <button className="rc-btn-sm danger" onClick={() => remove(r.id)}>Sil</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RecurrencesPanel

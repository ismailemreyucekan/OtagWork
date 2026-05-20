import { useEffect, useState, useCallback } from 'react'
import './TaskTagEditor.css'

const API_URL = 'http://localhost:5000/api'

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#FFD700', '#64748b']

const TaskTagEditor = ({ taskId, currentTags = [], onChange }) => {
  const [allTags, setAllTags] = useState([])
  const [selected, setSelected] = useState(currentTags || [])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#FFD700')
  const [busy, setBusy] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/tags`)
      const d = await r.json()
      if (d.success) setAllTags(d.tags || [])
    } catch (_) {}
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const has = (tagId) => selected.some(s => s.id === tagId)

  const toggleTag = async (tag) => {
    setBusy(true)
    try {
      if (has(tag.id)) {
        await fetch(`${API_URL}/tasks/${taskId}/tags/${tag.id}`, { method: 'DELETE' })
        const next = selected.filter(s => s.id !== tag.id)
        setSelected(next); onChange?.(next)
      } else {
        await fetch(`${API_URL}/tasks/${taskId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tag.id }),
        })
        const next = [...selected, tag]
        setSelected(next); onChange?.(next)
      }
    } catch (_) {}
    finally { setBusy(false) }
  }

  const handleCreate = async (e) => {
    e?.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const r = await fetch(`${API_URL}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ name, color: newColor }),
      })
      const d = await r.json()
      if (d.success) {
        setAllTags(prev => prev.find(x => x.id === d.tag.id) ? prev : [...prev, d.tag])
        await toggleTag(d.tag)
        setNewName('')
      }
    } catch (_) {}
    finally { setBusy(false) }
  }

  return (
    <div className="tte-wrap">
      <div className="tte-title">Etiketler</div>

      {selected.length > 0 && (
        <div className="tte-selected">
          {selected.map(t => (
            <span key={t.id} className="tte-chip on" style={{ background: t.color + '22', borderColor: t.color, color: t.color }} onClick={() => toggleTag(t)} title="Kaldır">
              {t.name} ×
            </span>
          ))}
        </div>
      )}

      <div className="tte-row">
        <div className="tte-label">Tüm etiketler:</div>
        <div className="tte-all">
          {allTags.length === 0 && <span className="tte-empty">Henüz etiket yok.</span>}
          {allTags.map(t => (
            <span
              key={t.id}
              className={`tte-chip ${has(t.id) ? 'on' : ''}`}
              style={has(t.id) ? { background: t.color + '22', borderColor: t.color, color: t.color } : { borderColor: t.color, color: t.color }}
              onClick={() => !busy && toggleTag(t)}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <form className="tte-create" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="Yeni etiket"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={60}
        />
        <div className="tte-palette">
          {PALETTE.map(c => (
            <button
              type="button"
              key={c}
              className={`tte-swatch ${newColor === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setNewColor(c)}
              title={c}
            />
          ))}
        </div>
        <button type="submit" className="tte-btn" disabled={busy || !newName.trim()}>+ Oluştur ve Ekle</button>
      </form>
    </div>
  )
}

export default TaskTagEditor

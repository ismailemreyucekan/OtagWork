import { useState, useEffect, useRef } from 'react'
import './GlobalSearch.css'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'

const GlobalSearch = ({ onTaskOpen }) => {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState({ tasks: [], projects: [], users: [] })
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!q || q.trim().length < 2) {
      setResults({ tasks: [], projects: [], users: [] })
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        if (data.success) setResults({ tasks: data.tasks || [], projects: data.projects || [], users: data.users || [] })
      } catch (_) {}
      finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [q, open])

  // Ctrl/Cmd+K kısayolu
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 30)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const total = results.tasks.length + results.projects.length + results.users.length

  return (
    <div className="gs-wrap" ref={wrapRef}>
      <button
        className="gs-trigger"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 30) }}
        title="Ara (Ctrl/Cmd+K)"
        type="button"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Ara…</span>
        <kbd>Ctrl K</kbd>
      </button>

      {open && (
        <div className="gs-panel">
          <input
            ref={inputRef}
            className="gs-input"
            placeholder="Görev, proje veya kullanıcı ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="gs-results">
            {loading && <div className="gs-empty">Aranıyor…</div>}
            {!loading && q.trim().length < 2 && (
              <div className="gs-empty">En az 2 karakter girin.</div>
            )}
            {!loading && q.trim().length >= 2 && total === 0 && (
              <div className="gs-empty">Sonuç bulunamadı.</div>
            )}

            {results.tasks.length > 0 && (
              <div className="gs-group">
                <div className="gs-group-title icon-stack"><Icon name="clipboard" size={12} /> Görevler</div>
                {results.tasks.map(t => (
                  <div key={`t-${t.id}`} className="gs-item" onClick={() => { onTaskOpen?.(t); setOpen(false) }}>
                    <div className="gs-item-main">{t.title}</div>
                    <div className="gs-item-sub">{t.assignee_name ? `→ ${t.assignee_name}` : ''} · {t.status}</div>
                  </div>
                ))}
              </div>
            )}

            {results.projects.length > 0 && (
              <div className="gs-group">
                <div className="gs-group-title icon-stack"><Icon name="folder" size={12} /> Projeler</div>
                {results.projects.map(p => (
                  <div key={`p-${p.id}`} className="gs-item">
                    <div className="gs-item-main">{p.name}</div>
                    <div className="gs-item-sub">{p.status}</div>
                  </div>
                ))}
              </div>
            )}

            {results.users.length > 0 && (
              <div className="gs-group">
                <div className="gs-group-title icon-stack"><Icon name="user" size={12} /> Kullanıcılar</div>
                {results.users.map(u => (
                  <div key={`u-${u.id}`} className="gs-item">
                    <div className="gs-item-main">{u.name}</div>
                    <div className="gs-item-sub">{u.email} · {u.user_type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GlobalSearch

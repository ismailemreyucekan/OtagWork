import { useEffect, useState, useCallback, useRef } from 'react'
import './TaskAttachments.css'

const API_URL = 'http://localhost:5000/api'
const MAX_BYTES = 10 * 1024 * 1024

const fmtSize = (b) => {
  if (b == null) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

const fmtDate = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
  catch { return iso }
}

const fileIcon = (mime, name = '') => {
  const m = (mime || '').toLowerCase()
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (m.startsWith('image/')) return '🖼️'
  if (m === 'application/pdf' || ext === 'pdf') return '📕'
  if (['doc','docx'].includes(ext)) return '📘'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['ppt','pptx'].includes(ext)) return '📙'
  if (['zip','rar','7z'].includes(ext)) return '🗜️'
  if (['txt','md','log'].includes(ext)) return '📝'
  return '📎'
}

const TaskAttachments = ({ taskId, currentUserId }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/attachments`)
      const data = await res.json()
      if (data.success) setItems(data.attachments || [])
    } catch (_) { /* sessiz */ }
    finally { setLoading(false) }
  }, [taskId])

  useEffect(() => { load() }, [load])

  const handleUpload = async (file) => {
    setErr('')
    if (!file) return
    if (!currentUserId) { setErr('Oturum açık olmalı'); return }
    if (file.size > MAX_BYTES) {
      setErr(`Dosya 10 MB sınırını aşıyor (${fmtSize(file.size)})`)
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('uploader_id', String(currentUserId))
    setUploading(true)
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/attachments`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        await load()
      } else {
        setErr(data.message || 'Yüklenemedi')
      }
    } catch (_) {
      setErr('Yükleme başarısız')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onPick = (e) => {
    const f = e.target.files?.[0]
    if (f) handleUpload(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleUpload(f)
  }

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_URL}/attachments/${id}?user_id=${currentUserId}`, { method: 'DELETE' })
      await load()
    } catch (_) {}
  }

  return (
    <div className="ta-wrap">
      <div className="ta-header">
        <span className="ta-title">Dosya Ekleri</span>
        {loading && <span className="ta-loading">Yükleniyor…</span>}
      </div>

      <label
        className={`ta-drop ${dragOver ? 'over' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input ref={fileInputRef} type="file" onChange={onPick} disabled={uploading} hidden />
        <div className="ta-drop-icon">📎</div>
        <div className="ta-drop-text">
          {uploading ? 'Yükleniyor…' : 'Dosya seçmek için tıklayın veya buraya sürükleyin'}
        </div>
        <div className="ta-drop-sub">Maks. 10 MB · pdf, docx, xlsx, png, jpg, zip…</div>
      </label>

      {err && <div className="ta-error">{err}</div>}

      <div className="ta-list">
        {!loading && items.length === 0 && (
          <div className="ta-empty">Henüz dosya yok.</div>
        )}
        {items.map((a) => {
          const isOwn = a.uploader?.id === currentUserId
          return (
            <div key={a.id} className="ta-item">
              <div className="ta-file-icon">{fileIcon(a.mime_type, a.original_name)}</div>
              <div className="ta-info">
                <div className="ta-name" title={a.original_name}>{a.original_name}</div>
                <div className="ta-meta">
                  {fmtSize(a.size_bytes)} · {a.uploader ? `${a.uploader.first_name} ${a.uploader.last_name}` : '—'} · {fmtDate(a.created_at)}
                </div>
              </div>
              <div className="ta-actions">
                <a className="ta-btn" href={`${API_URL}/attachments/${a.id}/download`} target="_blank" rel="noreferrer">İndir</a>
                {isOwn && (
                  <button className="ta-btn danger" onClick={() => handleDelete(a.id)}>Sil</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TaskAttachments

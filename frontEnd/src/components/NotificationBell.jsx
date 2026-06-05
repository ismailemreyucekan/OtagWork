import { useEffect, useRef, useState, useCallback } from 'react'
import './NotificationBell.css'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'
const POLL_MS = 20000 // 20 saniyede bir okunmamış sayımını yenile
const SCAN_MS = 10 * 60 * 1000 // 10 dakikada bir yaklaşan-son-tarih taraması

// Bildirim tipi → SVG ikon adı eşlemesi (Icon component'ine geçilir)
const typeIcon = (t) => {
  switch (t) {
    case 'task_assigned':       return 'clipboard'
    case 'task_approved':       return 'check_circle'
    case 'task_rejected':       return 'x'
    case 'task_status_changed': return 'refresh'
    case 'task_due_soon':       return 'alert'
    case 'extension_requested': return 'hourglass'
    case 'extension_approved':  return 'check'
    case 'extension_rejected':  return 'ban'
    case 'timesheet_approved':  return 'clock'
    case 'timesheet_rejected':  return 'alert'
    case 'comment_added':       return 'message'
    default:                    return 'bell'
  }
}

// Bildirim tipi → renk tonu (ikon çipini renklendirir, görsel ayrım için)
const typeTone = (t) => {
  if (t === 'task_due_soon') return '#E0A458'        // warning — yaklaşan tarih
  if (t === 'task_rejected' || t === 'extension_rejected' || t === 'timesheet_rejected') return '#B14545' // danger
  if (t === 'task_approved' || t === 'extension_approved' || t === 'timesheet_approved') return '#6BA888'  // success
  if (t === 'comment_added') return '#9B7EDE'         // mor — yorum
  if (t && t.startsWith('timesheet')) return '#6BA888'
  if (t && t.startsWith('extension')) return '#E0A458'
  return '#7FA9C4'                                     // accent — görev/diğer
}

const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'az önce'
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} gün önce`
  return d.toLocaleDateString('tr-TR')
}

const NotificationBell = ({ userId }) => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`${API_URL}/notifications/unread-count?user_id=${userId}`)
      const data = await res.json()
      if (data.success) setUnread(data.unread_count || 0)
    } catch (_) { /* sessizce geç */ }
  }, [userId])

  const fetchAll = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/notifications?user_id=${userId}&limit=30`)
      const data = await res.json()
      if (data.success) {
        setItems(data.notifications || [])
        setUnread(data.unread_count || 0)
      }
    } catch (_) { /* sessizce geç */ }
    finally { setLoading(false) }
  }, [userId])

  // Yaklaşan son tarih taraması — backend dedup'lı olduğu için sık çağrı güvenli.
  // Tarama yeni bildirim üretirse hemen sayımı tazele.
  const scanDueSoon = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`${API_URL}/notifications/scan-due-soon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (data.success && data.created > 0) fetchUnreadCount()
    } catch (_) { /* sessizce geç */ }
  }, [userId, fetchUnreadCount])

  // İlk yüklemede sayım al ve periyodik yenile
  useEffect(() => {
    fetchUnreadCount()
    const id = setInterval(fetchUnreadCount, POLL_MS)
    return () => clearInterval(id)
  }, [fetchUnreadCount])

  // Mount'ta ve periyodik olarak yaklaşan son tarihleri tara
  useEffect(() => {
    scanDueSoon()
    const id = setInterval(scanDueSoon, SCAN_MS)
    return () => clearInterval(id)
  }, [scanDueSoon])

  // Panel açıldığında listeyi getir
  useEffect(() => {
    if (open) fetchAll()
  }, [open, fetchAll])

  // Dışarı tıklamada kapat
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)
          && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleMarkRead = async (id) => {
    try {
      await fetch(`${API_URL}/notifications/${id}/read`, { method: 'PUT' })
      setItems((prev) => prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      setUnread((u) => Math.max(0, u - 1))
    } catch (_) {}
  }

  const handleMarkAll = async () => {
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      setItems((prev) => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
      setUnread(0)
    } catch (_) {}
  }

  const handleDelete = async (id) => {
    try {
      const wasUnread = items.find(n => n.id === id)?.is_read === false
      await fetch(`${API_URL}/notifications/${id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter(n => n.id !== id))
      if (wasUnread) setUnread((u) => Math.max(0, u - 1))
    } catch (_) {}
  }

  return (
    <div className="notif-wrap">
      <button
        ref={btnRef}
        className={`notif-bell ${unread > 0 ? 'notif-bell--active' : ''} ${open ? 'notif-bell--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Bildirimler"
        aria-label={unread > 0 ? `Bildirimler (${unread} okunmamış)` : 'Bildirimler'}
        type="button"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div ref={panelRef} className="notif-panel" role="dialog" aria-label="Bildirimler">
          <div className="notif-panel-head">
            <div className="notif-panel-title-wrap">
              <span className="notif-panel-title">Bildirimler</span>
              {unread > 0 && <span className="notif-head-count">{unread}</span>}
            </div>
            <button className="notif-link" onClick={handleMarkAll} disabled={unread === 0}>
              Tümünü okundu yap
            </button>
          </div>

          <div className="notif-list">
            {loading && <div className="notif-empty">Yükleniyor…</div>}
            {!loading && items.length === 0 && (
              <div className="notif-empty">
                <div className="notif-empty-icon"><Icon name="bell" size={26} /></div>
                <p>Henüz bildiriminiz yok.</p>
                <span className="notif-empty-sub">Yeni gelişmeler burada görünecek.</span>
              </div>
            )}
            {!loading && items.map(n => {
              const tone = typeTone(n.type)
              return (
                <div key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`}>
                  <span
                    className="notif-icon"
                    style={{ background: tone + '1F', color: tone }}
                  >
                    <Icon name={typeIcon(n.type)} size={17} />
                  </span>
                  <div className="notif-body">
                    <div className="notif-title-row">
                      <span className="notif-title">{n.title}</span>
                      <span className="notif-time">{formatTime(n.created_at)}</span>
                    </div>
                    {n.body && <div className="notif-text">{n.body}</div>}
                    <div className="notif-actions">
                      {!n.is_read && (
                        <button className="notif-link" onClick={() => handleMarkRead(n.id)}>
                          Okundu yap
                        </button>
                      )}
                      <button className="notif-link danger" onClick={() => handleDelete(n.id)}>
                        Sil
                      </button>
                    </div>
                  </div>
                  {!n.is_read && <span className="notif-unread-dot" aria-hidden="true" />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell

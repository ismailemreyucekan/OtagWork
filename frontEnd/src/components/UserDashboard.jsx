import { useEffect, useState, useCallback } from 'react'
import './LoginPage.css'

const API_URL = 'http://localhost:5000/api'

const UserDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('timesheet') // 'timesheet' | 'my-tasks' | 'team-tasks'
  const [timesheets, setTimesheets] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [formData, setFormData] = useState({
    work_date: new Date().toISOString().split('T')[0],
    project: '',
    activity_type: '',
    work_mode: 'Ofis',
    hours: '',
    description: '',
  })
  const [durationHours, setDurationHours] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('0')
  const [leaveType, setLeaveType] = useState('tam-gun')
  const [showModal, setShowModal] = useState(false)
  const [modalDate, setModalDate] = useState(new Date())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [projectOptions, setProjectOptions] = useState([])
  const [activityOptions, setActivityOptions] = useState([])
  const [workModeOptions, setWorkModeOptions] = useState(['Ofis', 'Uzaktan'])

  // GÖREV YÖNETİMİ
  const [myTasks, setMyTasks] = useState([])
  const [teamTasks, setTeamTasks] = useState([])
  const [taskLoading, setTaskLoading] = useState(false)
  const [extensionModal, setExtensionModal] = useState({ open: false, task: null, days: '', reason: '' })
  const [taskMsg, setTaskMsg] = useState({ type: '', text: '' })
  const [taskSubTab, setTaskSubTab] = useState('kanban') // 'kanban' | 'calendar'
  const [taskCalMonth, setTaskCalMonth] = useState(new Date())
  const [taskDetailModal, setTaskDetailModal] = useState({ open: false, task: null })

  const priorityLabel = (p) => ({ dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', kritik: 'Kritik' }[p] || p)
  const priorityColor = (p) => ({ dusuk: '#10b981', orta: '#f59e0b', yuksek: '#ef4444', kritik: '#7c3aed' }[p] || '#6b7280')
  const statusLabel = (s) => ({ beklemede: 'Beklemede', devam_ediyor: 'Devam Ediyor', tamamlandi: 'Tamamlandı', iptal: 'İptal' }[s] || s)
  const statusColor = (s) => ({ beklemede: '#94a3b8', devam_ediyor: '#3b82f6', tamamlandi: '#10b981', iptal: '#ef4444' }[s] || '#94a3b8')
  const approvalLabel = (a) => ({ onay_bekliyor: 'Onay Bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' }[a] || a)
  const approvalColor = (a) => ({ onay_bekliyor: '#f59e0b', onaylandi: '#10b981', reddedildi: '#ef4444' }[a] || '#94a3b8')

  const fmtDate = (iso) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('tr-TR') } catch { return iso }
  }

  const isOverdue = (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'tamamlandi'

  const fetchMyTasks = useCallback(async () => {
    try {
      setTaskLoading(true)
      const res = await fetch(`${API_URL}/tasks?user_id=${user.id}`)
      const data = await res.json()
      if (data.success) setMyTasks(data.tasks || [])
    } catch (e) { console.error(e) } finally { setTaskLoading(false) }
  }, [user.id])

  const fetchTeamTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tasks?team_tasks_for=${user.id}`)
      const data = await res.json()
      if (data.success) setTeamTasks(data.tasks || [])
    } catch (e) { console.error(e) }
  }, [user.id])

  useEffect(() => {
    if (activeTab === 'my-tasks') fetchMyTasks()
    if (activeTab === 'team-tasks') fetchTeamTasks()
  }, [activeTab, fetchMyTasks, fetchTeamTasks])

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await res.json()
      if (data.success) {
        setTaskMsg({ type: 'success', text: 'Durum güncellendi.' })
        fetchMyTasks()
        setTimeout(() => setTaskMsg({ type: '', text: '' }), 3000)
      }
    } catch (e) { setTaskMsg({ type: 'error', text: 'Durum güncellenemedi.' }) }
  }

  const handleRequestExtension = async () => {
    if (!extensionModal.days || Number(extensionModal.days) <= 0) return
    if (!extensionModal.reason.trim()) return
    try {
      const res = await fetch(`${API_URL}/tasks/${extensionModal.task.id}/extension`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension_days: Number(extensionModal.days), extension_reason: extensionModal.reason })
      })
      const data = await res.json()
      if (data.success) {
        setTaskMsg({ type: 'success', text: 'Ek süre talebiniz gönderildi.' })
        setExtensionModal({ open: false, task: null, days: '', reason: '' })
        fetchMyTasks()
        setTimeout(() => setTaskMsg({ type: '', text: '' }), 4000)
      } else {
        setTaskMsg({ type: 'error', text: data.message || 'Talep gönderilemedi' })
      }
    } catch (e) { setTaskMsg({ type: 'error', text: 'Hata: ' + e.message }) }
  }

  const getMonthRange = (dateObj) => {
    const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
    const end = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0)
    return { start, end }
  }

  const formatLocalISO = (d) => {
    if (!d) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDateKey = (d) => {
    if (!d) return ''
    const date = typeof d === 'string' ? new Date(d) : d
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const buildMonthDays = (dateObj) => {
    const { start, end } = getMonthRange(dateObj)
    const startWeekDay = (start.getDay() + 6) % 7
    const days = []
    for (let i = 0; i < startWeekDay; i++) days.push({ label: '', date: null, currentMonth: false })
    for (let d = 1; d <= end.getDate(); d++) {
      const dayDate = new Date(start.getFullYear(), start.getMonth(), d)
      days.push({ label: d, date: dayDate, currentMonth: true })
    }
    while (days.length % 7 !== 0) days.push({ label: '', date: null, currentMonth: false })
    return days
  }

  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
  const dayColors = ['#f5f6fa', '#f5f6fa', '#f5f6fa', '#f5f6fa', '#f5f6fa', '#f7f7ff', '#fff5f5']

  const buildTaskCalDays = (dateObj) => {
    const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
    const end = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0)
    const startWeekDay = (start.getDay() + 6) % 7
    const days = []
    for (let i = 0; i < startWeekDay; i++) days.push({ label: '', date: null })
    for (let d = 1; d <= end.getDate(); d++) {
      const dayDate = new Date(start.getFullYear(), start.getMonth(), d)
      days.push({ label: d, date: dayDate })
    }
    while (days.length % 7 !== 0) days.push({ label: '', date: null })
    return days
  }

  const getTimesheetStatusClass = (status) => {
    switch (status) {
      case 'Taslak': return 'pill-draft'
      case 'Onay Bekliyor': return 'pill-pending'
      case 'Onaylandı': return 'pill-success'
      case 'Reddedildi': return 'pill-danger'
      default: return 'pill-muted'
    }
  }

  const fetchTimesheets = async (month = selectedMonth) => {
    try {
      setLoading(true)
      const { start, end } = getMonthRange(month)
      const params = new URLSearchParams({
        user_id: user.id,
        start_date: formatLocalISO(start),
        end_date: formatLocalISO(end),
        include_drafts: 'true',
      })
      const res = await fetch(`${API_URL}/timesheets?${params.toString()}`)
      const data = await res.json()
      if (data.success) setTimesheets(data.timesheets || [])
    } catch (err) {
      console.error(err)
      setError('Timesheet listelenemedi')
    } finally {
      setLoading(false)
    }
  }

  const fetchTimesheetSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/timesheet-settings/grouped`)
      const data = await response.json()
      if (data.success && data.settings) {
        setProjectOptions(data.settings.projects || [])
        setActivityOptions(data.settings.activity_types || [])
        setWorkModeOptions(data.settings.work_modes || ['Ofis', 'Uzaktan'])
      }
    } catch (err) {
      console.error('Timesheet ayarları yüklenirken hata:', err)
      setProjectOptions(['Portal Geliştirme', 'Mobil Uygulama', 'Raporlama', 'Altyapı', 'Ar-Ge'])
      setActivityOptions(['Geliştirme', 'Eğitim', 'İzin', 'Toplantı', 'Destek', 'Analiz'])
    }
  }

  useEffect(() => {
    fetchTimesheetSettings()
  }, [])

  useEffect(() => {
    if (activeTab === 'timesheet') fetchTimesheets(selectedMonth)
  }, [selectedMonth, activeTab])

  const handleExportPdf = async () => {
    try {
      const { start, end } = getMonthRange(selectedMonth)
      const res = await fetch(`${API_URL}/timesheets/analysis/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          start_date: formatLocalISO(start),
          end_date: formatLocalISO(end),
          timesheets,
        }),
      })
      if (!res.ok) throw new Error('PDF indirilemedi')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timesheet_${formatLocalISO(start)}_${formatLocalISO(end)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      setError('PDF indirilemedi')
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (name === 'activity_type') {
      if (value === 'İzin') {
        setFormData({ ...formData, activity_type: value, project: 'İzin', work_mode: 'Ofis' })
        setLeaveType('tam-gun')
        setDurationHours('8')
        setDurationMinutes('0')
      } else {
        setFormData({ ...formData, [name]: value })
        if (formData.activity_type === 'İzin') {
          setFormData(prev => ({ ...prev, project: '', work_mode: 'Ofis' }))
          setDurationHours('')
          setDurationMinutes('0')
        }
      }
    } else {
      setFormData({ ...formData, [name]: value })
    }
  }

  const handleLeaveTypeChange = (type) => {
    setLeaveType(type)
    setDurationHours(type === 'tam-gun' ? '8' : '4')
    setDurationMinutes('0')
  }

  const openDayModal = (dateObj) => {
    if (!dateObj) return
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    const iso = `${year}-${month}-${day}`
    setModalDate(dateObj)
    setFormData((prev) => ({ ...prev, work_date: iso, activity_type: '', project: '', work_mode: 'Ofis' }))
    setDurationHours('')
    setDurationMinutes('0')
    setError('')
    setSuccess('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const isLeave = formData.activity_type === 'İzin'
    const leaveHours = leaveType === 'tam-gun' ? 8 : 4
    const totalHours = isLeave ? leaveHours : Number(durationHours || 0) + Number(durationMinutes || 0) / 60
    if (isLeave) {
      if (!formData.activity_type || !formData.work_date) { setError('Tarih ve aktivite tipi zorunludur'); return }
    } else {
      if (!formData.project || !formData.activity_type || !formData.work_mode || totalHours <= 0 || !formData.work_date) {
        setError('Tüm zorunlu alanları doldurun ve süreyi girin'); return
      }
    }
    try {
      const res = await fetch(`${API_URL}/timesheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          hours: isLeave ? (leaveType === 'tam-gun' ? 8 : 4) : totalHours,
          project: isLeave ? 'İzin' : formData.project,
          work_mode: isLeave ? 'Ofis' : formData.work_mode,
          identity_id: user.id,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Timesheet kaydedildi')
        await fetchTimesheets(selectedMonth)
        setFormData((prev) => ({ ...prev, project: '', activity_type: '', description: '' }))
        setDurationHours('')
        setDurationMinutes('0')
        setShowModal(false)
      } else {
        setError(data.message || 'Kaydedilemedi')
      }
    } catch (err) {
      console.error(err)
      setError('Kaydetme sırasında hata')
    }
  }

  const pendingExtCount = myTasks.filter(t => t.extension_status === 'onay_bekliyor').length

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">İ</div>
          <div>
            <div className="brand-title">İş Akış Yönetim Sistemi</div>
            <div className="brand-subtitle">Çalışan Paneli</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className={`nav-item ${activeTab === 'timesheet' ? 'active' : ''}`} onClick={() => setActiveTab('timesheet')}>
            <span className="nav-icon">⏱️</span>
            <span>Timesheet</span>
          </div>
          <div className={`nav-item ${activeTab === 'my-tasks' ? 'active' : ''}`} onClick={() => setActiveTab('my-tasks')}>
            <span className="nav-icon">📋</span>
            <span>Görevlerim</span>
            {myTasks.filter(t => t.approval_status === 'onay_bekliyor').length > 0 && (
              <span style={{ marginLeft: 'auto', background: '#6366f1', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {myTasks.filter(t => t.approval_status === 'onay_bekliyor').length}
              </span>
            )}
          </div>
          <div className={`nav-item ${activeTab === 'team-tasks' ? 'active' : ''}`} onClick={() => setActiveTab('team-tasks')}>
            <span className="nav-icon">👥</span>
            <span>Takım Görevleri</span>
          </div>
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">{user.first_name?.[0]}{user.last_name?.[0]}</div>
          <div className="user-meta">
            <div className="user-name">{user.first_name} {user.last_name}</div>
            <div className="user-role">çalışan</div>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="main-header">
          <div>
            <p className="page-kicker">
              {activeTab === 'timesheet' ? 'Günlük girişlerinizi kaydedin' : activeTab === 'my-tasks' ? 'Size atanmış görevler' : 'Takımınızdaki görevler'}
            </p>
            <h1 className="page-title">
              {activeTab === 'timesheet' ? 'Timesheet' : activeTab === 'my-tasks' ? 'Görevlerim' : 'Takım Görevleri'}
            </h1>
          </div>
          <div className="header-actions">
            <button className="ghost-button" onClick={onLogout}>Çıkış</button>
          </div>
        </header>

        {/* ── TIMESHEET SEKMESİ ── */}
        {activeTab === 'timesheet' && (
          <section className="table-card">
            <div className="table-toolbar timesheet-toolbar">
              <div className="toolbar-left">
                <p className="page-kicker">Kayıtlarınız</p>
                <h2 className="page-title" style={{ fontSize: '20px', margin: 0 }}>Takvim</h2>
              </div>
              <div className="toolbar-right">
                <button className="primary-button" onClick={handleExportPdf}>PDF İndir</button>
                <div className="month-switcher">
                  <button className="ghost-button" onClick={() => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>←</button>
                  <div className="month-label">{selectedMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
                  <button className="ghost-button" onClick={() => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>→</button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="loading-state">Timesheet yükleniyor...</div>
            ) : (
              <>
                <div className="calendar-grid">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
                    <div key={d} className="calendar-head">{d}</div>
                  ))}
                  {buildMonthDays(selectedMonth).map((day, idx) => {
                    const key = day.date ? formatDateKey(day.date) : `empty-${idx}`
                    const entries = day.date ? timesheets.filter((t) => formatDateKey(t.work_date) === formatDateKey(day.date)) : []
                    const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0)
                    const dow = day.date ? (day.date.getDay() + 6) % 7 : idx % 7
                    return (
                      <div
                        key={key}
                        className={`calendar-cell ${day.currentMonth ? '' : 'calendar-cell--muted'}`}
                        onClick={() => day.currentMonth && openDayModal(day.date)}
                        style={{ cursor: day.currentMonth ? 'pointer' : 'default', background: day.currentMonth ? (dayColors[dow] || '#f8fafc') : undefined }}
                      >
                        <div className="calendar-cell-header">
                          <div className="calendar-date-block">
                            <div className="calendar-date">{day.label}</div>
                            <div className="calendar-dayname">{day.date ? dayNames[dow] : ''}</div>
                          </div>
                          {totalHours > 0 && <div className="day-hours-badge">{totalHours.toFixed(1)}s</div>}
                        </div>
                        <div className="calendar-entries">
                          {entries.slice(0, 2).map((t) => (
                            <div
                              key={t.id}
                              className={`calendar-entry ${
                                t.status === 'Taslak' ? 'status-draft' :
                                t.status === 'Onay Bekliyor' ? 'status-pending' :
                                t.status === 'Onaylandı' ? 'status-success' :
                                t.status === 'Reddedildi' ? 'status-danger' : ''
                              }`}
                            >
                              <div className="entry-title">{t.project}</div>
                              <div className="entry-meta">
                                <span>{t.hours} saat</span>
                                <span className={`pill pill-status ${getTimesheetStatusClass(t.status)}`}>{t.status}</span>
                              </div>
                              <div className="entry-desc">
                                {t.description || t.activity_type}
                                {t.status === 'Reddedildi' && t.reject_reason ? ` • Neden: ${t.reject_reason}` : ''}
                              </div>
                              {t.status === 'Taslak' && (
                                <div className="entry-actions">
                                  <button className="ghost-button" onClick={(e) => {
                                    e.stopPropagation()
                                    setShowModal(true)
                                    setModalDate(new Date(t.work_date))
                                    setFormData({ work_date: t.work_date.split('T')[0], project: t.project, activity_type: t.activity_type, work_mode: t.work_mode, description: t.description || '' })
                                    const hrs = Math.floor(t.hours)
                                    const mins = Math.round((t.hours - hrs) * 60)
                                    setDurationHours(String(hrs))
                                    setDurationMinutes(String(mins))
                                  }}>Düzenle</button>
                                  <button className="primary-button" onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      await fetch(`${API_URL}/timesheets/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Onay Bekliyor' }) })
                                      await fetchTimesheets(selectedMonth)
                                    } catch (err) { console.error(err) }
                                  }}>Onaya Gönder</button>
                                </div>
                              )}
                            </div>
                          ))}
                          {entries.length > 2 && <div className="entry-more">+{entries.length - 2} kayıt</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {timesheets.length === 0 && <div className="loading-state">Bu ay için timesheet kaydı bulunamadı</div>}
              </>
            )}
          </section>
        )}

        {/* ── GÖREVLERİM SEKMESİ ── KANBAN + TAKVİM */}
        {activeTab === 'my-tasks' && (
          <section className="table-card schema-section">
            {/* Sub-Tab Bar */}
            <div className="schema-tab-bar">
              <button className={`schema-tab ${taskSubTab === 'kanban' ? 'active' : ''}`} onClick={() => setTaskSubTab('kanban')}>📋 Kanban Panosu</button>
              <button className={`schema-tab ${taskSubTab === 'calendar' ? 'active' : ''}`} onClick={() => setTaskSubTab('calendar')}>📅 Takvim Görünümü</button>
            </div>

            {taskMsg.text && (
              <div className="kanban-toast" style={taskMsg.type === 'success' ? { background: '#ecfdf3', borderColor: '#86efac', color: '#16a34a' } : { background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
                {taskMsg.text}
              </div>
            )}

            {/* ── KANBAN ── */}
            {taskSubTab === 'kanban' && (
              taskLoading ? (
                <div className="loading-state">Görevler yükleniyor...</div>
              ) : myTasks.length === 0 ? (
                <div className="loading-state">Size atanmış görev bulunmuyor.</div>
              ) : (
                <div className="kanban-board">
                  {[
                    { key: 'beklemede', label: 'Beklemede', icon: '🕐' },
                    { key: 'devam_ediyor', label: 'Devam Ediyor', icon: '⚡' },
                    { key: 'tamamlandi', label: 'Tamamlandı', icon: '✅' },
                    { key: 'iptal', label: 'İptal', icon: '🚫' },
                  ].map(col => (
                    <div key={col.key} className="kanban-col">
                      <div className="kanban-col-header">
                        <span>{col.icon} {col.label}</span>
                        <span className="kanban-count">{myTasks.filter(t => t.status === col.key).length}</span>
                      </div>
                      <div className="kanban-cards">
                        {myTasks.filter(t => t.status === col.key).length === 0
                          ? <div className="kanban-empty">Görev yok</div>
                          : myTasks.filter(t => t.status === col.key).map(t => (
                          <div key={t.id} className="kanban-card" onClick={() => setTaskDetailModal({ open: true, task: t })} style={{ cursor: 'pointer' }}>
                            <div className="kanban-card-top">
                              <span className="kanban-priority" style={{ background: priorityColor(t.priority) + '22', color: priorityColor(t.priority) }}>{priorityLabel(t.priority)}</span>
                              <span className="kanban-approval" style={{ background: approvalColor(t.approval_status) + '22', color: approvalColor(t.approval_status) }}>{approvalLabel(t.approval_status)}</span>
                            </div>
                            <div className="kanban-card-title">{t.title}</div>
                            {t.project && <div className="kanban-card-meta">📁 {t.project.name}</div>}
                            {t.team && <div className="kanban-card-meta">👥 {t.team.name}</div>}
                            <div className="kanban-card-meta" style={{ color: isOverdue(t) ? '#ef4444' : undefined }}>
                              📅 Deadline: {fmtDate(t.due_date)} {isOverdue(t) && '⚠️'}
                            </div>
                            {t.extension_requested && t.extension_status === 'onay_bekliyor' && (
                              <div className="kanban-ext-badge">⏳ Ek Süre Talebi: +{t.extension_days} gün</div>
                            )}
                            {t.extension_status === 'onaylandi' && (
                              <div className="kanban-ext-badge" style={{ background: '#dcfce7', color: '#16a34a' }}>✅ Ek süre onaylandı (+{t.extension_days} gün)</div>
                            )}
                            {t.extension_status === 'reddedildi' && (
                              <div className="kanban-ext-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>❌ Ek süre reddedildi</div>
                            )}
                            {t.description && <div className="kanban-card-desc">{t.description.slice(0, 80)}{t.description.length > 80 ? '…' : ''}</div>}
                            <div className="kanban-card-actions" onClick={e => e.stopPropagation()}>
                              {t.status === 'beklemede' && (
                                <button className="kanban-action-btn kanban-action-btn--primary" onClick={() => handleUpdateStatus(t.id, 'devam_ediyor')}>Başla</button>
                              )}
                              {t.status === 'devam_ediyor' && (
                                <button className="kanban-action-btn kanban-action-btn--success" onClick={() => handleUpdateStatus(t.id, 'tamamlandi')}>Tamamla</button>
                              )}
                              {(t.status === 'beklemede' || t.status === 'devam_ediyor') && !t.extension_requested && (
                                <button className="kanban-action-btn kanban-action-btn--warn" onClick={() => setExtensionModal({ open: true, task: t, days: '', reason: '' })}>+Süre</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── TAKVİM ── */}
            {taskSubTab === 'calendar' && (
              <div>
                <div className="table-toolbar timesheet-toolbar" style={{ padding: '0 0 16px' }}>
                  <div className="toolbar-left">
                    <p className="page-kicker">Deadline'a göre görevlerim</p>
                  </div>
                  <div className="month-switcher">
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() - 1, 1))}>←</button>
                    <div className="month-label">{taskCalMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() + 1, 1))}>→</button>
                  </div>
                </div>
                <div className="calendar-grid">
                  {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => <div key={d} className="calendar-head">{d}</div>)}
                  {buildTaskCalDays(taskCalMonth).map((day, idx) => {
                    const fmtKey = day.date ? `${day.date.getFullYear()}-${String(day.date.getMonth()+1).padStart(2,'0')}-${String(day.date.getDate()).padStart(2,'0')}` : `e-${idx}`
                    const dayTasks = day.date ? myTasks.filter(t => t.due_date && t.due_date.startsWith(fmtKey)) : []
                    const isToday = day.date && fmtKey === new Date().toISOString().split('T')[0]
                    return (
                      <div key={fmtKey} className={`calendar-cell ${!day.date ? 'calendar-cell--muted' : ''}`} style={{ minHeight: 90 }}>
                        <div className="calendar-cell-header">
                          <div className="calendar-date-block">
                            <div className="calendar-date" style={isToday ? { color: '#6366f1', fontWeight: 700 } : {}}>{day.label}</div>
                          </div>
                          {dayTasks.length > 0 && <div className="day-hours-badge" style={{ background: '#6366f1' }}>{dayTasks.length}</div>}
                        </div>
                        <div className="calendar-entries">
                          {dayTasks.slice(0, 3).map(t => (
                            <div key={t.id} className="calendar-entry" style={{ background: priorityColor(t.priority) + '18', borderLeft: `3px solid ${priorityColor(t.priority)}`, cursor: 'pointer' }}
                              onClick={() => setTaskDetailModal({ open: true, task: t })}>
                              <div className="entry-title" style={{ fontWeight: 600 }}>{t.title}</div>
                              <div className="entry-meta"><span style={{ background: approvalColor(t.approval_status) + '22', color: approvalColor(t.approval_status), padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>{approvalLabel(t.approval_status)}</span></div>
                            </div>
                          ))}
                          {dayTasks.length > 3 && <div className="entry-more">+{dayTasks.length - 3} daha</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── TAKIM GÖREVLERİ SEKMESİ ── KANBAN + TAKVİM */}
        {activeTab === 'team-tasks' && (
          <section className="table-card schema-section">
            {/* Sub-Tab Bar */}
            <div className="schema-tab-bar">
              <button className={`schema-tab ${taskSubTab === 'kanban' ? 'active' : ''}`} onClick={() => setTaskSubTab('kanban')}>📋 Kanban Panosu</button>
              <button className={`schema-tab ${taskSubTab === 'calendar' ? 'active' : ''}`} onClick={() => setTaskSubTab('calendar')}>📅 Takvim Görünümü</button>
            </div>

            {/* ── KANBAN ── */}
            {taskSubTab === 'kanban' && (
              taskLoading ? (
                <div className="loading-state">Takım görevleri yükleniyor...</div>
              ) : teamTasks.length === 0 ? (
                <div className="loading-state">Takımınızda henüz görev bulunmuyor.</div>
              ) : (
                <div className="kanban-board">
                  {[
                    { key: 'beklemede', label: 'Beklemede', icon: '🕐' },
                    { key: 'devam_ediyor', label: 'Devam Ediyor', icon: '⚡' },
                    { key: 'tamamlandi', label: 'Tamamlandı', icon: '✅' },
                    { key: 'iptal', label: 'İptal', icon: '🚫' },
                  ].map(col => (
                    <div key={col.key} className="kanban-col">
                      <div className="kanban-col-header">
                        <span>{col.icon} {col.label}</span>
                        <span className="kanban-count">{teamTasks.filter(t => t.status === col.key).length}</span>
                      </div>
                      <div className="kanban-cards">
                        {teamTasks.filter(t => t.status === col.key).length === 0
                          ? <div className="kanban-empty">Görev yok</div>
                          : teamTasks.filter(t => t.status === col.key).map(t => (
                          <div key={t.id} className="kanban-card" onClick={() => setTaskDetailModal({ open: true, task: t })} style={{ cursor: 'pointer' }}>
                            <div className="kanban-card-top">
                              <span className="kanban-priority" style={{ background: priorityColor(t.priority) + '22', color: priorityColor(t.priority) }}>{priorityLabel(t.priority)}</span>
                              <span className="kanban-approval" style={{ background: approvalColor(t.approval_status) + '22', color: approvalColor(t.approval_status) }}>{approvalLabel(t.approval_status)}</span>
                            </div>
                            <div className="kanban-card-title">{t.title}</div>
                            <div className="kanban-assignee-row">
                              <span className="kanban-assignee-label">
                                👤 {t.assignee?.first_name} {t.assignee?.last_name}
                                {t.assigned_to === user.id && <span className="kanban-you-tag">Sen</span>}
                              </span>
                            </div>
                            {t.project && <div className="kanban-card-meta">📁 {t.project.name}</div>}
                            {t.team && <div className="kanban-card-meta">👥 {t.team.name}</div>}
                            <div className="kanban-card-meta" style={{ color: isOverdue(t) ? '#ef4444' : undefined }}>
                              📅 Deadline: {fmtDate(t.due_date)} {isOverdue(t) && '⚠️'}
                            </div>
                            {t.extension_requested && (
                              <div className="kanban-ext-badge" style={{ background: t.extension_status === 'onaylandi' ? '#dcfce7' : t.extension_status === 'reddedildi' ? '#fee2e2' : '#fef3c7', color: t.extension_status === 'onaylandi' ? '#15803d' : t.extension_status === 'reddedildi' ? '#dc2626' : '#92400e' }}>
                                {t.extension_status === 'onay_bekliyor' && `⏳ +${t.extension_days}g ek süre talebi`}
                                {t.extension_status === 'onaylandi' && `✅ +${t.extension_days}g onaylandı`}
                                {t.extension_status === 'reddedildi' && `❌ Ek süre reddedildi`}
                              </div>
                            )}
                            {t.description && <div className="kanban-card-desc">{t.description.slice(0, 80)}{t.description.length > 80 ? '…' : ''}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── TAKVİM ── */}
            {taskSubTab === 'calendar' && (
              <div>
                <div className="table-toolbar timesheet-toolbar" style={{ padding: '0 0 16px' }}>
                  <div className="toolbar-left">
                    <p className="page-kicker">Deadline'a göre takım görevleri</p>
                  </div>
                  <div className="month-switcher">
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() - 1, 1))}>←</button>
                    <div className="month-label">{taskCalMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() + 1, 1))}>→</button>
                  </div>
                </div>
                <div className="calendar-grid">
                  {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => <div key={d} className="calendar-head">{d}</div>)}
                  {buildTaskCalDays(taskCalMonth).map((day, idx) => {
                    const fmtKey = day.date ? `${day.date.getFullYear()}-${String(day.date.getMonth()+1).padStart(2,'0')}-${String(day.date.getDate()).padStart(2,'0')}` : `e-${idx}`
                    const dayTasks = day.date ? teamTasks.filter(t => t.due_date && t.due_date.startsWith(fmtKey)) : []
                    const isToday = day.date && fmtKey === new Date().toISOString().split('T')[0]
                    return (
                      <div key={fmtKey} className={`calendar-cell ${!day.date ? 'calendar-cell--muted' : ''}`} style={{ minHeight: 90 }}>
                        <div className="calendar-cell-header">
                          <div className="calendar-date-block">
                            <div className="calendar-date" style={isToday ? { color: '#6366f1', fontWeight: 700 } : {}}>{day.label}</div>
                          </div>
                          {dayTasks.length > 0 && <div className="day-hours-badge" style={{ background: '#6366f1' }}>{dayTasks.length}</div>}
                        </div>
                        <div className="calendar-entries">
                          {dayTasks.slice(0, 3).map(t => (
                            <div key={t.id} className="calendar-entry" style={{ background: priorityColor(t.priority) + '18', borderLeft: `3px solid ${priorityColor(t.priority)}`, cursor: 'pointer' }}
                              onClick={() => setTaskDetailModal({ open: true, task: t })}>
                              <div className="entry-title" style={{ fontWeight: 600 }}>{t.title}</div>
                              <div className="entry-meta"><span>👤 {t.assignee?.first_name}</span></div>
                            </div>
                          ))}
                          {dayTasks.length > 3 && <div className="entry-more">+{dayTasks.length - 3} daha</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Timesheet Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Timesheet Ekle ({modalDate?.toLocaleDateString('tr-TR')})</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              {success && <div className="error-message" style={{ background: '#ecfdf3', borderColor: '#86efac', color: '#16a34a' }}>{success}</div>}

              <div className="form-group">
                <label>Tarih *</label>
                <input type="date" name="work_date" value={formData.work_date} onChange={handleInputChange} required />
              </div>

              <div className="form-group">
                <label>Aktivite Tipi *</label>
                <select name="activity_type" value={formData.activity_type} onChange={handleInputChange} required>
                  <option value="">Seçiniz</option>
                  {activityOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {formData.activity_type !== 'İzin' && (
                <>
                  <div className="form-group">
                    <label>Proje *</label>
                    <select name="project" value={formData.project} onChange={handleInputChange} required>
                      <option value="">Seçiniz</option>
                      {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Çalışma Şekli *</label>
                    <select name="work_mode" value={formData.work_mode} onChange={handleInputChange} required>
                      <option value="">Seçiniz</option>
                      {workModeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Çalışılan Süre *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="number" min="0" step="1" placeholder="Saat" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} style={{ flex: 1 }} required />
                      <input type="number" min="0" max="59" step="1" placeholder="Dakika" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} style={{ width: '90px' }} />
                    </div>
                  </div>
                </>
              )}

              {formData.activity_type === 'İzin' && (
                <div className="form-group">
                  <label>İzin Süresi *</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => handleLeaveTypeChange('tam-gun')} style={{ flex:1, padding:'10px', borderRadius:'8px', border: leaveType==='tam-gun'?'2px solid #6366f1':'1.5px solid #e2e8f0', background: leaveType==='tam-gun'?'#eef2ff':'#fff', color: leaveType==='tam-gun'?'#4f46e5':'#64748b', fontWeight: leaveType==='tam-gun'?'700':'400', cursor:'pointer', transition:'all 0.15s' }}>
                      ☀️ Tam Gün<div style={{ fontSize:'12px', marginTop:'2px', opacity:0.8 }}>8 saat</div>
                    </button>
                    <button type="button" onClick={() => handleLeaveTypeChange('yarim-gun')} style={{ flex:1, padding:'10px', borderRadius:'8px', border: leaveType==='yarim-gun'?'2px solid #6366f1':'1.5px solid #e2e8f0', background: leaveType==='yarim-gun'?'#eef2ff':'#fff', color: leaveType==='yarim-gun'?'#4f46e5':'#64748b', fontWeight: leaveType==='yarim-gun'?'700':'400', cursor:'pointer', transition:'all 0.15s' }}>
                      🌙 Yarım Gün<div style={{ fontSize:'12px', marginTop:'2px', opacity:0.8 }}>4 saat</div>
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Açıklama</label>
                <textarea className="textarea" rows={3} name="description" value={formData.description} onChange={handleInputChange} placeholder="Yapılan iş / not" />
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setShowModal(false)}>Kapat</button>
                <button type="submit" className="primary-button">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ek Süre Talep Modalı */}
      {extensionModal.open && (
        <div className="modal-overlay" onClick={() => setExtensionModal({ open: false, task: null, days: '', reason: '' })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⏳ Ek Süre Talebi</h2>
              <button className="modal-close" onClick={() => setExtensionModal({ open: false, task: null, days: '', reason: '' })}>×</button>
            </div>
            <div className="modal-form">
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{extensionModal.task?.title}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>📅 Mevcut Deadline: <strong>{fmtDate(extensionModal.task?.due_date)}</strong></div>
              </div>
              <div className="form-group">
                <label>Talep Edilen Ek Gün Sayısı *</label>
                <input type="number" min="1" value={extensionModal.days} onChange={e => setExtensionModal({...extensionModal, days: e.target.value})} placeholder="Örn: 5" />
              </div>
              <div className="form-group">
                <label>Gerekçe *</label>
                <textarea className="textarea" rows={3} value={extensionModal.reason} onChange={e => setExtensionModal({...extensionModal, reason: e.target.value})} placeholder="Neden ek süreye ihtiyaç duyuyorsunuz?" />
              </div>
              <div className="modal-actions">
                <button className="ghost-button" onClick={() => setExtensionModal({ open: false, task: null, days: '', reason: '' })}>İptal</button>
                <button className="primary-button" onClick={handleRequestExtension} disabled={!extensionModal.days || !extensionModal.reason.trim()}>Talep Gönder</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GÖREV DETAY MODAL ── */}
      {taskDetailModal.open && taskDetailModal.task && (
        <div className="modal-overlay" onClick={() => setTaskDetailModal({ open: false, task: null })}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Görev Detayı</h2>
              <button className="modal-close" onClick={() => setTaskDetailModal({ open: false, task: null })}>×</button>
            </div>
            <div className="modal-form">
              {/* Öncelik + Onay durumu */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <span style={{ background: priorityColor(taskDetailModal.task.priority) + '22', color: priorityColor(taskDetailModal.task.priority), borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
                  {priorityLabel(taskDetailModal.task.priority)}
                </span>
                <span style={{ background: approvalColor(taskDetailModal.task.approval_status) + '22', color: approvalColor(taskDetailModal.task.approval_status), borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
                  {approvalLabel(taskDetailModal.task.approval_status)}
                </span>
                <span style={{ background: statusColor(taskDetailModal.task.status) + '22', color: statusColor(taskDetailModal.task.status), borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
                  {statusLabel(taskDetailModal.task.status)}
                </span>
              </div>

              {/* Başlık */}
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16, color: '#1e293b' }}>
                {taskDetailModal.task.title}
              </div>

              {/* Meta bilgiler */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 14, color: '#475569' }}>
                  <strong>📅 Deadline:</strong> <span style={{ color: isOverdue(taskDetailModal.task) ? '#ef4444' : '#1e293b', fontWeight: 600 }}>{fmtDate(taskDetailModal.task.due_date)}{isOverdue(taskDetailModal.task) && ' ⚠️ Gecikmiş'}</span>
                </div>
                {taskDetailModal.task.start_date && (
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    <strong>🗓️ Başlangıç:</strong> {fmtDate(taskDetailModal.task.start_date)}
                  </div>
                )}
                {taskDetailModal.task.assigner && (
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    <strong>👤 Atayan:</strong> {taskDetailModal.task.assigner.first_name} {taskDetailModal.task.assigner.last_name}
                  </div>
                )}
                {taskDetailModal.task.project && (
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    <strong>📁 Proje:</strong> {taskDetailModal.task.project.name}
                  </div>
                )}
                {taskDetailModal.task.team && (
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    <strong>👥 Takım:</strong> {taskDetailModal.task.team.name}
                  </div>
                )}
              </div>

              {/* Açıklama */}
              {taskDetailModal.task.description && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Açıklama</div>
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{taskDetailModal.task.description}</div>
                </div>
              )}

              {/* Ek Süre Durumu */}
              {taskDetailModal.task.extension_requested && (
                <div style={{ background: taskDetailModal.task.extension_status === 'onaylandi' ? '#dcfce7' : taskDetailModal.task.extension_status === 'reddedildi' ? '#fee2e2' : '#fef3c7', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: taskDetailModal.task.extension_status === 'onaylandi' ? '#15803d' : taskDetailModal.task.extension_status === 'reddedildi' ? '#dc2626' : '#92400e' }}>
                    {taskDetailModal.task.extension_status === 'onay_bekliyor' && `⏳ Ek süre talebi bekliyor: +${taskDetailModal.task.extension_days} gün`}
                    {taskDetailModal.task.extension_status === 'onaylandi' && `✅ Ek süre onaylandı: +${taskDetailModal.task.extension_days} gün`}
                    {taskDetailModal.task.extension_status === 'reddedildi' && `❌ Ek süre talebi reddedildi`}
                  </div>
                  {taskDetailModal.task.extension_reason && (
                    <div style={{ fontSize: 13, marginTop: 6, color: '#374151' }}>Gerekçe: {taskDetailModal.task.extension_reason}</div>
                  )}
                </div>
              )}

              {/* Aksiyonlar */}
              <div className="modal-actions">
                {taskDetailModal.task.status === 'beklemede' && (
                  <button className="primary-button" onClick={() => { handleUpdateStatus(taskDetailModal.task.id, 'devam_ediyor'); setTaskDetailModal({ open: false, task: null }) }}>▶ Başla</button>
                )}
                {taskDetailModal.task.status === 'devam_ediyor' && (
                  <button className="primary-button" style={{ background: '#10b981' }} onClick={() => { handleUpdateStatus(taskDetailModal.task.id, 'tamamlandi'); setTaskDetailModal({ open: false, task: null }) }}>✅ Tamamla</button>
                )}
                {(taskDetailModal.task.status === 'beklemede' || taskDetailModal.task.status === 'devam_ediyor') && !taskDetailModal.task.extension_requested && (
                  <button className="ghost-button" style={{ color: '#f59e0b', border: '1px solid #f59e0b' }} onClick={() => { setExtensionModal({ open: true, task: taskDetailModal.task, days: '', reason: '' }); setTaskDetailModal({ open: false, task: null }) }}>⏳ Ek Süre Talep Et</button>
                )}
                <button className="ghost-button" onClick={() => setTaskDetailModal({ open: false, task: null })}>Kapat</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default UserDashboard

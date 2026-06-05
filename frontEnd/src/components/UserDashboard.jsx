import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import './LoginPage.css'
import './TaskAttachments.css'  // .ta-drop sınıfı için (self-task dropzone'da)
import NotificationBell from './NotificationBell'
import TaskTimeline from './TaskTimeline'
import TaskAttachments from './TaskAttachments'
import GlobalSearch from './GlobalSearch'
import LeavesPanel from './LeavesPanel'
import OverviewDashboard from './OverviewDashboard'
import MembersPage from './MembersPage'
import WorkspaceSettings from './WorkspaceSettings'
import SettingsPage from './SettingsPage'
import { buildCalendarWeeks } from '../utils/calendar'
import Icon from './Icon'
import Logo from './Logo'
import AiPlannerModal from './AiPlannerModal'

const API_URL = 'http://localhost:5000/api'

// Görev önceliği seçenekleri (segmented picker için) — renkler uygulama geneliyle uyumlu
const PRIORITY_OPTIONS = [
  { value: 'dusuk',  label: 'Düşük',  color: '#86B8A1' },
  { value: 'orta',   label: 'Orta',   color: '#E0A458' },
  { value: 'yuksek', label: 'Yüksek', color: '#E06666' },
  { value: 'kritik', label: 'Kritik', color: '#B14545' },
]

const UserDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'timesheet' | 'my-tasks' | 'team-tasks' | 'leaves'
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
  // Düzenleme modu: null → yeni kayıt (POST), id → mevcut kaydı güncelle (PUT)
  const [editingTimesheetId, setEditingTimesheetId] = useState(null)
  // Timesheet değişiklik sayacı — dashboard'ı (OverviewDashboard) tazelemek için
  const [tsVersion, setTsVersion] = useState(0)
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
  const [pdfModal, setPdfModal] = useState({ open: false, start: '', end: '', busy: false })
  const [aiModal, setAiModal]   = useState({ open: false, start: '', end: '', busy: false, review: null, error: '' })
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [securityOpen, setSecurityOpen] = useState(false)

  // Solo / member self-task ataması — kendi kendine görev oluşturma modal'ı
  const [selfTaskModal, setSelfTaskModal] = useState({ open: false, busy: false, msg: '' })
  const [selfTaskForm, setSelfTaskForm] = useState({
    title: '', description: '', start_date: '', due_date: '', priority: 'orta',
    project_key: '',  // 'p:<id>' veya 'ts:<id>' — birleşik proje listesinden
  })
  // Birleşik proje listesi (gerçek projeler + timesheet etiketleri)
  const [combinedProjects, setCombinedProjects] = useState([])
  const [selfTaskFiles, setSelfTaskFiles] = useState([])  // File[] — multipart upload edilecek
  const [selfTaskDragOver, setSelfTaskDragOver] = useState(false)
  const selfTaskFileRef = useRef(null)

  // AI Proje Planlayıcı modalı
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false)

  // Bireysel — bitiş tarihi düzenleme (ek süre talebi yerine direkt değiştir)
  const [editDueModal, setEditDueModal] = useState({ open: false, task: null, due: '', busy: false })

  // Renk paleti: Modern Otağ token'larıyla hizalı (index.css :root)
  const priorityLabel = (p) => ({ dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', kritik: 'Kritik' }[p] || p)
  const priorityColor = (p) => ({ dusuk: '#86B8A1', orta: '#E0A458', yuksek: '#E06666', kritik: '#B14545' }[p] || '#8A99A8')
  const statusLabel = (s) => ({ beklemede: 'Beklemede', devam_ediyor: 'Devam Ediyor', tamamlandi: 'Tamamlandı', iptal: 'İptal' }[s] || s)
  const statusColor = (s) => ({ beklemede: '#94A4B4', devam_ediyor: '#7FA9C4', tamamlandi: '#6BA888', iptal: '#B14545' }[s] || '#94A4B4')
  const approvalLabel = (a) => ({ onay_bekliyor: 'Onay Bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' }[a] || a)
  const approvalColor = (a) => ({ onay_bekliyor: '#E0A458', onaylandi: '#6BA888', reddedildi: '#B14545' }[a] || '#94A4B4')

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

  // Aktif görevlerin (beklemede/devam_ediyor) proje isimleri.
  // Bunlar timesheet proje dropdown'ında da seçilebilir olmalı.
  const activeTaskProjects = useMemo(() => {
    const names = myTasks
      .filter(t => (t.status === 'beklemede' || t.status === 'devam_ediyor') && t.project && t.project.name)
      .map(t => t.project.name.trim())
      .filter(Boolean)
    return [...new Set(names)]
  }, [myTasks])

  // Ayarlardaki projelerde OLMAYAN, sadece aktif görevlerden gelen proje isimleri.
  // Bunlar timesheet dropdown'ında ayrı bir grup olarak gösterilir.
  const extraTaskProjects = useMemo(() => {
    const settingsLower = new Set(projectOptions.map(p => String(p).toLowerCase()))
    return activeTaskProjects.filter(p => !settingsLower.has(p.toLowerCase()))
  }, [projectOptions, activeTaskProjects])

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

  /**
   * Kendi kendine görev ata (bireysel veya member kullanıcılar için).
   * Backend POST /tasks → kendine atadığında otomatik onaylı (org_role gerek yok).
   * Eğer kullanıcı dosya seçtiyse görev oluşturulduktan sonra her birini
   * /tasks/:id/attachments endpoint'ine sırasıyla yükler.
   */
  // Self-task modal açıldığında birleşik proje listesini çek
  const fetchCombinedProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/projects/combined`, {
        headers: { 'X-User-Id': String(user.id) },
      })
      const data = await res.json()
      if (data.success) setCombinedProjects(data.items || [])
    } catch {}
  }, [user.id])

  useEffect(() => {
    if (selfTaskModal.open) fetchCombinedProjects()
  }, [selfTaskModal.open, fetchCombinedProjects])

  /**
   * Seçilen project_key'i gerçek Project id'sine çevirir.
   * - 'p:N' → N
   * - 'ts:N' → /projects/ensure ile aynı isimde Project oluşturulur, dönen id
   * - '' → null
   */
  const resolveProjectId = async (projectKey) => {
    if (!projectKey) return null
    const [src, idStr] = projectKey.split(':')
    if (src === 'p') return Number(idStr) || null
    if (src === 'ts') {
      const item = combinedProjects.find(p => p.key === projectKey)
      if (!item) return null
      try {
        const res = await fetch(`${API_URL}/projects/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': String(user.id) },
          body: JSON.stringify({ user_id: user.id, name: item.label }),
        })
        const data = await res.json()
        if (data.success && data.project?.id) {
          // Yeni proje oluşturulduysa listeyi yenile (idempotent)
          if (data.created) fetchCombinedProjects()
          return data.project.id
        }
      } catch {}
      return null
    }
    return null
  }

  const handleCreateSelfTask = async (e) => {
    e?.preventDefault?.()
    if (!selfTaskForm.title.trim() || !selfTaskForm.due_date) {
      setSelfTaskModal(m => ({ ...m, msg: 'Başlık ve son tarih zorunludur' }))
      return
    }
    setSelfTaskModal(m => ({ ...m, busy: true, msg: '' }))
    try {
      // Birleşik dropdown'dan seçilen proje gerçek Project id'sine çözümlenir
      const projectId = await resolveProjectId(selfTaskForm.project_key)

      const res = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(user.id) },
        body: JSON.stringify({
          title: selfTaskForm.title.trim(),
          description: selfTaskForm.description,
          start_date: selfTaskForm.start_date || null,
          due_date: selfTaskForm.due_date,
          priority: selfTaskForm.priority,
          project_id: projectId,
          assigned_to: user.id,
          assigned_by: user.id,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setSelfTaskModal(m => ({ ...m, busy: false, msg: data.message || 'Görev oluşturulamadı' }))
        return
      }

      // Dosyaları sırayla yükle (varsa)
      const taskId = data.task?.id
      if (taskId && selfTaskFiles.length > 0) {
        for (const file of selfTaskFiles) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('uploader_id', String(user.id))
          try {
            await fetch(`${API_URL}/tasks/${taskId}/attachments`, { method: 'POST', body: fd })
          } catch (uploadErr) {
            console.warn(`Dosya yüklenemedi: ${file.name}`, uploadErr)
            // hata olsa bile diğer dosyalara devam et — görev zaten oluştu
          }
        }
      }

      setSelfTaskModal({ open: false, busy: false, msg: '' })
      setSelfTaskForm({ title: '', description: '', start_date: '', due_date: '', priority: 'orta', project_key: '' })
      setSelfTaskFiles([])
      fetchMyTasks()
    } catch (err) {
      setSelfTaskModal(m => ({ ...m, busy: false, msg: 'Bağlantı hatası' }))
    }
  }

  /**
   * Bitiş tarihini direkt değiştir (bireysel kullanım — admin onayı yok).
   * PUT /tasks/:id ile due_date güncellenir.
   */
  const handleEditDueDate = async (e) => {
    e?.preventDefault?.()
    if (!editDueModal.task || !editDueModal.due) return
    setEditDueModal(m => ({ ...m, busy: true }))
    try {
      const res = await fetch(`${API_URL}/tasks/${editDueModal.task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(user.id) },
        body: JSON.stringify({
          due_date: editDueModal.due,
          actor_id: user.id,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert(data.message || 'Tarih güncellenemedi')
        setEditDueModal(m => ({ ...m, busy: false }))
        return
      }
      setEditDueModal({ open: false, task: null, due: '', busy: false })
      fetchMyTasks()
    } catch (err) {
      alert('Bağlantı hatası')
      setEditDueModal(m => ({ ...m, busy: false }))
    }
  }

  const handleDeleteTask = async (task) => {
    if (!task || !task.id) return
    const ok = window.confirm(`"${task.title}" görevini silmek istediğine emin misin? Bu işlem geri alınamaz.`)
    if (!ok) return
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(user.id) },
      })
      const data = await res.json()
      if (data.success) {
        setTaskMsg({ type: 'success', text: 'Görev silindi.' })
        fetchMyTasks()
        setTimeout(() => setTaskMsg({ type: '', text: '' }), 3000)
      } else {
        setTaskMsg({ type: 'error', text: data.message || 'Görev silinemedi' })
      }
    } catch (e) {
      setTaskMsg({ type: 'error', text: 'Bağlantı hatası: ' + e.message })
    }
  }

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
  // Hafta günleri arka plan tonu — hafta sonu hafifçe farklı
  const dayColors = ['', '', '', '', '', 'var(--bg-surface-2)', 'var(--bg-surface-2)']

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
      if (data.success) {
        setTimesheets(data.timesheets || [])
        // Her veri tazelemesinde dashboard'ı da senkronize tut
        setTsVersion(v => v + 1)
      }
    } catch (err) {
      console.error(err)
      setError('Timesheet listelenemedi')
    } finally {
      setLoading(false)
    }
  }

  const fetchTimesheetSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/timesheet-settings/grouped`, {
        headers: { 'X-User-Id': String(user.id) },
      })
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
    // Görev projelerini timesheet dropdown'ında gösterebilmek için
    // görevleri başlangıçta da çek (sadece my-tasks sekmesinde değil)
    fetchMyTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab === 'timesheet') fetchTimesheets(selectedMonth)
  }, [selectedMonth, activeTab])

  const exportPdfForRange = async (startISO, endISO) => {
    try {
      // Seçilen aralıktaki kayıtları çek (state'teki tek ay olabilir, aralık farklıysa fetch gerekli)
      const listRes = await fetch(
        `${API_URL}/timesheets?user_id=${user.id}&start_date=${startISO}&end_date=${endISO}&include_drafts=true`
      )
      const listData = await listRes.json()
      const entries = listData.success ? (listData.timesheets || []) : []

      const res = await fetch(`${API_URL}/timesheets/analysis/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          start_date: startISO,
          end_date: endISO,
          timesheets: entries,
        }),
      })
      if (!res.ok) throw new Error('PDF indirilemedi')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timesheet_${startISO}_${endISO}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      return true
    } catch (e) {
      console.error(e)
      setError('PDF indirilemedi')
      return false
    }
  }

  /**
   * Belirli tarih aralığı için Gemini'den AI yorumu ister.
   * Sonucu aiModal.review'a yazar; hata olursa aiModal.error doldurulur.
   */
  const fetchAiReviewForRange = async (startISO, endISO) => {
    try {
      const listRes = await fetch(
        `${API_URL}/timesheets?user_id=${user.id}&start_date=${startISO}&end_date=${endISO}&include_drafts=true`
      )
      const listData = await listRes.json()
      const entries = listData.success ? (listData.timesheets || []) : []

      if (entries.length === 0) {
        setAiModal(m => ({ ...m, busy: false, error: 'Seçilen tarih aralığında kayıt yok.' }))
        return
      }

      const res = await fetch(`${API_URL}/timesheets/ai-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          start_date: startISO,
          end_date: endISO,
          timesheets: entries,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setAiModal(m => ({ ...m, busy: false, error: data.message || 'AI yorumu alınamadı.' }))
        return
      }
      setAiModal(m => ({ ...m, busy: false, review: data.review, error: data.review?.error || '' }))
    } catch (e) {
      console.error(e)
      setAiModal(m => ({ ...m, busy: false, error: 'AI sunucusuna bağlanılamadı.' }))
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
    setEditingTimesheetId(null)  // gün modalı = yeni kayıt
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
      // editingTimesheetId varsa mevcut kaydı güncelle (PUT), yoksa yeni oluştur (POST)
      const isEditing = !!editingTimesheetId
      const url = isEditing ? `${API_URL}/timesheets/${editingTimesheetId}` : `${API_URL}/timesheets`
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
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
        setSuccess(isEditing ? 'Timesheet güncellendi' : 'Timesheet kaydedildi')
        await fetchTimesheets(selectedMonth)
        setFormData((prev) => ({ ...prev, project: '', activity_type: '', description: '' }))
        setDurationHours('')
        setDurationMinutes('0')
        setEditingTimesheetId(null)
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

  // ── Multi-tenant: plan + rol bazlı sidebar görünürlüğü ──
  const org = user.organization || {}
  const planType = org.plan_type || 'team'       // legacy hesaplar için 'team' varsayılan
  const orgRole  = user.org_role || 'member'
  const isOwner   = orgRole === 'owner'
  const isManagerOrAbove = orgRole === 'owner' || orgRole === 'manager'

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <Logo size={40} />
          <div>
            <div className="brand-title">OtagWork</div>
            <div className="brand-subtitle">
              {org.name ? org.name : (planType === 'solo' ? 'Bireysel Workspace' : 'Çalışan Paneli')}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <Icon name="home" size={16} />
            <span>Ana Sayfa</span>
          </div>
          <div className={`nav-item ${activeTab === 'timesheet' ? 'active' : ''}`} onClick={() => setActiveTab('timesheet')}>
            <Icon name="clock" size={16} />
            <span>Timesheet</span>
          </div>
          <div className={`nav-item ${activeTab === 'my-tasks' ? 'active' : ''}`} onClick={() => setActiveTab('my-tasks')}>
            <Icon name="clipboard" size={16} />
            <span>Görevlerim</span>
            {myTasks.filter(t => t.approval_status === 'onay_bekliyor').length > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'var(--text-on-primary)', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {myTasks.filter(t => t.approval_status === 'onay_bekliyor').length}
              </span>
            )}
          </div>
          {/* Takım Görevleri ve İzinlerim sadece team plan'da görünür.
              Solo workspace bireysel kullanım için: tek kişilik takım kavramı yok,
              izin onayı için yönetici yok. */}
          {planType === 'team' && (
            <>
              <div className={`nav-item ${activeTab === 'team-tasks' ? 'active' : ''}`} onClick={() => setActiveTab('team-tasks')}>
                <Icon name="users" size={16} />
                <span>Takım Görevleri</span>
              </div>
              <div className={`nav-item ${activeTab === 'leaves' ? 'active' : ''}`} onClick={() => setActiveTab('leaves')}>
                <Icon name="beach" size={16} />
                <span>İzinlerim</span>
              </div>
            </>
          )}

          {/* ── Workspace yönetimi (team + manager+) ── */}
          {planType === 'team' && isManagerOrAbove && (
            <div className={`nav-item ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
              <Icon name="users" size={16} />
              <span>Üyeler</span>
            </div>
          )}
          {isOwner && (
            <div className={`nav-item ${activeTab === 'workspace' ? 'active' : ''}`} onClick={() => setActiveTab('workspace')}>
              <Icon name="settings" size={16} />
              <span>Workspace</span>
            </div>
          )}

          {/* Solo plan'da "Takım Kur" CTA */}
          {planType === 'solo' && isOwner && (
            <div className="nav-item nav-item--cta" onClick={() => setActiveTab('workspace')} style={{ marginTop: 12, background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 700 }}>
              <Icon name="users" size={16} />
              <span>+ Takım Kur</span>
            </div>
          )}
        </nav>

        <div
          className="sidebar-user sidebar-user-clickable"
          onClick={() => setActiveTab('settings')}
          title="Ayarlar"
        >
          <div className="user-avatar">{user.first_name?.[0]}{user.last_name?.[0]}</div>
          <div className="user-meta" style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{user.first_name} {user.last_name}</div>
            <div className="user-role">Ayarlar →</div>
          </div>
          <Icon name="settings" size={14} />
        </div>
      </aside>

      <main className="admin-main">
        <header className="main-header">
          <div>
            {activeTab !== 'overview' && (
              <>
                <p className="page-kicker">
                  {activeTab === 'timesheet' ? 'Günlük girişlerinizi kaydedin'
                    : activeTab === 'my-tasks' ? 'Görevleriniz — kanban, liste, takvim'
                    : activeTab === 'team-tasks' ? 'Takımınızdaki görevler'
                    : activeTab === 'leaves' ? 'İzin ve tatil talepleriniz'
                    : activeTab === 'members' ? 'Workspace üyeleri ve davet'
                    : activeTab === 'workspace' ? 'Workspace ve plan ayarları'
                    : activeTab === 'settings' ? 'Hesap, güvenlik ve uygulama tercihleri'
                    : ''}
                </p>
                <h1 className="page-title">
                  {activeTab === 'timesheet' ? 'Timesheet'
                    : activeTab === 'my-tasks' ? 'Görevlerim'
                    : activeTab === 'team-tasks' ? 'Takım Görevleri'
                    : activeTab === 'leaves' ? 'İzinlerim'
                    : activeTab === 'members' ? 'Üyeler'
                    : activeTab === 'workspace' ? 'Workspace'
                    : activeTab === 'settings' ? 'Ayarlar'
                    : ''}
                </h1>
              </>
            )}
          </div>
          <div className="header-actions">
            <GlobalSearch onTaskOpen={(t) => {
              const full = [...myTasks, ...teamTasks].find(x => x.id === t.id)
              if (full) setTaskDetailModal({ open: true, task: full })
            }} />
            <NotificationBell userId={user.id} />
            <button className="ghost-button icon-stack" onClick={onLogout}><Icon name="log_out" size={14} /> Çıkış</button>
          </div>
        </header>

        {/* ── ANA SAYFA (OVERVIEW) ── */}
        {activeTab === 'overview' && (
          <OverviewDashboard
            user={user}
            mode={planType === 'team' && isManagerOrAbove ? 'manager' : 'user'}
            hideLeave={planType === 'solo'}
            refreshSignal={tsVersion}
            onNavigate={(target) => setActiveTab(target)}
            onTaskOpen={(t) => setTaskDetailModal({ open: true, task: t })}
            onAddTimesheet={(date) => { setEditingTimesheetId(null); setModalDate(date); setShowModal(true) }}
            onEditTimesheet={(t) => {
              setEditingTimesheetId(t.id)
              setModalDate(new Date(t.work_date))
              setFormData({
                work_date: t.work_date.split('T')[0],
                project: t.project,
                activity_type: t.activity_type,
                work_mode: t.work_mode,
                description: t.description || '',
              })
              const hrs = Math.floor(t.hours)
              const mins = Math.round((t.hours - hrs) * 60)
              setDurationHours(String(hrs))
              setDurationMinutes(String(mins))
              setError('')
              setSuccess('')
              setShowModal(true)
            }}
          />
        )}

        {/* ── ÜYELER (manager+, team plan) ── */}
        {activeTab === 'members' && planType === 'team' && isManagerOrAbove && (
          <MembersPage user={user} />
        )}

        {/* ── WORKSPACE AYARLARI (owner) ── */}
        {activeTab === 'workspace' && isOwner && (
          <WorkspaceSettings user={user} />
        )}

        {/* ── HESAP AYARLARI (herkes) ── */}
        {activeTab === 'settings' && (
          <SettingsPage user={user} />
        )}

        {/* ── TIMESHEET SEKMESİ ── */}
        {activeTab === 'timesheet' && (
          <section className="table-card">
            <div className="table-toolbar timesheet-toolbar">
              <div className="toolbar-left">
                <p className="page-kicker">Kayıtlarınız</p>
                <h2 className="page-title" style={{ fontSize: '20px', margin: 0 }}>Takvim</h2>
              </div>
              <div className="toolbar-right">
                <button
                  className="primary-button"
                  onClick={() => {
                    setPdfModal({ open: true, start: '', end: '', busy: false })
                  }}
                >PDF İndir</button>
                <button
                  className="ghost-button icon-stack"
                  onClick={() => {
                    setAiModal({ open: true, start: '', end: '', busy: false, review: null, error: '' })
                  }}
                  title="Gemini ile timesheet değerlendirmesi"
                >
                  <Icon name="sparkles" size={14} /> AI Yorumu
                </button>
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
                        style={{ cursor: day.currentMonth ? 'pointer' : 'default', background: day.currentMonth ? (dayColors[dow] || 'var(--bg-surface)') : undefined }}
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
                                    setEditingTimesheetId(t.id)  // mevcut kaydı güncelle (yeni kayıt oluşturma)
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
            <div className="schema-tab-bar" style={{ justifyContent: 'space-between', display: 'flex' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`schema-tab ${taskSubTab === 'kanban' ? 'active' : ''}`} onClick={() => setTaskSubTab('kanban')}><span className="icon-stack"><Icon name="clipboard" size={14} /> Kanban</span></button>
                <button className={`schema-tab ${taskSubTab === 'list' ? 'active' : ''}`} onClick={() => setTaskSubTab('list')}><span className="icon-stack"><Icon name="menu" size={14} /> Liste</span></button>
                <button className={`schema-tab ${taskSubTab === 'calendar' ? 'active' : ''}`} onClick={() => setTaskSubTab('calendar')}><span className="icon-stack"><Icon name="calendar" size={14} /> Takvim</span></button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ghost-button icon-stack"
                  onClick={() => setAiPlannerOpen(true)}
                  title="AI ile yeni proje planı oluştur"
                >
                  <Icon name="sparkles" size={14} /> AI Planlayıcı
                </button>
                <button
                  className="primary-button icon-stack"
                  onClick={() => setSelfTaskModal({ open: true, busy: false, msg: '' })}
                  title="Kendi kendine görev oluştur"
                >
                  <Icon name="plus" size={14} /> Yeni Görev
                </button>
              </div>
            </div>

            {taskMsg.text && (
              <div className="kanban-toast" style={taskMsg.type === 'success' ? { background: 'var(--success-soft)', borderColor: 'var(--success)', color: 'var(--success)' } : { background: 'var(--danger-soft)', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
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
                    { key: 'beklemede', label: 'Beklemede', icon: 'clock' },
                    { key: 'devam_ediyor', label: 'Devam Ediyor', icon: 'bolt' },
                    { key: 'tamamlandi', label: 'Tamamlandı', icon: 'check_circle' },
                    { key: 'iptal', label: 'İptal', icon: 'ban' },
                  ].map(col => (
                    <div
                      key={col.key}
                      className={`kanban-col kanban-col--${col.key} ${dragOverCol === col.key ? 'drag-over' : ''}`}
                      onDragOver={(e) => { if (draggedTaskId) { e.preventDefault(); setDragOverCol(col.key) } }}
                      onDragLeave={() => setDragOverCol(prev => prev === col.key ? null : prev)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOverCol(null)
                        if (!draggedTaskId) return
                        const t = myTasks.find(x => x.id === draggedTaskId)
                        if (t && t.status !== col.key) handleUpdateStatus(draggedTaskId, col.key)
                        setDraggedTaskId(null)
                      }}
                    >
                      <div className="kanban-col-header">
                        <span className="icon-stack"><Icon name={col.icon} size={14} /> {col.label}</span>
                        <span className="kanban-count">{myTasks.filter(t => t.status === col.key).length}</span>
                      </div>
                      <div className="kanban-cards">
                        {myTasks.filter(t => t.status === col.key).length === 0
                          ? <div className="kanban-empty">Görev yok</div>
                          : myTasks.filter(t => t.status === col.key).map(t => {
                            const overdue = isOverdue(t)
                            const pColor = priorityColor(t.priority)
                            const aColor = approvalColor(t.approval_status)
                            return (
                              <div
                                key={t.id}
                                className={`kanban-card ${draggedTaskId === t.id ? 'dragging' : ''} ${overdue ? 'kanban-card--overdue' : ''}`}
                                onClick={() => setTaskDetailModal({ open: true, task: t })}
                                draggable
                                onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.effectAllowed = 'move' }}
                                onDragEnd={() => { setDraggedTaskId(null); setDragOverCol(null) }}
                                style={{ cursor: 'grab', borderLeftColor: pColor }}
                              >
                                {/* Üst: rozetler */}
                                <div className="kanban-card-header">
                                  <span className="kanban-priority" style={{ background: pColor + '22', color: pColor }}>{priorityLabel(t.priority)}</span>
                                  <span className="kanban-approval" style={{ background: aColor + '22', color: aColor }}>{approvalLabel(t.approval_status)}</span>
                                </div>

                                {/* Başlık */}
                                <div className="kanban-card-title">{t.title}</div>

                                {/* Açıklama */}
                                {t.description && (
                                  <div className="kanban-card-desc">{t.description.slice(0, 100)}{t.description.length > 100 ? '…' : ''}</div>
                                )}

                                {/* Etiketler */}
                                {t.tags && t.tags.length > 0 && (
                                  <div className="kanban-card-tags">
                                    {t.tags.map(tg => (
                                      <span key={tg.id} className="kanban-tag" style={{ background: tg.color + '22', color: tg.color, borderColor: tg.color }}>{tg.name}</span>
                                    ))}
                                  </div>
                                )}

                                {/* Ek süre bantları */}
                                {t.extension_requested && t.extension_status === 'onay_bekliyor' && (
                                  <div className="kanban-ext-badge icon-stack"><Icon name="hourglass" size={12} /> Ek Süre Talebi: +{t.extension_days} gün</div>
                                )}
                                {t.extension_status === 'onaylandi' && (
                                  <div className="kanban-ext-badge icon-stack" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Icon name="check" size={12} /> Ek süre onaylandı (+{t.extension_days} gün)</div>
                                )}
                                {t.extension_status === 'reddedildi' && (
                                  <div className="kanban-ext-badge icon-stack" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="x" size={12} /> Ek süre reddedildi</div>
                                )}

                                {/* Meta chip'leri */}
                                <div className="kanban-card-chips">
                                  {t.project && <span className="kanban-chip" title={t.project.name}><Icon name="folder" size={12} /> {t.project.name}</span>}
                                  {t.team && <span className="kanban-chip" title={t.team.name}><Icon name="users" size={12} /> {t.team.name}</span>}
                                  <span className={`kanban-chip ${overdue ? 'kanban-chip--danger' : ''}`}>
                                    <Icon name="calendar" size={12} /> {fmtDate(t.due_date)} {overdue && <Icon name="alert" size={12} />}
                                  </span>
                                </div>

                                {/* Aksiyonlar */}
                                <div className="kanban-card-actions" onClick={e => e.stopPropagation()}>
                                  {t.status === 'beklemede' && (
                                    <button className="kanban-action-btn kanban-action-btn--primary" onClick={() => handleUpdateStatus(t.id, 'devam_ediyor')}>Başla</button>
                                  )}
                                  {t.status === 'devam_ediyor' && (
                                    <button className="kanban-action-btn kanban-action-btn--success" onClick={() => handleUpdateStatus(t.id, 'tamamlandi')}>Tamamla</button>
                                  )}
                                  {(t.status === 'beklemede' || t.status === 'devam_ediyor') && (
                                    planType === 'solo' ? (
                                      // Bireysel: doğrudan bitiş tarihini değiştir (admin onayı yok)
                                      <button
                                        className="kanban-action-btn kanban-action-btn--warn"
                                        onClick={() => setEditDueModal({ open: true, task: t, due: t.due_date || '', busy: false })}
                                      >Tarihi Değiştir</button>
                                    ) : !t.extension_requested ? (
                                      // Takım: yöneticiden ek süre talep et
                                      <button
                                        className="kanban-action-btn kanban-action-btn--warn"
                                        onClick={() => setExtensionModal({ open: true, task: t, days: '', reason: '' })}
                                      >+Süre</button>
                                    ) : null
                                  )}
                                  {planType === 'solo' && (
                                    <button
                                      className="kanban-action-btn kanban-action-btn--danger"
                                      onClick={() => handleDeleteTask(t)}
                                      title="Görevi sil"
                                    >Sil</button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── LİSTE (Tablo görünümü) ── */}
            {taskSubTab === 'list' && (
              <div>
                <div className="table-toolbar timesheet-toolbar" style={{ padding: '0 0 12px' }}>
                  <div className="toolbar-left">
                    <p className="page-kicker">Tüm görevlerim — sıralı liste</p>
                  </div>
                </div>
                {taskLoading ? (
                  <div className="loading-state">Yükleniyor…</div>
                ) : myTasks.length === 0 ? (
                  <div className="loading-state">Henüz görev yok. Yukarıdan "+ Yeni Görev" ile başla.</div>
                ) : (
                  <div className="table-scroll">
                    <table className="user-table">
                      <thead>
                        <tr>
                          <th>Görev</th>
                          <th>Öncelik</th>
                          <th>Durum</th>
                          <th>Başlangıç</th>
                          <th>Son Tarih</th>
                          <th>Aksiyonlar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...myTasks].sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).map(t => {
                          const overdue = isOverdue(t)
                          const pColor = priorityColor(t.priority)
                          return (
                            <tr key={t.id} onClick={() => setTaskDetailModal({ open: true, task: t })} style={{ cursor: 'pointer' }}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ width: 3, height: 24, background: pColor, borderRadius: 2, flexShrink: 0 }} />
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>
                                    {t.project && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.project.name}</div>}
                                  </div>
                                </div>
                              </td>
                              <td><span className="ov-pill" style={{ background: pColor + '22', color: pColor }}>{priorityLabel(t.priority)}</span></td>
                              <td><span className="pill pill-status">{statusLabel(t.status)}</span></td>
                              <td>{t.start_date ? fmtDate(t.start_date) : '—'}</td>
                              <td style={{ color: overdue ? 'var(--danger)' : undefined }}>
                                {fmtDate(t.due_date)}{overdue && ' ⚠'}
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {t.status === 'beklemede' && (
                                    <button className="kanban-action-btn kanban-action-btn--primary" onClick={() => handleUpdateStatus(t.id, 'devam_ediyor')}>Başla</button>
                                  )}
                                  {t.status === 'devam_ediyor' && (
                                    <button className="kanban-action-btn kanban-action-btn--success" onClick={() => handleUpdateStatus(t.id, 'tamamlandi')}>Tamamla</button>
                                  )}
                                  {planType === 'solo' && (
                                    <button className="kanban-action-btn kanban-action-btn--danger" onClick={() => handleDeleteTask(t)} title="Görevi sil">Sil</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── TAKVİM (Şerit görünümü) ── */}
            {taskSubTab === 'calendar' && (
              <div>
                <div className="table-toolbar timesheet-toolbar" style={{ padding: '0 0 16px' }}>
                  <div className="toolbar-left">
                    <p className="page-kicker">Başlangıç → bitiş şerit görünümü</p>
                  </div>
                  <div className="month-switcher">
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() - 1, 1))}>←</button>
                    <div className="month-label">{taskCalMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() + 1, 1))}>→</button>
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date())} style={{ marginLeft: 6 }}>Bugün</button>
                  </div>
                </div>
                <div className="cal-spans">
                  <div className="cal-head-row">
                    {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((d, i) => (
                      <div key={d} className={`cal-head ${i >= 5 ? 'cal-head--weekend' : ''}`}>{d}</div>
                    ))}
                  </div>
                  {buildCalendarWeeks(myTasks, taskCalMonth).map((week, wi) => {
                    const MAX_ROWS = 3
                    const visibleSpans = week.spans.filter(s => s.row < MAX_ROWS)
                    const overflowByDay = {}
                    week.spans.filter(s => s.row >= MAX_ROWS).forEach(s => {
                      for (let c = s.startCol; c < s.endCol; c++) overflowByDay[c] = (overflowByDay[c] || 0) + 1
                    })
                    return (
                      <div key={wi} className="cal-week">
                        {week.days.map((day, di) => {
                          const cls = [
                            'cal-cell',
                            !day.inMonth ? 'cal-cell--muted' : '',
                            day.isWeekend ? 'cal-cell--weekend' : '',
                            day.isToday ? 'cal-cell--today' : '',
                          ].filter(Boolean).join(' ')
                          return (
                            <div key={di} className={cls}>
                              <div className="cal-cell-date">{day.label}</div>
                              {overflowByDay[di + 1] && <div className="cal-cell-overflow">+{overflowByDay[di + 1]}</div>}
                            </div>
                          )
                        })}
                        {visibleSpans.map(span => {
                          const t = span.task
                          const overdue = isOverdue(t)
                          const done = t.status === 'tamamlandi'
                          const pColor = priorityColor(t.priority)
                          return (
                            <div
                              key={`${t.id}-${wi}`}
                              className={[
                                'cal-span',
                                overdue ? 'cal-span--overdue' : '',
                                done ? 'cal-span--done' : '',
                                span.continuesLeft ? 'cal-span--cont-l' : '',
                                span.continuesRight ? 'cal-span--cont-r' : '',
                              ].filter(Boolean).join(' ')}
                              style={{
                                gridColumn: `${span.startCol} / ${span.endCol}`,
                                gridRow: span.row + 2,
                                background: pColor + '22',
                                borderLeft: `3px solid ${pColor}`,
                              }}
                              onClick={() => setTaskDetailModal({ open: true, task: t })}
                              title={t.title}
                            >
                              <span className="cal-span-title">{t.title}</span>
                            </div>
                          )
                        })}
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
              <button className={`schema-tab ${taskSubTab === 'kanban' ? 'active' : ''}`} onClick={() => setTaskSubTab('kanban')}><span className="icon-stack"><Icon name="clipboard" size={14} /> Kanban Panosu</span></button>
              <button className={`schema-tab ${taskSubTab === 'calendar' ? 'active' : ''}`} onClick={() => setTaskSubTab('calendar')}><span className="icon-stack"><Icon name="calendar" size={14} /> Takvim Görünümü</span></button>
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
                    { key: 'beklemede', label: 'Beklemede', icon: 'clock' },
                    { key: 'devam_ediyor', label: 'Devam Ediyor', icon: 'bolt' },
                    { key: 'tamamlandi', label: 'Tamamlandı', icon: 'check_circle' },
                    { key: 'iptal', label: 'İptal', icon: 'ban' },
                  ].map(col => (
                    <div key={col.key} className={`kanban-col kanban-col--${col.key}`}>
                      <div className="kanban-col-header">
                        <span className="icon-stack"><Icon name={col.icon} size={14} /> {col.label}</span>
                        <span className="kanban-count">{teamTasks.filter(t => t.status === col.key).length}</span>
                      </div>
                      <div className="kanban-cards">
                        {teamTasks.filter(t => t.status === col.key).length === 0
                          ? <div className="kanban-empty">Görev yok</div>
                          : teamTasks.filter(t => t.status === col.key).map(t => {
                            const overdue = isOverdue(t)
                            const pColor = priorityColor(t.priority)
                            const aColor = approvalColor(t.approval_status)
                            const initials = `${t.assignee?.first_name?.[0] || ''}${t.assignee?.last_name?.[0] || ''}`.toUpperCase()
                            const isMe = t.assigned_to === user.id
                            return (
                              <div
                                key={t.id}
                                className={`kanban-card ${overdue ? 'kanban-card--overdue' : ''}`}
                                onClick={() => setTaskDetailModal({ open: true, task: t })}
                                style={{ cursor: 'pointer', borderLeftColor: pColor }}
                              >
                                {/* Üst: rozetler + avatar */}
                                <div className="kanban-card-header">
                                  <span className="kanban-priority" style={{ background: pColor + '22', color: pColor }}>{priorityLabel(t.priority)}</span>
                                  <span className="kanban-approval" style={{ background: aColor + '22', color: aColor }}>{approvalLabel(t.approval_status)}</span>
                                  {t.assignee && <span className="kanban-avatar" title={`${t.assignee.first_name} ${t.assignee.last_name}`}>{initials}</span>}
                                </div>

                                {/* Başlık */}
                                <div className="kanban-card-title">{t.title}</div>

                                {/* Açıklama */}
                                {t.description && (
                                  <div className="kanban-card-desc">{t.description.slice(0, 100)}{t.description.length > 100 ? '…' : ''}</div>
                                )}

                                {/* Ek süre bandı */}
                                {t.extension_requested && (
                                  <div className="kanban-ext-badge icon-stack" style={{ background: t.extension_status === 'onaylandi' ? 'var(--success-soft)' : t.extension_status === 'reddedildi' ? 'var(--danger-soft)' : 'var(--warning-soft)', color: t.extension_status === 'onaylandi' ? 'var(--success)' : t.extension_status === 'reddedildi' ? 'var(--danger)' : 'var(--warning)' }}>
                                    {t.extension_status === 'onay_bekliyor' && <><Icon name="hourglass" size={12} /> +{t.extension_days}g ek süre talebi</>}
                                    {t.extension_status === 'onaylandi' && <><Icon name="check" size={12} /> +{t.extension_days}g onaylandı</>}
                                    {t.extension_status === 'reddedildi' && <><Icon name="x" size={12} /> Ek süre reddedildi</>}
                                  </div>
                                )}

                                {/* Meta chip'leri */}
                                <div className="kanban-card-chips">
                                  <span className={`kanban-chip ${isMe ? 'kanban-chip--accent' : ''}`}>
                                    <Icon name="user" size={12} /> {t.assignee?.first_name} {isMe && '(Sen)'}
                                  </span>
                                  {t.project && <span className="kanban-chip" title={t.project.name}><Icon name="folder" size={12} /> {t.project.name}</span>}
                                  {t.team && <span className="kanban-chip" title={t.team.name}><Icon name="users" size={12} /> {t.team.name}</span>}
                                  <span className={`kanban-chip ${overdue ? 'kanban-chip--danger' : ''}`}>
                                    <Icon name="calendar" size={12} /> {fmtDate(t.due_date)} {overdue && <Icon name="alert" size={12} />}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── TAKVİM (Şerit görünümü) ── */}
            {taskSubTab === 'calendar' && (
              <div>
                <div className="table-toolbar timesheet-toolbar" style={{ padding: '0 0 16px' }}>
                  <div className="toolbar-left">
                    <p className="page-kicker">Takım görevleri — başlangıç → bitiş şerit görünümü</p>
                  </div>
                  <div className="month-switcher">
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() - 1, 1))}>←</button>
                    <div className="month-label">{taskCalMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date(taskCalMonth.getFullYear(), taskCalMonth.getMonth() + 1, 1))}>→</button>
                    <button className="ghost-button" onClick={() => setTaskCalMonth(new Date())} style={{ marginLeft: 6 }}>Bugün</button>
                  </div>
                </div>
                <div className="cal-spans">
                  <div className="cal-head-row">
                    {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((d, i) => (
                      <div key={d} className={`cal-head ${i >= 5 ? 'cal-head--weekend' : ''}`}>{d}</div>
                    ))}
                  </div>
                  {buildCalendarWeeks(teamTasks, taskCalMonth).map((week, wi) => {
                    const MAX_ROWS = 3
                    const visibleSpans = week.spans.filter(s => s.row < MAX_ROWS)
                    const overflowByDay = {}
                    week.spans.filter(s => s.row >= MAX_ROWS).forEach(s => {
                      for (let c = s.startCol; c < s.endCol; c++) overflowByDay[c] = (overflowByDay[c] || 0) + 1
                    })
                    return (
                      <div key={wi} className="cal-week">
                        {week.days.map((day, di) => {
                          const cls = [
                            'cal-cell',
                            !day.inMonth ? 'cal-cell--muted' : '',
                            day.isWeekend ? 'cal-cell--weekend' : '',
                            day.isToday ? 'cal-cell--today' : '',
                          ].filter(Boolean).join(' ')
                          return (
                            <div key={di} className={cls}>
                              <div className="cal-cell-date">{day.label}</div>
                              {overflowByDay[di + 1] && <div className="cal-cell-overflow">+{overflowByDay[di + 1]}</div>}
                            </div>
                          )
                        })}
                        {visibleSpans.map(span => {
                          const t = span.task
                          const overdue = isOverdue(t)
                          const done = t.status === 'tamamlandi'
                          const pColor = priorityColor(t.priority)
                          const initials = `${t.assignee?.first_name?.[0] || ''}${t.assignee?.last_name?.[0] || ''}`.toUpperCase()
                          return (
                            <div
                              key={`${t.id}-${wi}`}
                              className={[
                                'cal-span',
                                overdue ? 'cal-span--overdue' : '',
                                done ? 'cal-span--done' : '',
                                span.continuesLeft ? 'cal-span--cont-l' : '',
                                span.continuesRight ? 'cal-span--cont-r' : '',
                              ].filter(Boolean).join(' ')}
                              style={{
                                gridColumn: `${span.startCol} / ${span.endCol}`,
                                gridRow: span.row + 2,
                                background: pColor + '22',
                                borderLeft: `3px solid ${pColor}`,
                              }}
                              onClick={() => setTaskDetailModal({ open: true, task: t })}
                              title={`${t.title} • ${t.assignee?.first_name || ''} ${t.assignee?.last_name || ''}`}
                            >
                              <span className="cal-span-title">{t.title}</span>
                              {t.assignee && <span className="cal-span-assignee">{initials}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── İZİNLER ── */}
        {activeTab === 'leaves' && (
          <section className="table-card schema-section" style={{ padding: 20 }}>
            <LeavesPanel user={user} mode="user" />
          </section>
        )}
      </main>

      {/* Timesheet Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingTimesheetId(null) }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTimesheetId ? 'Timesheet Düzenle' : 'Timesheet Ekle'} ({modalDate?.toLocaleDateString('tr-TR')})</h2>
              <button className="modal-close" onClick={() => { setShowModal(false); setEditingTimesheetId(null) }}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              {success && <div className="error-message" style={{ background: 'var(--success-soft)', borderColor: 'var(--success)', color: 'var(--success)' }}>{success}</div>}

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
                      {/* Ayarlarda olmayan ama aktif görevlerden gelen projeler */}
                      {extraTaskProjects.length > 0 && (
                        <optgroup label="Aktif görev projeleri">
                          {extraTaskProjects.map((p) => <option key={`task-${p}`} value={p}>{p}</option>)}
                        </optgroup>
                      )}
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
                    <button type="button" onClick={() => handleLeaveTypeChange('tam-gun')} style={{ flex:1, padding:'10px', borderRadius:'8px', border: leaveType==='tam-gun'?'2px solid var(--accent)':'1.5px solid var(--border)', background: leaveType==='tam-gun'?'var(--accent-soft)':'var(--bg-surface)', color: leaveType==='tam-gun'?'var(--accent-hover)':'var(--text-muted)', fontWeight: leaveType==='tam-gun'?'700':'400', cursor:'pointer', transition:'all 0.18s var(--ease-soft)' }}>
                      <span className="icon-stack"><Icon name="sparkles" size={14} /> Tam Gün</span>
                      <div style={{ fontSize:'12px', marginTop:'2px', opacity:0.8 }}>8 saat</div>
                    </button>
                    <button type="button" onClick={() => handleLeaveTypeChange('yarim-gun')} style={{ flex:1, padding:'10px', borderRadius:'8px', border: leaveType==='yarim-gun'?'2px solid var(--accent)':'1.5px solid var(--border)', background: leaveType==='yarim-gun'?'var(--accent-soft)':'var(--bg-surface)', color: leaveType==='yarim-gun'?'var(--accent-hover)':'var(--text-muted)', fontWeight: leaveType==='yarim-gun'?'700':'400', cursor:'pointer', transition:'all 0.18s var(--ease-soft)' }}>
                      <span className="icon-stack"><Icon name="moon" size={14} /> Yarım Gün</span>
                      <div style={{ fontSize:'12px', marginTop:'2px', opacity:0.8 }}>4 saat</div>
                    </button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Açıklama</label>
                <textarea className="textarea" rows={3} name="description" value={formData.description} onChange={handleInputChange} placeholder="Yapılan iş / not" />
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => { setShowModal(false); setEditingTimesheetId(null) }}>Kapat</button>
                <button type="submit" className="primary-button">{editingTimesheetId ? 'Güncelle' : 'Kaydet'}</button>
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
              <h2 className="icon-stack"><Icon name="hourglass" size={18} /> Ek Süre Talebi</h2>
              <button className="modal-close" onClick={() => setExtensionModal({ open: false, task: null, days: '', reason: '' })}>×</button>
            </div>
            <div className="modal-form">
              <div style={{ background: 'var(--bg-surface-2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{extensionModal.task?.title}</div>
                <div className="icon-stack" style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  <Icon name="calendar" size={12} /> Mevcut Deadline: <strong>{fmtDate(extensionModal.task?.due_date)}</strong>
                </div>
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

      {/* ── PDF TARİH ARALIĞI SEÇİM MODAL ── */}
      {pdfModal.open && (
        <div className="modal-overlay" onClick={() => !pdfModal.busy && setPdfModal({ ...pdfModal, open: false })}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack"><Icon name="download" size={18} /> PDF Raporu — Tarih Aralığı</h2>
              <button className="modal-close" disabled={pdfModal.busy} onClick={() => setPdfModal({ ...pdfModal, open: false })}>×</button>
            </div>
            <div className="modal-form">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Hızlı seçim yapın veya kendi aralığınızı belirleyin.
              </p>

              {/* Hızlı seçim chip'leri */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {(() => {
                  const today = new Date()
                  const presets = [
                    { label: 'Bu Ay', s: new Date(today.getFullYear(), today.getMonth(), 1), e: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
                    { label: 'Geçen Ay', s: new Date(today.getFullYear(), today.getMonth() - 1, 1), e: new Date(today.getFullYear(), today.getMonth(), 0) },
                    { label: 'Son 7 Gün', s: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), e: today },
                    { label: 'Son 30 Gün', s: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), e: today },
                    { label: 'Bu Yıl', s: new Date(today.getFullYear(), 0, 1), e: new Date(today.getFullYear(), 11, 31) },
                  ]
                  return presets.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      className="ghost-button"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => setPdfModal({ ...pdfModal, start: formatLocalISO(p.s), end: formatLocalISO(p.e) })}
                    >{p.label}</button>
                  ))
                })()}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={pdfModal.start}
                    onChange={(e) => setPdfModal({ ...pdfModal, start: e.target.value })}
                    disabled={pdfModal.busy}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={pdfModal.end}
                    onChange={(e) => setPdfModal({ ...pdfModal, end: e.target.value })}
                    disabled={pdfModal.busy}
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={pdfModal.busy}
                  onClick={() => setPdfModal({ ...pdfModal, open: false })}
                >İptal</button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={pdfModal.busy || !pdfModal.start || !pdfModal.end || pdfModal.end < pdfModal.start}
                  onClick={async () => {
                    setPdfModal({ ...pdfModal, busy: true })
                    const ok = await exportPdfForRange(pdfModal.start, pdfModal.end)
                    setPdfModal({ open: !ok, start: pdfModal.start, end: pdfModal.end, busy: false })
                  }}
                >
                  {pdfModal.busy ? 'Hazırlanıyor…' : 'PDF İndir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI YORUMU MODAL ── */}
      {aiModal.open && (
        <div className="modal-overlay" onClick={() => !aiModal.busy && setAiModal({ ...aiModal, open: false })}>
          <div className="modal-content ai-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack">
                <Icon name="sparkles" size={18} /> AI Yorumu — Timesheet Değerlendirmesi
              </h2>
              <button className="modal-close" disabled={aiModal.busy} onClick={() => setAiModal({ ...aiModal, open: false })}>×</button>
            </div>
            <div className="modal-form">
              {/* Tarih aralığı seçimi — review henüz alınmadıysa */}
              {!aiModal.review && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Değerlendirmek istediğin tarih aralığını seç. Gemini birkaç saniyede yapısal yorum üretir.
                  </p>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                    {(() => {
                      const today = new Date()
                      const presets = [
                        { label: 'Bu Ay',     s: new Date(today.getFullYear(), today.getMonth(), 1), e: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
                        { label: 'Geçen Ay',  s: new Date(today.getFullYear(), today.getMonth() - 1, 1), e: new Date(today.getFullYear(), today.getMonth(), 0) },
                        { label: 'Son 7 Gün', s: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), e: today },
                        { label: 'Son 30 Gün',s: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), e: today },
                        { label: 'Bu Yıl',    s: new Date(today.getFullYear(), 0, 1), e: new Date(today.getFullYear(), 11, 31) },
                      ]
                      return presets.map(p => (
                        <button
                          key={p.label}
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => setAiModal({ ...aiModal, start: formatLocalISO(p.s), end: formatLocalISO(p.e) })}
                        >{p.label}</button>
                      ))
                    })()}
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Başlangıç Tarihi</label>
                      <input
                        type="date"
                        value={aiModal.start}
                        onChange={(e) => setAiModal({ ...aiModal, start: e.target.value })}
                        disabled={aiModal.busy}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Bitiş Tarihi</label>
                      <input
                        type="date"
                        value={aiModal.end}
                        onChange={(e) => setAiModal({ ...aiModal, end: e.target.value })}
                        disabled={aiModal.busy}
                      />
                    </div>
                  </div>

                  {aiModal.error && (
                    <div className="error-message" style={{ marginTop: 10 }}>{aiModal.error}</div>
                  )}

                  <div className="modal-actions" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={aiModal.busy}
                      onClick={() => setAiModal({ ...aiModal, open: false })}
                    >İptal</button>
                    <button
                      type="button"
                      className="primary-button icon-stack"
                      disabled={aiModal.busy || !aiModal.start || !aiModal.end || aiModal.end < aiModal.start}
                      onClick={async () => {
                        setAiModal(m => ({ ...m, busy: true, error: '', review: null }))
                        await fetchAiReviewForRange(aiModal.start, aiModal.end)
                      }}
                    >
                      {aiModal.busy ? (
                        <>Analiz ediliyor…</>
                      ) : (
                        <><Icon name="sparkles" size={14} /> AI Yorumunu Üret</>
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* Review sonucu */}
              {aiModal.review && (
                <div className="ai-review">
                  {aiModal.review.success === false && (
                    <div className="error-message" style={{ marginBottom: 12 }}>
                      {aiModal.review.error || 'AI yanıtı alınamadı.'}
                    </div>
                  )}

                  {aiModal.review.general && (
                    <section className="ai-block ai-block--general">
                      <h3 className="icon-stack"><Icon name="message" size={14} /> Genel Değerlendirme</h3>
                      <p>{aiModal.review.general}</p>
                    </section>
                  )}

                  {aiModal.review.strengths?.length > 0 && (
                    <section className="ai-block ai-block--strengths">
                      <h3 className="icon-stack"><Icon name="check_circle" size={14} /> Güçlü Yönler</h3>
                      <ul>
                        {aiModal.review.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </section>
                  )}

                  {aiModal.review.improvements?.length > 0 && (
                    <section className="ai-block ai-block--improvements">
                      <h3 className="icon-stack"><Icon name="bolt" size={14} /> İyileştirme Önerileri</h3>
                      <ul>
                        {aiModal.review.improvements.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </section>
                  )}

                  {aiModal.review.risks?.length > 0 && (
                    <section className="ai-block ai-block--risks">
                      <h3 className="icon-stack"><Icon name="alert" size={14} /> Risk Uyarıları</h3>
                      <ul>
                        {aiModal.review.risks.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </section>
                  )}

                  {aiModal.review.model && (
                    <p className="ai-footer">
                      Model: <code>{aiModal.review.model}</code> · Bu içerik bilgilendirme amaçlıdır.
                    </p>
                  )}

                  <div className="modal-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setAiModal({ ...aiModal, review: null, error: '' })}
                    >← Yeni Aralık</button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setAiModal({ open: false, start: '', end: '', busy: false, review: null, error: '' })}
                    >Kapat</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GÖREV DETAY MODAL ── */}
      {taskDetailModal.open && taskDetailModal.task && (
        <div className="modal-overlay" onClick={() => setTaskDetailModal({ open: false, task: null })}>
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack"><Icon name="clipboard" size={18} /> Görev Detayı</h2>
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
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16, color: 'var(--text-primary)' }}>
                {taskDetailModal.task.title}
              </div>

              {/* Meta bilgiler */}
              <div style={{ background: 'var(--bg-surface-2)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="icon-stack" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  <Icon name="calendar" size={13} />
                  <strong>Deadline:</strong>
                  <span className="icon-stack" style={{ color: isOverdue(taskDetailModal.task) ? 'var(--danger)' : 'var(--text-primary)', fontWeight: 600 }}>
                    {fmtDate(taskDetailModal.task.due_date)}
                    {isOverdue(taskDetailModal.task) && (<><Icon name="alert" size={13} /> Gecikmiş</>)}
                  </span>
                </div>
                {taskDetailModal.task.start_date && (
                  <div className="icon-stack" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    <Icon name="calendar_days" size={13} />
                    <strong>Başlangıç:</strong> {fmtDate(taskDetailModal.task.start_date)}
                  </div>
                )}
                {taskDetailModal.task.assigner && (
                  <div className="icon-stack" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    <Icon name="user" size={13} />
                    <strong>Atayan:</strong> {taskDetailModal.task.assigner.first_name} {taskDetailModal.task.assigner.last_name}
                  </div>
                )}
                {taskDetailModal.task.project && (
                  <div className="icon-stack" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    <Icon name="folder" size={13} />
                    <strong>Proje:</strong> {taskDetailModal.task.project.name}
                  </div>
                )}
                {taskDetailModal.task.team && (
                  <div className="icon-stack" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    <Icon name="users" size={13} />
                    <strong>Takım:</strong> {taskDetailModal.task.team.name}
                  </div>
                )}
              </div>

              {/* Açıklama */}
              {taskDetailModal.task.description && (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Açıklama</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>{taskDetailModal.task.description}</div>
                </div>
              )}

              {/* Ek Süre Durumu */}
              {taskDetailModal.task.extension_requested && (
                <div style={{ background: taskDetailModal.task.extension_status === 'onaylandi' ? 'var(--success-soft)' : taskDetailModal.task.extension_status === 'reddedildi' ? 'var(--danger-soft)' : 'var(--warning-soft)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div className="icon-stack" style={{ fontSize: 13, fontWeight: 600, color: taskDetailModal.task.extension_status === 'onaylandi' ? 'var(--success)' : taskDetailModal.task.extension_status === 'reddedildi' ? 'var(--danger)' : 'var(--warning)' }}>
                    {taskDetailModal.task.extension_status === 'onay_bekliyor' && (<><Icon name="hourglass" size={13} /> Ek süre talebi bekliyor: +{taskDetailModal.task.extension_days} gün</>)}
                    {taskDetailModal.task.extension_status === 'onaylandi' && (<><Icon name="check" size={13} /> Ek süre onaylandı: +{taskDetailModal.task.extension_days} gün</>)}
                    {taskDetailModal.task.extension_status === 'reddedildi' && (<><Icon name="x" size={13} /> Ek süre talebi reddedildi</>)}
                  </div>
                  {taskDetailModal.task.extension_reason && (
                    <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-primary)' }}>Gerekçe: {taskDetailModal.task.extension_reason}</div>
                  )}
                </div>
              )}

              {/* Aksiyonlar */}
              <div className="modal-actions">
                {taskDetailModal.task.status === 'beklemede' && (
                  <button className="primary-button" onClick={() => { handleUpdateStatus(taskDetailModal.task.id, 'devam_ediyor'); setTaskDetailModal({ open: false, task: null }) }}>▶ Başla</button>
                )}
                {taskDetailModal.task.status === 'devam_ediyor' && (
                  <button className="primary-button icon-stack" style={{ background: 'var(--success)' }} onClick={() => { handleUpdateStatus(taskDetailModal.task.id, 'tamamlandi'); setTaskDetailModal({ open: false, task: null }) }}><Icon name="check" size={14} /> Tamamla</button>
                )}
                {(taskDetailModal.task.status === 'beklemede' || taskDetailModal.task.status === 'devam_ediyor') && (
                  planType === 'solo' ? (
                    <button
                      className="ghost-button icon-stack"
                      style={{ color: 'var(--warning)', border: '1px solid var(--warning)' }}
                      onClick={() => { setEditDueModal({ open: true, task: taskDetailModal.task, due: taskDetailModal.task.due_date || '', busy: false }); setTaskDetailModal({ open: false, task: null }) }}
                    >
                      <Icon name="calendar" size={14} /> Bitiş Tarihini Değiştir
                    </button>
                  ) : !taskDetailModal.task.extension_requested ? (
                    <button
                      className="ghost-button icon-stack"
                      style={{ color: 'var(--warning)', border: '1px solid var(--warning)' }}
                      onClick={() => { setExtensionModal({ open: true, task: taskDetailModal.task, days: '', reason: '' }); setTaskDetailModal({ open: false, task: null }) }}
                    >
                      <Icon name="hourglass" size={14} /> Ek Süre Talep Et
                    </button>
                  ) : null
                )}
                <button className="ghost-button" onClick={() => setTaskDetailModal({ open: false, task: null })}>Kapat</button>
              </div>

              {/* Dosya ekleri */}
              <TaskAttachments taskId={taskDetailModal.task.id} currentUserId={user.id} />

              {/* Zaman çizelgesi + yorumlar */}
              <TaskTimeline taskId={taskDetailModal.task.id} currentUserId={user.id} />
            </div>
          </div>
        </div>
      )}

      {/* ── KENDİ KENDİNE GÖREV OLUŞTURMA MODALI ── */}
      {selfTaskModal.open && (
        <div className="modal-overlay" onClick={() => !selfTaskModal.busy && setSelfTaskModal({ open: false, busy: false, msg: '' })}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack"><Icon name="plus" size={18} /> Kendine Yeni Görev</h2>
              <button className="modal-close" onClick={() => setSelfTaskModal({ open: false, busy: false, msg: '' })}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleCreateSelfTask}>
              {selfTaskModal.msg && (
                <div className="error-message" style={{ marginBottom: 12 }}>{selfTaskModal.msg}</div>
              )}
              <div className="form-group">
                <label>Başlık *</label>
                <input
                  type="text"
                  value={selfTaskForm.title}
                  onChange={(e) => setSelfTaskForm({ ...selfTaskForm, title: e.target.value })}
                  placeholder="Görev adı"
                  required disabled={selfTaskModal.busy}
                />
              </div>
              <div className="form-group">
                <label>Açıklama</label>
                <textarea
                  className="textarea" rows={3}
                  value={selfTaskForm.description}
                  onChange={(e) => setSelfTaskForm({ ...selfTaskForm, description: e.target.value })}
                  placeholder="Detaylar (opsiyonel)"
                  disabled={selfTaskModal.busy}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Başlangıç</label>
                  <input
                    type="date" value={selfTaskForm.start_date}
                    onChange={(e) => setSelfTaskForm({ ...selfTaskForm, start_date: e.target.value })}
                    disabled={selfTaskModal.busy}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Son Tarih *</label>
                  <input
                    type="date" value={selfTaskForm.due_date}
                    onChange={(e) => setSelfTaskForm({ ...selfTaskForm, due_date: e.target.value })}
                    required disabled={selfTaskModal.busy}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Öncelik</label>
                <div className="priority-picker" role="radiogroup" aria-label="Öncelik">
                  {PRIORITY_OPTIONS.map(opt => {
                    const active = selfTaskForm.priority === opt.value
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        className={`priority-opt ${active ? 'priority-opt--active' : ''}`}
                        style={active ? { borderColor: opt.color, background: opt.color + '1A', color: opt.color } : undefined}
                        onClick={() => setSelfTaskForm({ ...selfTaskForm, priority: opt.value })}
                        disabled={selfTaskModal.busy}
                        role="radio"
                        aria-checked={active}
                      >
                        <span className="priority-dot" style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="form-group">
                <label>Proje (opsiyonel)</label>
                <select
                  value={selfTaskForm.project_key}
                  onChange={(e) => setSelfTaskForm({ ...selfTaskForm, project_key: e.target.value })}
                  disabled={selfTaskModal.busy}
                >
                  <option value="">— Seçilmedi —</option>
                  {combinedProjects.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* ── Dosya yükleme — dropzone tasarımı ── */}
              <div className="form-group">
                <label style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12, color: 'var(--text-muted)' }}>
                  Dosya Ekleri
                </label>
                <input
                  ref={selfTaskFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.zip,.rar,.7z,.txt,.md"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || [])
                    setSelfTaskFiles(prev => [...prev, ...picked])
                  }}
                  disabled={selfTaskModal.busy}
                  style={{ display: 'none' }}
                />

                <div
                  className={`ta-drop ${selfTaskDragOver ? 'over' : ''} ${selfTaskModal.busy ? 'uploading' : ''}`}
                  onClick={() => !selfTaskModal.busy && selfTaskFileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setSelfTaskDragOver(true) }}
                  onDragLeave={() => setSelfTaskDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setSelfTaskDragOver(false)
                    if (selfTaskModal.busy) return
                    const dropped = Array.from(e.dataTransfer?.files || [])
                    if (dropped.length) setSelfTaskFiles(prev => [...prev, ...dropped])
                  }}
                >
                  <div className="ta-drop-icon"><Icon name="upload" size={26} /></div>
                  <div className="ta-drop-text">Dosya seçmek için tıklayın veya buraya sürükleyin</div>
                  <div className="ta-drop-sub">Maks. 10 MB · pdf, docx, xlsx, png, jpg, zip…</div>
                </div>

                {/* Seçilen dosya listesi */}
                {selfTaskFiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, color: 'var(--text-subtle)' }}>
                    Henüz dosya yok.
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selfTaskFiles.map((f, i) => (
                      <li key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px',
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 13,
                      }}>
                        <Icon name="file" size={14} />
                        <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ color: 'var(--text-subtle)', fontSize: 12 }}>{(f.size / 1024).toFixed(1)} KB</span>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => setSelfTaskFiles(prev => prev.filter((_, idx) => idx !== i))}
                          disabled={selfTaskModal.busy}
                          title="Listeden çıkar"
                          style={{ padding: '4px 6px' }}
                        ><Icon name="x" size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => { setSelfTaskModal({ open: false, busy: false, msg: '' }); setSelfTaskFiles([]) }} disabled={selfTaskModal.busy}>İptal</button>
                <button type="submit" className="primary-button icon-stack" disabled={selfTaskModal.busy}>
                  {selfTaskModal.busy ? 'Oluşturuluyor…' : (<><Icon name="check" size={14} /> Görev Ekle</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── BİTİŞ TARİHİ DEĞİŞTİRME MODALI (bireysel kullanım) ── */}
      {editDueModal.open && editDueModal.task && (
        <div className="modal-overlay" onClick={() => !editDueModal.busy && setEditDueModal({ open: false, task: null, due: '', busy: false })}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="icon-stack"><Icon name="calendar" size={18} /> Bitiş Tarihini Değiştir</h2>
              <button className="modal-close" onClick={() => setEditDueModal({ open: false, task: null, due: '', busy: false })}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleEditDueDate}>
              <div style={{ background: 'var(--bg-surface-2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{editDueModal.task.title}</div>
                <div className="icon-stack" style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  <Icon name="calendar" size={12} /> Mevcut son tarih: <strong>{fmtDate(editDueModal.task.due_date)}</strong>
                </div>
              </div>
              <div className="form-group">
                <label>Yeni Bitiş Tarihi *</label>
                <input
                  type="date"
                  value={editDueModal.due}
                  onChange={(e) => setEditDueModal({ ...editDueModal, due: e.target.value })}
                  required disabled={editDueModal.busy} autoFocus
                />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>
                Bireysel hesabınızda yönetici onayı gerekmez — değişiklik doğrudan uygulanır.
              </p>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setEditDueModal({ open: false, task: null, due: '', busy: false })} disabled={editDueModal.busy}>İptal</button>
                <button type="submit" className="primary-button icon-stack" disabled={editDueModal.busy || !editDueModal.due}>
                  {editDueModal.busy ? 'Güncelleniyor…' : (<><Icon name="check" size={14} /> Güncelle</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── AI PROJE PLANLAYICI MODALI ── */}
      <AiPlannerModal
        open={aiPlannerOpen}
        user={user}
        mode="personal"
        onClose={() => setAiPlannerOpen(false)}
        onCreated={(project, tasks) => {
          fetchMyTasks()
          setTaskMsg({
            type: 'success',
            text: `Plan oluşturuldu: "${project?.name}" projesine ${tasks?.length || 0} görev eklendi.`,
          })
          setTimeout(() => setTaskMsg({ type: '', text: '' }), 4500)
        }}
      />
    </div>
  )
}
export default UserDashboard

import { useState, useEffect } from 'react'
import './LoginPage.css'
import NotificationBell from './NotificationBell'
import TaskTimeline from './TaskTimeline'
import TaskAttachments from './TaskAttachments'
import TaskGantt from './TaskGantt'
import TaskRelations from './TaskRelations'
import GlobalSearch from './GlobalSearch'
import TaskTagEditor from './TaskTagEditor'
import AnalyticsDashboard from './AnalyticsDashboard'
import AuditLog from './AuditLog'
import LeavesPanel from './LeavesPanel'
import RecurrencesPanel from './RecurrencesPanel'

const API_URL = 'http://localhost:5000/api'

const AdminDashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    user_type: 'user',
    phone_number: ''
  })
  const [error, setError] = useState('')
  const [timesheets, setTimesheets] = useState([])
  const [timesheetLoading, setTimesheetLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [activeSection, setActiveSection] = useState(user.user_type === 'admin' ? 'schema' : 'timesheet') // 'users' | 'timesheet' | 'auth' | 'schema' | 'timesheet-settings'
  const [rejectModal, setRejectModal] = useState({ open: false, tsId: null, reason: '' })
  const [timesheetSettings, setTimesheetSettings] = useState([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsModal, setSettingsModal] = useState({ open: false, editing: null, settingType: 'project' })
  const [settingFormData, setSettingFormData] = useState({ value: '', is_active: true, display_order: 0 })
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')

  // ─── GÖREV YÖNETİMİ STATE ───
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState([])
  const [schemaSubTab, setSchemaSubTab] = useState('kanban') // 'kanban' | 'calendar' | 'teams'
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [schemaMonth, setSchemaMonth] = useState(new Date())
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskModal, setTaskModal] = useState({ open: false, editing: null })
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to: '', project_id: '', team_id: '', start_date: '', due_date: '', priority: 'orta' })
  const [taskError, setTaskError] = useState('')
  const [extensionReviewModal, setExtensionReviewModal] = useState({ open: false, task: null })
  const [taskRejectModal, setTaskRejectModal] = useState({ open: false, task: null, reason: '' })
  const [teamModal, setTeamModal] = useState({ open: false, editing: null })
  const [teamForm, setTeamForm] = useState({ name: '', description: '', manager_id: '' })
  const [projectModal, setProjectModal] = useState({ open: false, editing: null })
  const [projectForm, setProjectForm] = useState({ name: '', description: '', start_date: '', end_date: '' })

  const isAdmin = user.user_type === 'admin'
  const isManager = user.user_type === 'manager' || isAdmin

  // Kullanıcıları yükle (timesheet bölümü için gerekli)
  useEffect(() => {
    fetchUsers()
  }, [])

  // Arama filtresi
  useEffect(() => {
    if (searchTerm) {
      const filtered = users.filter(u => {
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
        const email = u.email.toLowerCase()
        const search = searchTerm.toLowerCase()
        return fullName.includes(search) || email.includes(search)
      })
      setFilteredUsers(filtered)
    } else {
      setFilteredUsers(users)
    }
  }, [searchTerm, users])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/users`)
      const data = await response.json()
      
      if (data.success) {
        setUsers(data.users)
        setFilteredUsers(data.users)
        if (!selectedUserId && data.users.length > 0) {
          setSelectedUserId(data.users[0].id)
        }
        if (activeSection === 'timesheet' && (selectedUserId || data.users[0]?.id)) {
          const targetId = selectedUserId || data.users[0].id
          await fetchTimesheets(targetId, selectedMonth)
        }
      }
    } catch (err) {
      console.error('Kullanıcılar yüklenirken hata:', err)
      setError('Kullanıcılar yüklenirken bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (userToEdit = null) => {
    if (userToEdit) {
      setEditingUser(userToEdit)
      setFormData({
        email: userToEdit.email,
        password: '',
        first_name: userToEdit.first_name,
        last_name: userToEdit.last_name,
        user_type: userToEdit.user_type,
        phone_number: userToEdit.phone_number || ''
      })
    } else {
      setEditingUser(null)
      setFormData({
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        user_type: 'user',
        phone_number: ''
      })
    }
    setShowModal(true)
    setError('')
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setFormData({
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      user_type: 'user',
      phone_number: ''
    })
    setError('')
  }

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      if (editingUser) {
        // Güncelleme
        const updateData = { ...formData }
        if (!updateData.password) {
          delete updateData.password
        }
        
        const response = await fetch(`${API_URL}/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        })

        const data = await response.json()
        
        if (data.success) {
          await fetchUsers()
          handleCloseModal()
        } else {
          setError(data.message || 'Kullanıcı güncellenirken bir hata oluştu')
        }
      } else {
        // Yeni kullanıcı
        if (!formData.password) {
          setError('Şifre gereklidir')
          return
        }

        const response = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData)
        })

        const data = await response.json()
        
        if (data.success) {
          await fetchUsers()
          handleCloseModal()
        } else {
          setError(data.message || 'Kullanıcı oluşturulurken bir hata oluştu')
        }
      }
    } catch (err) {
      console.error('Form gönderim hatası:', err)
      setError('Bir hata oluştu. Lütfen tekrar deneyin.')
    }
  }

  const handleDelete = async (userId) => {
    if (!window.confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      
      if (data.success) {
        await fetchUsers()
      } else {
        alert(data.message || 'Kullanıcı silinirken bir hata oluştu')
      }
    } catch (err) {
      console.error('Silme hatası:', err)
      alert('Bir hata oluştu. Lütfen tekrar deneyin.')
    }
  }

  const getRoleLabel = (userType) => {
    if (userType === 'admin') return 'Admin'
    if (userType === 'manager') return 'Yönetici'
    return 'Kullanıcı'
  }

  const getStatusLabel = (isActive) => {
    return isActive ? 'Aktif' : 'Pasif'
  }

  const getTimesheetStatusClass = (status) => {
    switch (status) {
      case 'Taslak':
        return 'pill-draft'
      case 'Onay Bekliyor':
        return 'pill-pending'
      case 'Onaylandı':
        return 'pill-success'
      case 'Reddedildi':
        return 'pill-danger'
      default:
        return 'pill-muted'
    }
  }

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('tr-TR')
    } catch (_) {
      return iso
    }
  }

  const getMonthRange = (dateObj) => {
    const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
    const end = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0)
    return { start, end }
  }

  const formatDateKey = (d) => {
    if (!d) return ''
    const date = typeof d === 'string' ? new Date(d) : d
    // Yerel saat diliminde formatla (UTC sorununu önlemek için)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const buildMonthDays = (dateObj) => {
    const { start, end } = getMonthRange(dateObj)
    const startWeekDay = (start.getDay() + 6) % 7 // Pazartesi başlasın
    const days = []

    for (let i = 0; i < startWeekDay; i++) {
      days.push({ label: '', date: null, currentMonth: false })
    }

    for (let d = 1; d <= end.getDate(); d++) {
      const dayDate = new Date(start.getFullYear(), start.getMonth(), d)
      days.push({
        label: d,
        date: dayDate,
        currentMonth: true,
      })
    }

    while (days.length % 7 !== 0) {
      days.push({ label: '', date: null, currentMonth: false })
    }

    return days
  }

  const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
  // Hafta içi gri, Cumartesi lila, Pazar pembe
  const dayColors = ['#f5f6fa', '#f5f6fa', '#f5f6fa', '#f5f6fa', '#f5f6fa', '#f7f7ff', '#fff5f5']

  const fetchTimesheets = async (userId, month = selectedMonth) => {
    if (!userId) return
    try {
      setTimesheetLoading(true)
      const { start, end } = getMonthRange(month)
      const params = new URLSearchParams({
        user_id: userId,
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
      })
      const response = await fetch(`${API_URL}/timesheets?${params.toString()}`)
      const data = await response.json()
      if (data.success) {
        setTimesheets(data.timesheets || [])
      }
    } catch (err) {
      console.error('Timesheet yüklenirken hata:', err)
    } finally {
      setTimesheetLoading(false)
    }
  }

  useEffect(() => {
    if (activeSection === 'timesheet' && selectedUserId) {
      fetchTimesheets(selectedUserId, selectedMonth)
    }
  }, [activeSection, selectedUserId, selectedMonth])

  const formatLocalISO = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleExportPdfAdmin = async () => {
    if (!selectedUserId) return
    const selectedUser = users.find(u => u.id === selectedUserId)
    try {
      const { start, end } = getMonthRange(selectedMonth)
      const res = await fetch(`${API_URL}/timesheets/analysis/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          start_date: formatLocalISO(start),
          end_date: formatLocalISO(end),
          user_name: selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}` : '',
          timesheets,
        }),
      })
      if (!res.ok) throw new Error('PDF indirilemedi')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const userName = selectedUser ? `${selectedUser.first_name}_${selectedUser.last_name}` : `kullanici_${selectedUserId}`
      a.download = `timesheet_${userName}_${formatLocalISO(start)}_${formatLocalISO(end)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('PDF indirilemedi')
    }
  }

  const handleTimesheetStatus = async (tsId, status, reason) => {
    let payload = { status }
    if (status === 'Reddedildi') {
      if (!reason) return
      payload.reject_reason = reason
    }
    try {
      await fetch(`${API_URL}/timesheets/${tsId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (selectedUserId) {
        fetchTimesheets(selectedUserId, selectedMonth)
      }
    } catch (err) {
      console.error('Durum güncelleme hatası:', err)
    }
  }

  const handleRoleChange = async (u, nextRole) => {
    try {
      await fetch(`${API_URL}/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_type: nextRole })
      })
      fetchUsers()
    } catch (err) {
      console.error('Rol güncelleme hatası:', err)
    }
  }

  const handleToggleActive = async (u) => {
    try {
      await fetch(`${API_URL}/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u.is_active })
      })
      fetchUsers()
    } catch (err) {
      console.error('Aktif/pasif güncelleme hatası:', err)
    }
  }

  const activeUsers = users.filter(u => u.is_active).length
  const totalUsers = users.length

  const fetchTimesheetSettings = async () => {
    try {
      setSettingsLoading(true)
      const response = await fetch(`${API_URL}/timesheet-settings`)
      const data = await response.json()
      if (data.success) {
        setTimesheetSettings(data.settings || [])
      }
    } catch (err) {
      console.error('Timesheet ayarları yüklenirken hata:', err)
    } finally {
      setSettingsLoading(false)
    }
  }

  useEffect(() => {
    if (activeSection === 'timesheet-settings' && isAdmin) {
      fetchTimesheetSettings()
    }
  }, [activeSection])

  const handleOpenSettingsModal = (settingType = 'project', editing = null) => {
    if (editing) {
      setSettingFormData({
        value: editing.value,
        is_active: editing.is_active,
        display_order: editing.display_order || 0
      })
    } else {
      setSettingFormData({ value: '', is_active: true, display_order: 0 })
    }
    setSettingsModal({ open: true, editing, settingType })
  }

  const handleCloseSettingsModal = () => {
    setSettingsModal({ open: false, editing: null, settingType: 'project' })
    setSettingFormData({ value: '', is_active: true, display_order: 0 })
    setSettingsError('')
    setSettingsSuccess('')
  }

  const handleSaveSetting = async (e) => {
    e.preventDefault()
    
    if (!settingFormData.value || !settingFormData.value.trim()) {
      alert('Lütfen bir değer girin')
      return
    }

    try {
      const url = settingsModal.editing
        ? `${API_URL}/timesheet-settings/${settingsModal.editing.id}`
        : `${API_URL}/timesheet-settings`
      
      const method = settingsModal.editing ? 'PUT' : 'POST'
      const body = {
        ...settingFormData,
        setting_type: settingsModal.settingType,
        value: settingFormData.value.trim()
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.success) {
        await fetchTimesheetSettings()
        handleCloseSettingsModal()
        setSettingsError('')
        setSettingsSuccess('Ayar başarıyla kaydedildi')
        setTimeout(() => setSettingsSuccess(''), 3000)
      } else {
        const errorMsg = data.message || 'Kaydedilemedi'
        alert(errorMsg)
        setSettingsError(errorMsg)
      }
    } catch (err) {
      console.error('Ayar kaydetme hatası:', err)
      const errorMsg = `Bir hata oluştu: ${err.message || 'Bilinmeyen hata'}`
      alert(errorMsg)
      setSettingsError(errorMsg)
    }
  }

  const handleDeleteSetting = async (id) => {
    if (!window.confirm('Bu ayarı silmek istediğinize emin misiniz?')) {
      return
    }
    try {
      const response = await fetch(`${API_URL}/timesheet-settings/${id}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        await fetchTimesheetSettings()
      } else {
        alert(data.message || 'Silinemedi')
      }
    } catch (err) {
      console.error('Ayar silme hatası:', err)
      alert('Bir hata oluştu')
    }
  }

  const getSettingsByType = (type) => {
    return timesheetSettings.filter(s => s.setting_type === type)
  }

  // ─── GÖREV YÖNETİMİ FONKSİYONLARI ───
  const fetchTasks = async () => {
    try {
      setTaskLoading(true)
      const res = await fetch(`${API_URL}/tasks`)
      const data = await res.json()
      if (data.success) setTasks(data.tasks || [])
    } catch (e) { console.error(e) } finally { setTaskLoading(false) }
  }
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/projects`)
      const data = await res.json()
      if (data.success) setProjects(data.projects || [])
    } catch (e) { console.error(e) }
  }
  const fetchTeams = async () => {
    try {
      const res = await fetch(`${API_URL}/teams`)
      const data = await res.json()
      if (data.success) setTeams(data.teams || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (activeSection === 'schema') {
      fetchTasks()
      fetchProjects()
      fetchTeams()
    }
  }, [activeSection])

  const openTaskModal = (editing = null) => {
    if (editing) {
      setTaskForm({
        title: editing.title,
        description: editing.description || '',
        assigned_to: editing.assigned_to || '',
        project_id: editing.project_id || '',
        team_id: editing.team_id || '',
        start_date: editing.start_date || '',
        due_date: editing.due_date || '',
        priority: editing.priority || 'orta',
      })
    } else {
      setTaskForm({ title: '', description: '', assigned_to: '', project_id: '', team_id: '', start_date: '', due_date: '', priority: 'orta' })
    }
    setTaskError('')
    setTaskModal({ open: true, editing })
  }

  const handleSaveTask = async (e) => {
    e.preventDefault()
    setTaskError('')
    if (!taskForm.title.trim() || !taskForm.assigned_to || !taskForm.due_date) {
      setTaskError('Başlık, atanan kişi ve son tarih zorunludur.')
      return
    }
    try {
      const body = { ...taskForm, assigned_by: user.id, project_id: taskForm.project_id || null, team_id: taskForm.team_id || null }
      const url = taskModal.editing ? `${API_URL}/tasks/${taskModal.editing.id}` : `${API_URL}/tasks`
      const method = taskModal.editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.success) { setTaskModal({ open: false, editing: null }); fetchTasks() }
      else setTaskError(data.message || 'Kaydedilemedi')
    } catch (e) { setTaskError('Hata: ' + e.message) }
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Bu görevi silmek istiyor musunuz?')) return
    await fetch(`${API_URL}/tasks/${taskId}`, { method: 'DELETE' })
    fetchTasks()
  }

  const handleTaskApproval = async (taskId, approval_status, reject_reason) => {
    const body = { approval_status }
    if (reject_reason) body.reject_reason = reject_reason
    await fetch(`${API_URL}/tasks/${taskId}/approval`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    fetchTasks()
  }

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    await fetch(`${API_URL}/tasks/${taskId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, actor_id: user.id }),
    })
    fetchTasks()
  }

  const handleExtensionReview = async (taskId, ext_status) => {
    await fetch(`${API_URL}/tasks/${taskId}/extension`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extension_status: ext_status }) })
    setExtensionReviewModal({ open: false, task: null })
    fetchTasks()
  }

  const handleSaveTeam = async (e) => {
    e.preventDefault()
    const url = teamModal.editing ? `${API_URL}/teams/${teamModal.editing.id}` : `${API_URL}/teams`
    const method = teamModal.editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...teamForm, manager_id: teamForm.manager_id || null }) })
    setTeamModal({ open: false, editing: null })
    fetchTeams()
  }

  const handleSaveProject = async (e) => {
    e.preventDefault()
    const url = projectModal.editing ? `${API_URL}/projects/${projectModal.editing.id}` : `${API_URL}/projects`
    const method = projectModal.editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...projectForm, created_by: user.id }) })
    setProjectModal({ open: false, editing: null })
    fetchProjects()
  }

  const priorityLabel = (p) => ({ dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', kritik: 'Kritik' }[p] || p)
  const priorityColor = (p) => ({ dusuk: '#10b981', orta: '#f59e0b', yuksek: '#ef4444', kritik: '#7c3aed' }[p] || '#6b7280')
  const statusLabel = (s) => ({ beklemede: 'Beklemede', devam_ediyor: 'Devam Ediyor', tamamlandi: 'Tamamlandı', iptal: 'İptal' }[s] || s)
  const statusColor = (s) => ({ beklemede: '#94a3b8', devam_ediyor: '#3b82f6', tamamlandi: '#10b981', iptal: '#ef4444' }[s] || '#94a3b8')
  const approvalLabel = (a) => ({ onay_bekliyor: 'Onay Bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' }[a] || a)
  const approvalColor = (a) => ({ onay_bekliyor: '#f59e0b', onaylandi: '#10b981', reddedildi: '#ef4444' }[a] || '#94a3b8')

  const kanbanCols = [
    { key: 'beklemede', label: 'Beklemede', icon: '🕐' },
    { key: 'devam_ediyor', label: 'Devam Ediyor', icon: '⚡' },
    { key: 'tamamlandi', label: 'Tamamlandı', icon: '✅' },
    { key: 'iptal', label: 'İptal', icon: '🚫' },
  ]

  const schemaMonthDays = () => {
    const start = new Date(schemaMonth.getFullYear(), schemaMonth.getMonth(), 1)
    const end = new Date(schemaMonth.getFullYear(), schemaMonth.getMonth() + 1, 0)
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

  const fmtDate = (iso) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('tr-TR') } catch { return iso }
  }

  const sectionTitle = () => {
    switch (activeSection) {
      case 'timesheet':
        return { kicker: 'Tüm kullanıcıların günlük girişlerini görüntüleyin', title: 'Timesheet' }
      case 'auth':
        return { kicker: 'Kullanıcı rolleri ve yetkilerini yönetin', title: 'Yetkilendirme' }
      case 'schema':
        return { kicker: 'Görev atama ve iş akışı yönetimi', title: 'Şema & Görev Yönetimi' }
      case 'analytics':
        return { kicker: 'Ekip performansı ve iş yükü göstergeleri', title: 'Analitik' }
      case 'audit':
        return { kicker: 'Tüm güvenlik olayları ve kullanıcı işlemleri', title: 'Sistem Logu' }
      case 'leaves':
        return { kicker: 'Ekip izin taleplerini inceleyin', title: 'İzin Talepleri' }
      case 'recurrences':
        return { kicker: 'Düzenli aralıklarla otomatik üretilen görev kuralları', title: 'Tekrarlayan Görevler' }
      case 'timesheet-settings':
        return { kicker: 'Timesheet seçeneklerini yönetin', title: 'Timesheet Ayarları' }
      default:
        return { kicker: 'Tüm kullanıcıları görüntüleyin ve yönetin', title: 'Kullanıcı Yönetimi' }
    }
  }

  const { kicker, title } = sectionTitle()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">O</div>
          <div>
            <div className="brand-title">OtagWork</div>
            <div className="brand-subtitle">{isAdmin ? 'Admin Paneli' : 'Yönetici Paneli'}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {(isAdmin || isManager) && (
            <div
              className={`nav-item ${activeSection === 'schema' ? 'active' : ''}`}
              onClick={() => setActiveSection('schema')}
            >
              <span className="nav-icon">🗂️</span>
              <span>Görev Yönetimi</span>
            </div>
          )}
          {(isAdmin || isManager) && (
            <div
              className={`nav-item ${activeSection === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveSection('analytics')}
            >
              <span className="nav-icon">📊</span>
              <span>Analitik</span>
            </div>
          )}
          {(isAdmin || isManager) && (
            <div
              className={`nav-item ${activeSection === 'leaves' ? 'active' : ''}`}
              onClick={() => setActiveSection('leaves')}
            >
              <span className="nav-icon">🏖️</span>
              <span>İzin Talepleri</span>
            </div>
          )}
          {(isAdmin || isManager) && (
            <div
              className={`nav-item ${activeSection === 'recurrences' ? 'active' : ''}`}
              onClick={() => setActiveSection('recurrences')}
            >
              <span className="nav-icon">🔁</span>
              <span>Tekrarlayan Görevler</span>
            </div>
          )}
          <div
            className={`nav-item ${activeSection === 'timesheet' ? 'active' : ''}`}
            onClick={() => setActiveSection('timesheet')}
          >
            <span className="nav-icon">⏱️</span>
            <span>Timesheet</span>
          </div>
          {isAdmin && (
            <>
              <div
                className={`nav-item ${activeSection === 'timesheet-settings' ? 'active' : ''}`}
                onClick={() => setActiveSection('timesheet-settings')}
              >
                <span className="nav-icon">⚙️</span>
                <span>Timesheet Ayarları</span>
              </div>
              <div
                className={`nav-item ${activeSection === 'users' ? 'active' : ''}`}
                onClick={() => setActiveSection('users')}
              >
                <span className="nav-icon">👥</span>
                <span>Kullanıcı Yönetimi</span>
              </div>
              <div
                className={`nav-item ${activeSection === 'auth' ? 'active' : ''}`}
                onClick={() => setActiveSection('auth')}
              >
                <span className="nav-icon">🔐</span>
                <span>Yetkilendirme</span>
              </div>
              <div
                className={`nav-item ${activeSection === 'audit' ? 'active' : ''}`}
                onClick={() => setActiveSection('audit')}
              >
                <span className="nav-icon">🛡️</span>
                <span>Sistem Logu</span>
              </div>
            </>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">
            {user.first_name?.[0]}
            {user.last_name?.[0]}
          </div>
          <div className="user-meta">
            <div className="user-name">
              {user.first_name} {user.last_name}
            </div>
            <div className="user-role">{user.user_type === 'admin' ? 'admin' : 'yönetici'}</div>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="main-header">
          <div>
            <p className="page-kicker">{kicker}</p>
            <h1 className="page-title">{title}</h1>
          </div>
          <div className="header-actions">
            <GlobalSearch onTaskOpen={(t) => {
              const full = tasks.find(x => x.id === t.id)
              if (full) openTaskModal(full)
            }} />
            <NotificationBell userId={user.id} />
            <button className="ghost-button" onClick={onLogout}>
              Çıkış
            </button>
          </div>
        </header>

        {activeSection === 'users' && isAdmin && (
          <>
            <section className="stats-row">
              <div className="stat-card">
                <p className="stat-label">Toplam Kullanıcı</p>
                <div className="stat-value">{totalUsers}</div>
              </div>
              <div className="stat-card success">
                <p className="stat-label">Aktif Kullanıcı</p>
                <div className="stat-value">{activeUsers}</div>
              </div>
            </section>

            <section className="table-card">
              <div className="table-toolbar">
                <div className="search-box">
                  <span className="nav-icon">🔍</span>
                  <input 
                    type="text" 
                    placeholder="Kullanıcı ara..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button className="primary-button" onClick={() => handleOpenModal()}>
                  + Yeni Kullanıcı
                </button>
              </div>

              {loading ? (
                <div className="loading-state">Yükleniyor...</div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="user-table">
                      <thead>
                        <tr>
                          <th>Kullanıcı</th>
                          <th>Email</th>
                          <th>Rol</th>
                          <th>Durum</th>
                          <th>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                              Kullanıcı bulunamadı
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <div className="user-cell">
                                  <div className="user-avatar small">
                                    {u.first_name?.[0] || ''}{u.last_name?.[0] || ''}
                                  </div>
                                  <span>{u.first_name} {u.last_name}</span>
                                </div>
                              </td>
                              <td>{u.email}</td>
                              <td>
                                <span className={`pill ${u.user_type === 'admin' ? 'pill-admin' : 'pill-user'}`}>
                                  {getRoleLabel(u.user_type)}
                                </span>
                              </td>
                              <td>
                                <span className={`pill pill-status ${u.is_active ? 'pill-success' : 'pill-muted'}`}>
                                  {getStatusLabel(u.is_active)}
                                </span>
                              </td>
                              <td className="actions-cell">
                                <button 
                                  className="icon-button" 
                                  onClick={() => handleOpenModal(u)}
                                  title="Düzenle"
                                >
                                  ✏️
                                </button>
                                <button 
                                  className="icon-button danger" 
                                  onClick={() => handleDelete(u.id)}
                                  title="Sil"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="table-footer">
                    <span>Toplam {filteredUsers.length} kullanıcı • Sayfa 1/1</span>
                    <div className="pager">
                      <button className="ghost-button" disabled>Önceki</button>
                      <button className="ghost-button" disabled>Sonraki</button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {activeSection === 'timesheet' && (
          <section className="table-card">
            <div className="table-toolbar timesheet-toolbar">
              <div className="toolbar-left">
                <p className="page-kicker">Günlük girdiler</p>
                <h2 className="page-title" style={{ fontSize: '20px', margin: 0 }}>Timesheet</h2>
              </div>
              <div className="toolbar-right">
                <select
                  className="select-input"
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                    </option>
                  ))}
                </select>
                <button
                  className="primary-button"
                  onClick={handleExportPdfAdmin}
                  disabled={!selectedUserId || timesheets.length === 0}
                  title={timesheets.length === 0 ? 'Bu ay için kayıt yok' : 'PDF İndir'}
                >
                  📄 PDF İndir
                </button>
                <div className="month-switcher">
                  <button
                    className="ghost-button"
                    onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))}
                  >
                    ←
                  </button>
                  <div className="month-label">
                    {selectedMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))}
                  >
                    →
                  </button>
                </div>
              </div>
            </div>

            {timesheetLoading ? (
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
                        style={{ background: day.currentMonth ? (dayColors[dow] || '#f8fafc') : undefined }}
                      >
                        <div className="calendar-cell-header">
                          <div className="calendar-date-block">
                            <div className="calendar-date">{day.label}</div>
                            <div className="calendar-dayname">{day.date ? dayNames[dow] : ''}</div>
                          </div>
                          {totalHours > 0 && (
                            <div className="day-hours-badge">
                              {totalHours.toFixed(1)}s
                            </div>
                          )}
                        </div>
                        <div className="calendar-entries">
                          {entries.slice(0, 2).map((t) => (
                            <div
                              key={t.id}
                              className={`calendar-entry ${
                                t.status === 'Taslak'
                                  ? 'status-draft'
                                  : t.status === 'Onay Bekliyor'
                                  ? 'status-pending'
                                  : t.status === 'Onaylandı'
                                  ? 'status-success'
                                  : t.status === 'Reddedildi'
                                  ? 'status-danger'
                                  : ''
                              }`}
                            >
                              <div className="entry-title">{t.project}</div>
                              <div className="entry-meta">
                                <span>{t.hours} saat</span>
                                <span className={`pill pill-status ${getTimesheetStatusClass(t.status)}`}>
                                  {t.status}
                                </span>
                              </div>
                            <div className="entry-desc">
                              {t.description || t.activity_type}
                              {t.status === 'Reddedildi' && t.reject_reason ? ` • Neden: ${t.reject_reason}` : ''}
                            </div>
                            {t.status === 'Onay Bekliyor' && (
                              <div className="entry-actions">
                                <button
                                  className="primary-button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleTimesheetStatus(t.id, 'Onaylandı')
                                  }}
                                >
                                  Onayla
                                </button>
                                <button
                                  className="ghost-button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRejectModal({ open: true, tsId: t.id, reason: '' })
                                  }}
                                >
                                  Reddet
                                </button>
                              </div>
                            )}
                            </div>
                          ))}
                          {entries.length > 2 && (
                            <div className="entry-more">+{entries.length - 2} kayıt</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {timesheets.length === 0 && (
                  <div className="loading-state">Bu ay için timesheet kaydı bulunamadı</div>
                )}
              </>
            )}
          </section>
        )}

        {activeSection === 'auth' && isAdmin && (
          <section className="table-card">
            <div className="table-toolbar">
              <div className="toolbar-left">
                <p className="page-kicker">Kullanıcı rolleri ve durumları</p>
                <h2 className="page-title" style={{ fontSize: '20px', margin: 0 }}>Yetkilendirme</h2>
              </div>
            </div>

            {loading ? (
              <div className="loading-state">Yükleniyor...</div>
            ) : (
              <div className="table-scroll">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Kullanıcı</th>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Durum</th>
                      <th>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>
                          Kullanıcı bulunamadı
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="user-cell">
                              <div className="user-avatar small">
                                {u.first_name?.[0] || ''}{u.last_name?.[0] || ''}
                              </div>
                              <span>{u.first_name} {u.last_name}</span>
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td>
                            <div className="role-select-wrap">
                              <span className={`pill ${
                                u.user_type === 'admin'
                                  ? 'pill-admin'
                                  : u.user_type === 'manager'
                                  ? 'pill-manager'
                                  : 'pill-user'
                              }`}>
                                {getRoleLabel(u.user_type)}
                              </span>
                              <select
                                className="select-input role-select"
                                value={u.user_type}
                                onChange={(e) => handleRoleChange(u, e.target.value)}
                              >
                                <option value="user">Kullanıcı</option>
                                <option value="manager">Yönetici</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                          </td>
                          <td>
                            <span className={`pill pill-status ${u.is_active ? 'pill-success' : 'pill-muted'}`}>
                              {u.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="actions-cell">
                            <button
                              className="ghost-button"
                              onClick={() => handleRoleChange(u, u.user_type === 'admin' ? 'user' : 'admin')}
                            >
                              {u.user_type === 'admin' ? 'Kullanıcı yap' : 'Admin yap'}
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() => handleToggleActive(u)}
                            >
                              {u.is_active ? 'Pasif yap' : 'Aktif yap'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeSection === 'analytics' && (isManager) && (
          <AnalyticsDashboard user={user} />
        )}

        {activeSection === 'audit' && isAdmin && (
          <AuditLog user={user} />
        )}

        {activeSection === 'leaves' && (isAdmin || isManager) && (
          <LeavesPanel user={user} mode="manager" />
        )}

        {activeSection === 'recurrences' && (isAdmin || isManager) && (
          <RecurrencesPanel user={user} users={users.filter(u => u.is_active)} />
        )}

        {activeSection === 'schema' && isManager && (
          <section className="table-card schema-section">
            {/* Sub-Tab Bar */}
            <div className="schema-tab-bar">
              <button className={`schema-tab ${schemaSubTab === 'kanban' ? 'active' : ''}`} onClick={() => setSchemaSubTab('kanban')}>📋 Kanban Panosu</button>
              <button className={`schema-tab ${schemaSubTab === 'calendar' ? 'active' : ''}`} onClick={() => setSchemaSubTab('calendar')}>📅 Takvim Görünümü</button>
              <button className={`schema-tab ${schemaSubTab === 'gantt' ? 'active' : ''}`} onClick={() => setSchemaSubTab('gantt')}>📊 Gantt Zaman Çizelgesi</button>
              {isAdmin && <button className={`schema-tab ${schemaSubTab === 'teams' ? 'active' : ''}`} onClick={() => setSchemaSubTab('teams')}>👥 Takım & Proje</button>}
              <button className="primary-button" style={{ marginLeft: 'auto' }} onClick={() => openTaskModal()}>+ Görev Ata</button>
            </div>

            {/* ── KANBAN ── */}
            {schemaSubTab === 'kanban' && (
              <div>
                {/* Extension requests banner */}
                {tasks.filter(t => t.extension_requested && t.extension_status === 'onay_bekliyor').length > 0 && (
                  <div className="extension-banner">
                    <span>⏳ {tasks.filter(t => t.extension_requested && t.extension_status === 'onay_bekliyor').length} adet ek süre talebi bekliyor</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {tasks.filter(t => t.extension_requested && t.extension_status === 'onay_bekliyor').map(t => (
                        <button key={t.id} className="ghost-button" style={{ fontSize: 12 }}
                          onClick={() => setExtensionReviewModal({ open: true, task: t })}>
                          {t.assignee?.first_name} — {t.title} (+{t.extension_days} gün)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {taskLoading
                  ? <div className="loading-state">Görevler yükleniyor...</div>
                  : (
                  <div className="kanban-board">
                    {kanbanCols.map(col => (
                      <div
                        key={col.key}
                        className={`kanban-col ${dragOverCol === col.key ? 'drag-over' : ''}`}
                        onDragOver={(e) => { if (draggedTaskId) { e.preventDefault(); setDragOverCol(col.key) } }}
                        onDragLeave={() => setDragOverCol(prev => prev === col.key ? null : prev)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setDragOverCol(null)
                          if (!draggedTaskId) return
                          const t = tasks.find(x => x.id === draggedTaskId)
                          if (t && t.status !== col.key) handleUpdateTaskStatus(draggedTaskId, col.key)
                          setDraggedTaskId(null)
                        }}
                      >
                        <div className="kanban-col-header">
                          <span>{col.icon} {col.label}</span>
                          <span className="kanban-count">{tasks.filter(t => t.status === col.key).length}</span>
                        </div>
                        <div className="kanban-cards">
                          {tasks.filter(t => t.status === col.key).length === 0
                            ? <div className="kanban-empty">Görev yok</div>
                            : tasks.filter(t => t.status === col.key).map(t => (
                            <div
                              key={t.id}
                              className={`kanban-card ${draggedTaskId === t.id ? 'dragging' : ''}`}
                              draggable
                              onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.effectAllowed = 'move' }}
                              onDragEnd={() => { setDraggedTaskId(null); setDragOverCol(null) }}
                              style={{ cursor: 'grab' }}
                              onClick={() => openTaskModal(t)}
                            >
                              <div className="kanban-card-top">
                                <span className="kanban-priority" style={{ background: priorityColor(t.priority) + '22', color: priorityColor(t.priority) }}>{priorityLabel(t.priority)}</span>
                                <span className="kanban-approval" style={{ background: approvalColor(t.approval_status) + '22', color: approvalColor(t.approval_status) }}>{approvalLabel(t.approval_status)}</span>
                              </div>
                              <div className="kanban-card-title">{t.title}</div>
                              {t.tags && t.tags.length > 0 && (
                                <div className="kanban-card-tags">
                                  {t.tags.map(tg => (
                                    <span key={tg.id} className="kanban-tag" style={{ background: tg.color + '22', color: tg.color, borderColor: tg.color }}>{tg.name}</span>
                                  ))}
                                </div>
                              )}
                              {t.project && <div className="kanban-card-meta">📁 {t.project.name}</div>}
                              <div className="kanban-card-meta">👤 {t.assignee?.first_name} {t.assignee?.last_name}</div>
                              {t.team && <div className="kanban-card-meta">👥 {t.team.name}</div>}
                              <div className="kanban-card-meta" style={{ color: new Date(t.due_date) < new Date() && t.status !== 'tamamlandi' ? '#ef4444' : undefined }}>📅 Deadline: {fmtDate(t.due_date)}</div>
                              {t.extension_requested && t.extension_status === 'onay_bekliyor' && (
                                <div className="kanban-ext-badge">⏳ Ek Süre Talebi: +{t.extension_days} gün</div>
                              )}
                              {t.extension_status === 'onaylandi' && (
                                <div className="kanban-ext-badge" style={{ background: '#dcfce7', color: '#16a34a' }}>✅ Ek süre onaylandı (+{t.extension_days} gün)</div>
                              )}
                              {t.description && <div className="kanban-card-desc">{t.description.slice(0, 80)}{t.description.length > 80 ? '…' : ''}</div>}
                              <div className="kanban-card-actions" onClick={(e) => e.stopPropagation()}>
                                {t.approval_status === 'onay_bekliyor' && (
                                  <>
                                    <button className="ghost-button" style={{ fontSize: 11, padding: '3px 8px', color: '#10b981' }}
                                      onClick={() => handleTaskApproval(t.id, 'onaylandi')}>Onayla</button>
                                    <button className="ghost-button" style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444' }}
                                      onClick={() => setTaskRejectModal({ open: true, task: t, reason: '' })}>Reddet</button>
                                  </>
                                )}
                                {t.extension_requested && t.extension_status === 'onay_bekliyor' && (
                                  <button className="ghost-button" style={{ fontSize: 11, padding: '3px 8px', color: '#f59e0b' }}
                                    onClick={() => setExtensionReviewModal({ open: true, task: t })}>Ek Süre İncele</button>
                                )}
                                <button className="icon-button" onClick={() => openTaskModal(t)} title="Düzenle">✏️</button>
                                <button className="icon-button danger" onClick={() => handleDeleteTask(t.id)} title="Sil">🗑️</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAKVİM ── */}
            {schemaSubTab === 'calendar' && (
              <div>
                <div className="table-toolbar timesheet-toolbar" style={{ padding: '0 0 16px' }}>
                  <div className="toolbar-left">
                    <p className="page-kicker">Deadline'a göre görevler</p>
                  </div>
                  <div className="month-switcher">
                    <button className="ghost-button" onClick={() => setSchemaMonth(new Date(schemaMonth.getFullYear(), schemaMonth.getMonth() - 1, 1))}>←</button>
                    <div className="month-label">{schemaMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
                    <button className="ghost-button" onClick={() => setSchemaMonth(new Date(schemaMonth.getFullYear(), schemaMonth.getMonth() + 1, 1))}>→</button>
                    <button className="ghost-button" onClick={() => setSchemaMonth(new Date())} style={{ marginLeft: 6 }}>Bugün</button>
                  </div>
                </div>
                <div className="calendar-grid">
                  {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => <div key={d} className="calendar-head">{d}</div>)}
                  {schemaMonthDays().map((day, idx) => {
                    const fmtKey = day.date ? `${day.date.getFullYear()}-${String(day.date.getMonth()+1).padStart(2,'0')}-${String(day.date.getDate()).padStart(2,'0')}` : `e-${idx}`
                    const dayTasks = day.date ? tasks.filter(t => t.due_date && t.due_date.startsWith(fmtKey)) : []
                    const isToday = day.date && fmtKey === new Date().toISOString().split('T')[0]
                    const hasOverdue = dayTasks.some(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'tamamlandi')
                    return (
                      <div
                        key={fmtKey}
                        className={`calendar-cell ${!day.date ? 'calendar-cell--muted' : ''} ${isToday ? 'calendar-cell--today' : ''} ${hasOverdue ? 'calendar-cell--overdue' : ''}`}
                        style={{ minHeight: 90 }}
                      >
                        <div className="calendar-cell-header">
                          <div className="calendar-date-block">
                            <div className="calendar-date" style={isToday ? { color: '#6366f1', fontWeight: 700 } : {}}>{day.label}</div>
                          </div>
                          {dayTasks.length > 0 && <div className="day-hours-badge" style={{ background: '#6366f1' }}>{dayTasks.length}</div>}
                        </div>
                        <div className="calendar-entries">
                          {dayTasks.slice(0, 3).map(t => (
                            <div key={t.id} className="calendar-entry" style={{ background: priorityColor(t.priority) + '18', borderLeft: `3px solid ${priorityColor(t.priority)}` }}>
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

            {/* ── GANTT ── */}
            {schemaSubTab === 'gantt' && (
              <div style={{ marginTop: 12 }}>
                <TaskGantt
                  tasks={tasks}
                  projects={projects}
                  onTaskClick={(t) => openTaskModal(t)}
                />
              </div>
            )}

            {/* ── TAKIM & PROJE ── */}
            {schemaSubTab === 'teams' && isAdmin && (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {/* Takımlar */}
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>👥 Takımlar</h3>
                    <button className="primary-button" onClick={() => { setTeamForm({ name:'', description:'', manager_id:'' }); setTeamModal({ open: true, editing: null }) }}>+ Takım Oluştur</button>
                  </div>
                  {teams.length === 0
                    ? <div className="loading-state">Henüz takım oluşturulmamış.</div>
                    : teams.map(t => (
                    <div key={t.id} className="schema-team-card">
                      <div className="schema-team-header">
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                        <div style={{ display:'flex', gap: 6 }}>
                          <button className="icon-button" onClick={() => { setTeamForm({ name:t.name, description:t.description||'', manager_id:t.manager_id||'' }); setTeamModal({ open:true, editing:t }) }}>✏️</button>
                        </div>
                      </div>
                      {t.manager && <div style={{ fontSize: 12, color: '#64748b' }}>Yönetici: {t.manager.first_name} {t.manager.last_name}</div>}
                      {t.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{t.description}</div>}
                      <div style={{ marginTop: 8, fontSize: 12, color: '#6366f1', fontWeight: 600 }}>{t.member_count} üye</div>
                    </div>
                  ))}
                </div>
                {/* Projeler */}
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>📁 Projeler</h3>
                    <button className="primary-button" onClick={() => { setProjectForm({ name:'', description:'', start_date:'', end_date:'' }); setProjectModal({ open:true, editing:null }) }}>+ Proje Oluştur</button>
                  </div>
                  {projects.length === 0
                    ? <div className="loading-state">Henüz proje oluşturulmamış.</div>
                    : projects.map(p => (
                    <div key={p.id} className="schema-team-card">
                      <div className="schema-team-header">
                        <div style={{ fontWeight: 700, fontSize: 15 }}>📁 {p.name}</div>
                        <div style={{ display:'flex', gap: 6 }}>
                          <button className="icon-button" onClick={() => { setProjectForm({ name:p.name, description:p.description||'', start_date:p.start_date||'', end_date:p.end_date||'' }); setProjectModal({ open:true, editing:p }) }}>✏️</button>
                        </div>
                      </div>
                      {p.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{p.description}</div>}
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                        {p.start_date && <>Başlangıç: {fmtDate(p.start_date)} &nbsp;</>}
                        {p.end_date && <>Bitis: {fmtDate(p.end_date)}</>}
                      </div>
                      <div style={{ marginTop: 6 }}><span className={`pill pill-status ${p.status === 'aktif' ? 'pill-success' : p.status === 'tamamlandi' ? 'pill-draft' : 'pill-danger'}`}>{p.status === 'aktif' ? 'Aktif' : p.status === 'tamamlandi' ? 'Tamamlandı' : 'İptal'}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── GÖREV ATAMA MODAL ── */}
        {taskModal.open && (
          <div className="modal-overlay" onClick={() => setTaskModal({ open: false, editing: null })}>
            <div className="modal-content" style={{ maxWidth: taskModal.editing ? 640 : 520 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{taskModal.editing ? '✏️ Görev Düzenle' : '📋 Yeni Görev Ata'}</h2>
                <button className="modal-close" onClick={() => setTaskModal({ open: false, editing: null })}>×</button>
              </div>
              <form className="modal-form" onSubmit={handleSaveTask}>
                {taskError && <div className="error-message">{taskError}</div>}
                <div className="form-group">
                  <label>Görev Başlığı *</label>
                  <input type="text" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} placeholder="Görev adını girin" required />
                </div>
                <div className="form-group">
                  <label>Açıklama</label>
                  <textarea className="textarea" rows={3} value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} placeholder="Görev detayları..." />
                </div>
                <div className="form-group">
                  <label>Atanan Kişi *</label>
                  <select value={taskForm.assigned_to} onChange={e => setTaskForm({...taskForm, assigned_to: e.target.value})} required>
                    <option value="">Çalışan seçin...</option>
                    {users.filter(u => u.is_active).map(u => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.user_type})</option>
                    ))}
                  </select>
                </div>
                <div style={{ display:'flex', gap: 12 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Proje</label>
                    <select value={taskForm.project_id} onChange={e => setTaskForm({...taskForm, project_id: e.target.value})}>
                      <option value="">Proje seçin...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Takım</label>
                    <select value={taskForm.team_id} onChange={e => setTaskForm({...taskForm, team_id: e.target.value})}>
                      <option value="">Takım seçin...</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display:'flex', gap: 12 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Başlangıç Tarihi</label>
                    <input type="date" value={taskForm.start_date} onChange={e => setTaskForm({...taskForm, start_date: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Son Tarih (Deadline) *</label>
                    <input type="date" value={taskForm.due_date} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Öncelik</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value})}>
                    <option value="dusuk">🟢 Düşük</option>
                    <option value="orta">🟡 Orta</option>
                    <option value="yuksek">🔴 Yüksek</option>
                    <option value="kritik">🟣 Kritik</option>
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setTaskModal({ open:false, editing:null })}>İptal</button>
                  <button type="submit" className="primary-button">{taskModal.editing ? 'Güncelle' : 'Görevi Ata'}</button>
                </div>
              </form>

              {/* Düzenleme modunda etiketler + ilişkiler + dosyalar + zaman çizelgesi */}
              {taskModal.editing && (
                <div style={{ padding: '0 24px 20px 24px' }}>
                  <TaskTagEditor
                    taskId={taskModal.editing.id}
                    currentTags={taskModal.editing.tags || []}
                    onChange={() => fetchTasks()}
                  />
                  <TaskRelations task={taskModal.editing} currentUserId={user.id} allTasks={tasks} />
                  <TaskAttachments taskId={taskModal.editing.id} currentUserId={user.id} />
                  <TaskTimeline taskId={taskModal.editing.id} currentUserId={user.id} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GÖREV RET MODAL ── */}
        {taskRejectModal.open && (
          <div className="modal-overlay" onClick={() => setTaskRejectModal({ open:false, task:null, reason:'' })}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Görevi Reddet</h2>
                <button className="modal-close" onClick={() => setTaskRejectModal({ open:false, task:null, reason:'' })}>×</button>
              </div>
              <form className="modal-form" onSubmit={async e => { e.preventDefault(); await handleTaskApproval(taskRejectModal.task.id, 'reddedildi', taskRejectModal.reason); setTaskRejectModal({ open:false, task:null, reason:'' }) }}>
                <div className="form-group">
                  <label>Red Nedeni *</label>
                  <textarea className="textarea" rows={3} value={taskRejectModal.reason} onChange={e => setTaskRejectModal({...taskRejectModal, reason: e.target.value})} placeholder="Neden reddedildi?" required />
                </div>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setTaskRejectModal({ open:false, task:null, reason:'' })}>İptal</button>
                  <button type="submit" className="primary-button" style={{ background: '#ef4444' }}>Reddet</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── EK SÜRE İNCELEME MODAL ── */}
        {extensionReviewModal.open && extensionReviewModal.task && (
          <div className="modal-overlay" onClick={() => setExtensionReviewModal({ open:false, task:null })}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>⏳ Ek Süre Talebi</h2>
                <button className="modal-close" onClick={() => setExtensionReviewModal({ open:false, task:null })}>×</button>
              </div>
              <div className="modal-form">
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{extensionReviewModal.task.title}</div>
                  <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>👤 {extensionReviewModal.task.assignee?.first_name} {extensionReviewModal.task.assignee?.last_name}</div>
                  <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>📅 Mevcut Deadline: <strong>{fmtDate(extensionReviewModal.task.due_date)}</strong></div>
                  <div style={{ fontSize: 14, color: '#6366f1', fontWeight: 600, marginBottom: 4 }}>➕ Talep edilen ek süre: <strong>{extensionReviewModal.task.extension_days} gün</strong></div>
                  <div style={{ fontSize: 14, color: '#374151', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <strong>Gerekçe:</strong> {extensionReviewModal.task.extension_reason}
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="ghost-button" onClick={() => setExtensionReviewModal({ open:false, task:null })}>Kapat</button>
                  <button className="ghost-button" style={{ color: '#ef4444', border: '1px solid #ef4444' }}
                    onClick={() => handleExtensionReview(extensionReviewModal.task.id, 'reddedildi')}>❌ Reddet</button>
                  <button className="primary-button"
                    onClick={() => handleExtensionReview(extensionReviewModal.task.id, 'onaylandi')}>✅ Onayla</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAKIM MODAL ── */}
        {teamModal.open && (
          <div className="modal-overlay" onClick={() => setTeamModal({ open:false, editing:null })}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{teamModal.editing ? 'Takım Düzenle' : 'Yeni Takım Oluştur'}</h2>
                <button className="modal-close" onClick={() => setTeamModal({ open:false, editing:null })}>×</button>
              </div>
              <form className="modal-form" onSubmit={handleSaveTeam}>
                <div className="form-group">
                  <label>Takım Adı *</label>
                  <input type="text" value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} required placeholder="Takım adı" />
                </div>
                <div className="form-group">
                  <label>Açıklama</label>
                  <textarea className="textarea" rows={2} value={teamForm.description} onChange={e => setTeamForm({...teamForm, description: e.target.value})} placeholder="Opsiyonel" />
                </div>
                <div className="form-group">
                  <label>Takım Yöneticisi</label>
                  <select value={teamForm.manager_id} onChange={e => setTeamForm({...teamForm, manager_id: e.target.value})}>
                    <option value="">Seçin...</option>
                    {users.filter(u => u.is_active && (u.user_type === 'manager' || u.user_type === 'admin')).map(u => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setTeamModal({ open:false, editing:null })}>İptal</button>
                  <button type="submit" className="primary-button">{teamModal.editing ? 'Güncelle' : 'Oluştur'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── PROJE MODAL ── */}
        {projectModal.open && (
          <div className="modal-overlay" onClick={() => setProjectModal({ open:false, editing:null })}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{projectModal.editing ? 'Proje Düzenle' : 'Yeni Proje Oluştur'}</h2>
                <button className="modal-close" onClick={() => setProjectModal({ open:false, editing:null })}>×</button>
              </div>
              <form className="modal-form" onSubmit={handleSaveProject}>
                <div className="form-group">
                  <label>Proje Adı *</label>
                  <input type="text" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} required placeholder="Proje adı" />
                </div>
                <div className="form-group">
                  <label>Açıklama</label>
                  <textarea className="textarea" rows={2} value={projectForm.description} onChange={e => setProjectForm({...projectForm, description: e.target.value})} placeholder="Kısa açıklama" />
                </div>
                <div style={{ display:'flex', gap: 12 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Başlangıç</label>
                    <input type="date" value={projectForm.start_date} onChange={e => setProjectForm({...projectForm, start_date: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Bitiş</label>
                    <input type="date" value={projectForm.end_date} onChange={e => setProjectForm({...projectForm, end_date: e.target.value})} />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setProjectModal({ open:false, editing:null })}>İptal</button>
                  <button type="submit" className="primary-button">{projectModal.editing ? 'Güncelle' : 'Oluştur'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeSection === 'timesheet-settings' && isAdmin && (
          <section className="table-card">
            <div className="table-toolbar">
              <div className="toolbar-left">
                <p className="page-kicker">Timesheet seçeneklerini yönetin</p>
                <h2 className="page-title" style={{ fontSize: '20px', margin: 0 }}>Timesheet Ayarları</h2>
              </div>
            </div>

            {settingsLoading ? (
              <div className="loading-state">Ayarlar yükleniyor...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Projeler */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Projeler</h3>
                    <button
                      className="primary-button"
                      onClick={() => handleOpenSettingsModal('project')}
                    >
                      + Proje Ekle
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="user-table">
                      <thead>
                        <tr>
                          <th>Proje Adı</th>
                          <th>Durum</th>
                          <th>Sıra</th>
                          <th>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSettingsByType('project').length === 0 ? (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                              Henüz proje eklenmemiş
                            </td>
                          </tr>
                        ) : (
                          getSettingsByType('project').map((s) => (
                            <tr key={s.id}>
                              <td>{s.value}</td>
                              <td>
                                <span className={`pill pill-status ${s.is_active ? 'pill-success' : 'pill-muted'}`}>
                                  {s.is_active ? 'Aktif' : 'Pasif'}
                                </span>
                              </td>
                              <td>{s.display_order}</td>
                              <td className="actions-cell">
                                <button
                                  className="icon-button"
                                  onClick={() => handleOpenSettingsModal('project', s)}
                                  title="Düzenle"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="icon-button danger"
                                  onClick={() => handleDeleteSetting(s.id)}
                                  title="Sil"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Aktivite Tipleri */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Aktivite Tipleri</h3>
                    <button
                      className="primary-button"
                      onClick={() => handleOpenSettingsModal('activity_type')}
                    >
                      + Aktivite Tipi Ekle
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="user-table">
                      <thead>
                        <tr>
                          <th>Aktivite Tipi</th>
                          <th>Durum</th>
                          <th>Sıra</th>
                          <th>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSettingsByType('activity_type').length === 0 ? (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                              Henüz aktivite tipi eklenmemiş
                            </td>
                          </tr>
                        ) : (
                          getSettingsByType('activity_type').map((s) => (
                            <tr key={s.id}>
                              <td>{s.value}</td>
                              <td>
                                <span className={`pill pill-status ${s.is_active ? 'pill-success' : 'pill-muted'}`}>
                                  {s.is_active ? 'Aktif' : 'Pasif'}
                                </span>
                              </td>
                              <td>{s.display_order}</td>
                              <td className="actions-cell">
                                <button
                                  className="icon-button"
                                  onClick={() => handleOpenSettingsModal('activity_type', s)}
                                  title="Düzenle"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="icon-button danger"
                                  onClick={() => handleDeleteSetting(s.id)}
                                  title="Sil"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Çalışma Şekilleri */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Çalışma Şekilleri</h3>
                    <button
                      className="primary-button"
                      onClick={() => handleOpenSettingsModal('work_mode')}
                    >
                      + Çalışma Şekli Ekle
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="user-table">
                      <thead>
                        <tr>
                          <th>Çalışma Şekli</th>
                          <th>Durum</th>
                          <th>Sıra</th>
                          <th>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSettingsByType('work_mode').length === 0 ? (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                              Henüz çalışma şekli eklenmemiş
                            </td>
                          </tr>
                        ) : (
                          getSettingsByType('work_mode').map((s) => (
                            <tr key={s.id}>
                              <td>{s.value}</td>
                              <td>
                                <span className={`pill pill-status ${s.is_active ? 'pill-success' : 'pill-muted'}`}>
                                  {s.is_active ? 'Aktif' : 'Pasif'}
                                </span>
                              </td>
                              <td>{s.display_order}</td>
                              <td className="actions-cell">
                                <button
                                  className="icon-button"
                                  onClick={() => handleOpenSettingsModal('work_mode', s)}
                                  title="Düzenle"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="icon-button danger"
                                  onClick={() => handleDeleteSetting(s.id)}
                                  title="Sil"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              {error && (
                <div className="error-message">{error}</div>
              )}
              
              <div className="form-group">
                <label>Ad *</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Soyad *</label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>E-posta *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Şifre {editingUser ? '(Boş bırakırsanız değişmez)' : '*'}</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required={!editingUser}
                />
              </div>

              <div className="form-group">
                <label>Telefon</label>
                <input
                  type="text"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Rol *</label>
                <select
                  name="user_type"
                  value={formData.user_type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="user">Kullanıcı</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={handleCloseModal}>
                  İptal
                </button>
                <button type="submit" className="primary-button">
                  {editingUser ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="modal-overlay" onClick={() => setRejectModal({ open: false, tsId: null, reason: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Red Nedeni</h2>
              <button className="modal-close" onClick={() => setRejectModal({ open: false, tsId: null, reason: '' })}>×</button>
            </div>
            <form
              className="modal-form"
              onSubmit={async (e) => {
                e.preventDefault()
                await handleTimesheetStatus(rejectModal.tsId, 'Reddedildi', rejectModal.reason)
                setRejectModal({ open: false, tsId: null, reason: '' })
              }}
            >
              <div className="form-group">
                <label>Red Nedeni *</label>
                <input
                  type="text"
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                  required
                  placeholder="Neden yazın"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setRejectModal({ open: false, tsId: null, reason: '' })}
                >
                  İptal
                </button>
                <button type="submit" className="primary-button">
                  Gönder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timesheet Settings Modal */}
      {settingsModal.open && (
        <div className="modal-overlay" onClick={handleCloseSettingsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {settingsModal.editing ? 'Ayar Düzenle' : 'Yeni Ayar Ekle'} - {
                  settingsModal.settingType === 'project' ? 'Proje' :
                  settingsModal.settingType === 'activity_type' ? 'Aktivite Tipi' :
                  'Çalışma Şekli'
                }
              </h2>
              <button className="modal-close" onClick={handleCloseSettingsModal}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleSaveSetting}>
              {settingsError && (
                <div className="error-message" style={{ marginBottom: '16px' }}>{settingsError}</div>
              )}
              {settingsSuccess && (
                <div className="error-message" style={{ background: '#ecfdf3', borderColor: '#86efac', color: '#16a34a', marginBottom: '16px' }}>{settingsSuccess}</div>
              )}
              <div className="form-group">
                <label>
                  {settingsModal.settingType === 'project' ? 'Proje Adı' :
                   settingsModal.settingType === 'activity_type' ? 'Aktivite Tipi' :
                   'Çalışma Şekli'} *
                </label>
                <input
                  type="text"
                  value={settingFormData.value}
                  onChange={(e) => {
                    setSettingFormData({ ...settingFormData, value: e.target.value })
                    setSettingsError('')
                  }}
                  required
                  placeholder="Ad girin"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Sıra</label>
                <input
                  type="number"
                  min="0"
                  value={settingFormData.display_order}
                  onChange={(e) => setSettingFormData({ ...settingFormData, display_order: parseInt(e.target.value) || 0 })}
                />
                <small style={{ color: '#666', fontSize: '12px' }}>Listeleme sırası (düşük sayı önce gösterilir)</small>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={settingFormData.is_active}
                    onChange={(e) => setSettingFormData({ ...settingFormData, is_active: e.target.checked })}
                  />
                  Aktif
                </label>
                <small style={{ color: '#666', fontSize: '12px' }}>Pasif ayarlar timesheet formunda görünmez</small>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={handleCloseSettingsModal}>
                  İptal
                </button>
                <button type="submit" className="primary-button">
                  {settingsModal.editing ? 'Güncelle' : 'Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard

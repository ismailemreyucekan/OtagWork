import { useEffect, useState, useCallback } from 'react'
import './OverviewDashboard.css'
import Icon from './Icon'

const API_URL = 'http://localhost:5000/api'

/**
 * OverviewDashboard — uygulamanın karşılama ekranı.
 *
 * Props:
 *   user: { id, first_name, last_name, user_type }
 *   mode: 'user' | 'manager' | 'admin'
 *   onNavigate(target)       : tab değişim sinyali
 *   onTaskOpen(task)         : görev detay modalını açar
 *   onAddTimesheet(date)     : timesheet ekleme modalını açar (yalnız user mode'da kullanılır)
 *
 * Veri kaynakları (paralel fetch):
 *   - /tasks?user_id=X            → bireysel görevler
 *   - /tasks?team_tasks_for=X     → takım görevleri (manager/admin)
 *   - /leaves/balance/:id         → kullanıcı izin bakiyesi
 *   - /leaves?manager_id=X        → bekleyen izin (manager)
 *   - /timesheets?user_id=X&start_date=…&end_date=…  → hafta içi kayıtlar
 */
const OverviewDashboard = ({ user, mode = 'user', onNavigate, onTaskOpen, onAddTimesheet }) => {
  const [loading, setLoading] = useState(true)
  const [myTasks, setMyTasks] = useState([])
  const [teamTasks, setTeamTasks] = useState([])
  const [balance, setBalance] = useState(null)
  const [pendingLeaves, setPendingLeaves] = useState([])
  const [weekTimesheets, setWeekTimesheets] = useState([])

  const isManagerOrAdmin = mode === 'manager' || mode === 'admin'

  // Saat dilimine göre selamlama
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6)  return 'İyi geceler'
    if (h < 12) return 'Günaydın'
    if (h < 18) return 'İyi günler'
    return 'İyi akşamlar'
  })()

  // Hafta sınırları (Pazartesi başlangıç) — fetch öncesinde hesapla
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const startOfWeek = (() => {
    const d = new Date(today)
    const offset = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - offset)
    d.setHours(0, 0, 0, 0)
    return d
  })()
  const endOfWeek = (() => {
    const d = new Date(startOfWeek)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  })()
  const weekStartKey = startOfWeek.toISOString().slice(0, 10)
  const weekEndKey   = endOfWeek.toISOString().slice(0, 10)

  // ── Tek hamlede tüm veri ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    const requests = [
      fetch(`${API_URL}/tasks?user_id=${user.id}`).then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch(`${API_URL}/leaves/balance/${user.id}`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/timesheets?user_id=${user.id}&start_date=${weekStartKey}&end_date=${weekEndKey}&include_drafts=true`)
        .then(r => r.json()).catch(() => ({ timesheets: [] })),
    ]
    if (isManagerOrAdmin) {
      requests.push(
        fetch(`${API_URL}/tasks?team_tasks_for=${user.id}`).then(r => r.json()).catch(() => ({ tasks: [] }))
      )
      requests.push(
        fetch(`${API_URL}/leaves?manager_id=${user.id}`).then(r => r.json()).catch(() => ({ leaves: [] }))
      )
    }
    try {
      const results = await Promise.all(requests)
      setMyTasks(results[0]?.tasks || results[0] || [])
      setBalance(results[1] && results[1].success !== false ? results[1] : null)
      setWeekTimesheets(results[2]?.timesheets || [])
      if (isManagerOrAdmin) {
        setTeamTasks(results[3]?.tasks || results[3] || [])
        setPendingLeaves((results[4]?.leaves || []).filter(l => l.status === 'onay_bekliyor'))
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isManagerOrAdmin])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Türetilmiş metrikler ──
  const isOverdue = (t) => t.due_date && new Date(t.due_date) < today && t.status !== 'tamamlandi' && t.status !== 'iptal'
  const isActive  = (t) => t.status === 'beklemede' || t.status === 'devam_ediyor'

  const activeCount     = myTasks.filter(isActive).length
  const overdueCount    = myTasks.filter(isOverdue).length
  const weekCompletedCount = myTasks.filter(t =>
    t.status === 'tamamlandi' && t.completed_at && new Date(t.completed_at) >= startOfWeek
  ).length
  // Admin'de tüm görevlerin bekleyen onayı + tüm ek süre talepleri + izin
  const pendingApprovals = isManagerOrAdmin
    ? (
        teamTasks.filter(t => t.approval_status === 'onay_bekliyor').length
        + teamTasks.filter(t => t.extension_requested && t.extension_status === 'onay_bekliyor').length
        + pendingLeaves.length
      )
    : myTasks.filter(t => t.approval_status === 'onay_bekliyor').length

  // ── Bugün AKTİF görevler ──
  // start_date ≤ bugün ≤ due_date AND status ∈ {beklemede, devam_ediyor}
  // start_date yoksa due_date günü tek-günlük aktif kabul edilir.
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(today); todayEnd.setHours(23, 59, 59, 999)

  const todayTasks = myTasks
    .filter(t => {
      if (t.status !== 'beklemede' && t.status !== 'devam_ediyor') return false
      if (!t.due_date) return false
      const due = new Date(t.due_date); due.setHours(23, 59, 59, 999)
      const start = t.start_date ? new Date(t.start_date) : new Date(t.due_date)
      start.setHours(0, 0, 0, 0)
      return start <= todayEnd && due >= todayStart
    })
    .sort((a, b) => {
      const order = { kritik: 0, yuksek: 1, orta: 2, dusuk: 3 }
      const p = (order[a.priority] ?? 4) - (order[b.priority] ?? 4)
      if (p !== 0) return p
      // Eş öncelikte daha yakın deadline önce
      return new Date(a.due_date) - new Date(b.due_date)
    })

  // ── Yaklaşan görevler (1-7 gün) — bugün dışındakiler ──
  const upcomingTasks = myTasks
    .filter(t => {
      if (!t.due_date || t.status === 'tamamlandi' || t.status === 'iptal') return false
      const due = new Date(t.due_date)
      const daysFromToday = Math.floor((due - today) / 86400000)
      return daysFromToday >= 1 && daysFromToday <= 7
    })
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))

  // ── Bugünkü timesheet kayıtları ──
  const todayTimesheets = weekTimesheets.filter(ts => ts.work_date && ts.work_date.startsWith(todayKey))
  const todayHours = todayTimesheets.reduce((sum, ts) => sum + (Number(ts.hours) || 0), 0)

  // ── Haftalık iş ilerleme (tamamlanan / toplam aktif+tamamlanan) ──
  const weekActiveTasks = myTasks.filter(t => {
    if (!t.due_date) return false
    const due = new Date(t.due_date)
    return due >= startOfWeek && due <= endOfWeek
  })
  const weekCompletedInRange = weekActiveTasks.filter(t => t.status === 'tamamlandi').length
  const weekProgressPct = weekActiveTasks.length > 0
    ? Math.round((weekCompletedInRange / weekActiveTasks.length) * 100)
    : 0

  // ── Saat dağılımı (activity_type bazında, bu hafta) ──
  const activityBreakdown = (() => {
    const map = {}
    weekTimesheets.forEach(ts => {
      const key = ts.activity_type || 'Diğer'
      map[key] = (map[key] || 0) + (Number(ts.hours) || 0)
    })
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    return Object.entries(map)
      .map(([label, hours]) => ({ label, hours, pct: total > 0 ? Math.round((hours / total) * 100) : 0 }))
      .sort((a, b) => b.hours - a.hours)
  })()
  const totalWeekHours = activityBreakdown.reduce((s, a) => s + a.hours, 0)

  // Aktivite tipine göre paletten renk
  const activityPalette = ['#7FA9C4', '#E0A458', '#86B8A1', '#9B8FC7', '#E06666', '#6BA888', '#94A4B4', '#B14545']

  const priorityColor = (p) => ({ dusuk: '#86B8A1', orta: '#E0A458', yuksek: '#E06666', kritik: '#B14545' }[p] || '#8A99A8')
  const priorityLabel = (p) => ({ dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', kritik: 'Kritik' }[p] || p)

  // ── Bekleyen onay alt-kırılımı (manager/admin için kart içeriği) ──
  const approvalBreakdown = isManagerOrAdmin ? [
    {
      key: 'task-approval',
      label: 'Görev onayı',
      icon: 'clipboard',
      count: teamTasks.filter(t => t.approval_status === 'onay_bekliyor').length,
      target: 'schema',
    },
    {
      key: 'task-extension',
      label: 'Ek süre talebi',
      icon: 'hourglass',
      count: teamTasks.filter(t => t.extension_requested && t.extension_status === 'onay_bekliyor').length,
      target: 'schema',
    },
    {
      key: 'leave-approval',
      label: 'İzin talebi',
      icon: 'beach',
      count: pendingLeaves.length,
      target: 'leaves',
    },
  ] : []

  // ── İzin bakiyesi yüzdesi ──
  const balancePct = balance && balance.annual_quota > 0
    ? Math.min(100, Math.round(((balance.approved_days || 0) / balance.annual_quota) * 100))
    : 0

  if (loading) {
    return <div className="overview-loading">Yükleniyor…</div>
  }

  return (
    <div className="overview-wrap">
      {/* Hoş geldin başlığı */}
      <header className="overview-hero">
        <div>
          <p className="overview-kicker">{greeting},</p>
          <h1 className="overview-title">{user.first_name} {user.last_name} 👋</h1>
        </div>
        <div className="overview-hero-date">
          <Icon name="calendar" size={14} />
          {today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </header>

      {/* ── 4 STAT KARTI ── */}
      <section className="overview-stats">
        <button className="ov-stat ov-stat--accent" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')}>
          <div className="ov-stat-icon"><Icon name="clipboard" size={20} /></div>
          <div className="ov-stat-body">
            <div className="ov-stat-label">Aktif görevim</div>
            <div className="ov-stat-value">{activeCount}</div>
          </div>
        </button>
        <button className="ov-stat ov-stat--success" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')}>
          <div className="ov-stat-icon"><Icon name="check_circle" size={20} /></div>
          <div className="ov-stat-body">
            <div className="ov-stat-label">Bu hafta tamamlanan</div>
            <div className="ov-stat-value">{weekCompletedCount}</div>
          </div>
        </button>
        <button className="ov-stat ov-stat--danger" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')}>
          <div className="ov-stat-icon"><Icon name="alert" size={20} /></div>
          <div className="ov-stat-body">
            <div className="ov-stat-label">Geciken görev</div>
            <div className="ov-stat-value">{overdueCount}</div>
          </div>
        </button>
        <button className="ov-stat ov-stat--warning" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')}>
          <div className="ov-stat-icon"><Icon name="hourglass" size={20} /></div>
          <div className="ov-stat-body">
            <div className="ov-stat-label">{isManagerOrAdmin ? 'Bekleyen onay' : 'Onay bekleyen'}</div>
            <div className="ov-stat-value">{pendingApprovals}</div>
          </div>
        </button>
      </section>

      {/* ── 2 SÜTUN: Bugünkü görevler | Bekleyen onaylar veya İzin ── */}
      <section className="overview-grid">
        {/* Bugün aktif görevler */}
        <div className="ov-card">
          <header className="ov-card-head">
            <h3 className="icon-stack"><Icon name="bolt" size={16} /> Bugün aktif görevler</h3>
            <div className="ov-card-head-right">
              <span className="ov-card-count">{todayTasks.length}</span>
              <button className="ov-card-link" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')} title="Tümünü gör">Tümü →</button>
            </div>
          </header>
          {todayTasks.length === 0 ? (
            <div className="ov-empty">
              <Icon name="check_circle" size={22} />
              <span>Bugün aktif görevin yok 🎉</span>
            </div>
          ) : (
            <ul className="ov-list">
              {todayTasks.slice(0, 5).map(t => {
                const pColor = priorityColor(t.priority)
                return (
                  <li key={t.id} className="ov-list-item" onClick={() => onTaskOpen?.(t)} style={{ borderLeftColor: pColor }}>
                    <div className="ov-list-item-title">{t.title}</div>
                    <div className="ov-list-item-meta">
                      <span className="ov-pill" style={{ background: pColor + '22', color: pColor }}>{priorityLabel(t.priority)}</span>
                      {t.project && <span className="ov-list-meta-text"><Icon name="folder" size={11} /> {t.project.name}</span>}
                      <span className="ov-list-meta-text"><Icon name="calendar" size={11} /> Bitiş: {new Date(t.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </li>
                )
              })}
              {todayTasks.length > 5 && (
                <li className="ov-list-more" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')}>
                  + {todayTasks.length - 5} görev daha gör →
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Sağ kolon — rol bazlı: manager → Bekleyen onaylar, user → Yaklaşan görevler */}
        {isManagerOrAdmin ? (
          <div className="ov-card">
            <header className="ov-card-head">
              <h3 className="icon-stack"><Icon name="bell" size={16} /> Bekleyen onaylar</h3>
              <div className="ov-card-head-right">
                <span className="ov-card-count">{pendingApprovals}</span>
                <button className="ov-card-link" onClick={() => onNavigate?.('schema')} title="Görev sayfasına git">Tümü →</button>
              </div>
            </header>
            {pendingApprovals === 0 ? (
              <div className="ov-empty">
                <Icon name="check" size={22} />
                <span>Onay bekleyen bir şey yok</span>
              </div>
            ) : (
              <ul className="ov-approval-list">
                {approvalBreakdown.map(item => (
                  <li
                    key={item.key}
                    className={`ov-approval-item ${item.count === 0 ? 'ov-approval-item--empty' : ''}`}
                    onClick={() => item.count > 0 && onNavigate?.(item.target)}
                  >
                    <span className="ov-approval-icon"><Icon name={item.icon} size={16} /></span>
                    <span className="ov-approval-label">{item.label}</span>
                    <span className="ov-approval-count">{item.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          /* User mode → Yaklaşan görevler bu satırın sağında */
          <div className="ov-card">
            <header className="ov-card-head">
              <h3 className="icon-stack"><Icon name="calendar_days" size={16} /> Yaklaşan görevler</h3>
              <div className="ov-card-head-right">
                <span className="ov-card-count">{upcomingTasks.length}</span>
                <button className="ov-card-link" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')} title="Tümünü gör">Tümü →</button>
              </div>
            </header>
            {upcomingTasks.length === 0 ? (
              <div className="ov-empty">
                <Icon name="check_circle" size={22} />
                <span>Önümüzdeki 7 günde görev yok</span>
              </div>
            ) : (
              <ul className="ov-list">
                {upcomingTasks.slice(0, 5).map(t => {
                  const pColor = priorityColor(t.priority)
                  const due = new Date(t.due_date)
                  const days = Math.floor((due - today) / 86400000)
                  const dayLabel = days === 1 ? 'Yarın' : `${days} gün`
                  return (
                    <li key={t.id} className="ov-list-item" onClick={() => onTaskOpen?.(t)} style={{ borderLeftColor: pColor }}>
                      <div className="ov-list-item-title">{t.title}</div>
                      <div className="ov-list-item-meta">
                        <span className="ov-pill" style={{ background: pColor + '22', color: pColor }}>{priorityLabel(t.priority)}</span>
                        <span className="ov-list-meta-text"><Icon name="calendar" size={11} /> {dayLabel} ({due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})</span>
                      </div>
                    </li>
                  )
                })}
                {upcomingTasks.length > 5 && (
                  <li className="ov-list-more" onClick={() => onNavigate?.('my-tasks')}>
                    + {upcomingTasks.length - 5} daha →
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── 2. SATIR: Sol = (user → Bugünkü timesheet | manager → Yaklaşan görevler) · Sağ = İzin bakiyem ── */}
      <section className="overview-grid">
        {/* SOL: rol bazlı */}
        {mode === 'user' ? (
          <div className="ov-card">
            <header className="ov-card-head">
              <h3 className="icon-stack"><Icon name="clock" size={16} /> Bugünkü timesheet</h3>
              <div className="ov-card-head-right">
                <span className="ov-card-count">{todayHours} sa</span>
                <button className="ov-card-link" onClick={() => onNavigate?.('timesheet')} title="Timesheet sayfasına git">Tümü →</button>
              </div>
            </header>
            {todayTimesheets.length === 0 ? (
              <div className="ov-ts-empty">
                <Icon name="alert" size={20} />
                <p>Bugün için henüz kayıt eklemedin.</p>
                <button className="ov-ts-add primary-button icon-stack" onClick={() => onAddTimesheet?.(new Date())}>
                  <Icon name="plus" size={14} /> Kayıt Ekle
                </button>
              </div>
            ) : (
              <>
                <ul className="ov-ts-list">
                  {todayTimesheets.slice(0, 4).map(ts => (
                    <li key={ts.id} className="ov-ts-item">
                      <span className="ov-ts-hours">{ts.hours}h</span>
                      <div className="ov-ts-body">
                        <div className="ov-ts-project">{ts.project}</div>
                        <div className="ov-ts-meta">
                          {ts.activity_type} · {ts.work_mode}
                          {ts.status && ts.status !== 'Onaylandi' && (
                            <span className="ov-ts-status">{ts.status}</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <button className="ov-ts-add-secondary icon-stack" onClick={() => onAddTimesheet?.(new Date())}>
                  <Icon name="plus" size={14} /> Yeni kayıt ekle
                </button>
              </>
            )}
          </div>
        ) : (
          /* Manager/Admin → bu satırda Yaklaşan görevler (sağ üstte zaten Bekleyen onaylar var) */
          <div className="ov-card">
            <header className="ov-card-head">
              <h3 className="icon-stack"><Icon name="calendar_days" size={16} /> Yaklaşan görevler</h3>
              <div className="ov-card-head-right">
                <span className="ov-card-count">{upcomingTasks.length}</span>
                <button className="ov-card-link" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')} title="Tümünü gör">Tümü →</button>
              </div>
            </header>
            {upcomingTasks.length === 0 ? (
              <div className="ov-empty">
                <Icon name="check_circle" size={22} />
                <span>Önümüzdeki 7 günde görev yok</span>
              </div>
            ) : (
              <ul className="ov-list">
                {upcomingTasks.slice(0, 5).map(t => {
                  const pColor = priorityColor(t.priority)
                  const due = new Date(t.due_date)
                  const days = Math.floor((due - today) / 86400000)
                  const dayLabel = days === 1 ? 'Yarın' : `${days} gün`
                  return (
                    <li key={t.id} className="ov-list-item" onClick={() => onTaskOpen?.(t)} style={{ borderLeftColor: pColor }}>
                      <div className="ov-list-item-title">{t.title}</div>
                      <div className="ov-list-item-meta">
                        <span className="ov-pill" style={{ background: pColor + '22', color: pColor }}>{priorityLabel(t.priority)}</span>
                        <span className="ov-list-meta-text"><Icon name="calendar" size={11} /> {dayLabel} ({due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})</span>
                      </div>
                    </li>
                  )
                })}
                {upcomingTasks.length > 5 && (
                  <li className="ov-list-more" onClick={() => onNavigate?.('schema')}>
                    + {upcomingTasks.length - 5} daha →
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* SAĞ: İzin bakiyem — her rol için aynı yerde */}
        <div className="ov-card">
          <header className="ov-card-head">
            <h3 className="icon-stack"><Icon name="beach" size={16} /> İzin bakiyem</h3>
            <button className="ov-card-link" onClick={() => onNavigate?.('leaves')}>Detay →</button>
          </header>
          {!balance ? (
            <div className="ov-empty">
              <span>Bakiye yüklenemedi</span>
            </div>
          ) : (
            <div className="ov-balance">
              <div className="ov-balance-row">
                <span>Yıllık hak</span>
                <strong>{balance.annual_quota} gün</strong>
              </div>
              <div className="ov-balance-row">
                <span>Kullanılan</span>
                <strong className="ov-balance-used">{balance.approved_days || 0} gün</strong>
              </div>
              <div className="ov-balance-row">
                <span>Beklemede</span>
                <strong className="ov-balance-pending">{balance.pending_days || 0} gün</strong>
              </div>
              <div className="ov-balance-row ov-balance-row--big">
                <span>Kalan</span>
                <strong className="ov-balance-remaining">{balance.remaining} gün</strong>
              </div>
              <div className="ov-progress" title={`${balancePct}% kullanıldı`}>
                <div className="ov-progress-fill" style={{ width: `${balancePct}%` }} />
              </div>
              <p className="ov-balance-hint">{balancePct}% kullanıldı</p>
            </div>
          )}
        </div>
      </section>

      {/* ── 3. SATIR: Haftalık ilerleme + Saat dağılımı ── */}
      <section className="overview-grid">
        {/* Haftalık iş tamamlama */}
        <div className="ov-card">
          <header className="ov-card-head">
            <h3 className="icon-stack"><Icon name="chart" size={16} /> Bu haftaki ilerleme</h3>
            <div className="ov-card-head-right">
              <span className="ov-card-count">{weekProgressPct}%</span>
              <button className="ov-card-link" onClick={() => onNavigate?.(isManagerOrAdmin ? 'schema' : 'my-tasks')} title="Görevlerime git">Tümü →</button>
            </div>
          </header>
          {weekActiveTasks.length === 0 ? (
            <div className="ov-empty">
              <Icon name="calendar" size={22} />
              <span>Bu hafta deadline'lı görev yok</span>
            </div>
          ) : (
            <div className="ov-week-progress">
              <div className="ov-week-stats">
                <div className="ov-week-stat">
                  <span className="ov-week-stat-label">Tamamlanan</span>
                  <strong className="ov-week-stat-value" style={{ color: 'var(--success)' }}>{weekCompletedInRange}</strong>
                </div>
                <div className="ov-week-stat">
                  <span className="ov-week-stat-label">Toplam</span>
                  <strong className="ov-week-stat-value">{weekActiveTasks.length}</strong>
                </div>
                <div className="ov-week-stat">
                  <span className="ov-week-stat-label">Kalan</span>
                  <strong className="ov-week-stat-value" style={{ color: 'var(--warning)' }}>{weekActiveTasks.length - weekCompletedInRange}</strong>
                </div>
              </div>
              <div className="ov-week-bar-track">
                <div className="ov-week-bar-fill" style={{ width: `${weekProgressPct}%` }} />
              </div>
              <p className="ov-week-hint">
                {weekProgressPct === 100
                  ? '🎯 Tüm görevler tamamlandı!'
                  : weekProgressPct >= 70
                  ? 'İyi gidiyorsun, az kaldı.'
                  : weekProgressPct >= 30
                  ? 'Yarı yoldasın, devam et.'
                  : 'Haftaya yeni başlanıyor.'}
              </p>
            </div>
          )}
        </div>

        {/* Saat dağılımı (activity_type bazında) */}
        <div className="ov-card">
          <header className="ov-card-head">
            <h3 className="icon-stack"><Icon name="clock" size={16} /> Bu hafta saat dağılımı</h3>
            <div className="ov-card-head-right">
              <span className="ov-card-count">{totalWeekHours} sa</span>
              <button className="ov-card-link" onClick={() => onNavigate?.('timesheet')} title="Timesheet sayfasına git">Tümü →</button>
            </div>
          </header>
          {activityBreakdown.length === 0 ? (
            <div className="ov-empty">
              <Icon name="clock" size={22} />
              <span>Bu hafta henüz timesheet yok</span>
            </div>
          ) : (
            <div className="ov-hours-chart">
              {/* Stacked bar */}
              <div className="ov-hours-stack">
                {activityBreakdown.map((seg, i) => (
                  <div
                    key={seg.label}
                    className="ov-hours-seg"
                    style={{ width: `${seg.pct}%`, background: activityPalette[i % activityPalette.length] }}
                    title={`${seg.label}: ${seg.hours} sa (${seg.pct}%)`}
                  />
                ))}
              </div>
              {/* Legend */}
              <ul className="ov-hours-legend">
                {activityBreakdown.map((seg, i) => (
                  <li key={seg.label}>
                    <span className="ov-hours-dot" style={{ background: activityPalette[i % activityPalette.length] }} />
                    <span className="ov-hours-label">{seg.label}</span>
                    <span className="ov-hours-value">{seg.hours} sa</span>
                    <span className="ov-hours-pct">{seg.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default OverviewDashboard

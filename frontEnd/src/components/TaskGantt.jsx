import { useMemo, useState } from 'react'
import './TaskGantt.css'

const priorityColor = (p) => ({ dusuk: '#10b981', orta: '#f59e0b', yuksek: '#ef4444', kritik: '#7c3aed' }[p] || '#6b7280')
const statusColor = (s) => ({ beklemede: '#94a3b8', devam_ediyor: '#3b82f6', tamamlandi: '#10b981', iptal: '#ef4444' }[s] || '#94a3b8')

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const fmtDay = (d) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })

const TaskGantt = ({ tasks, projects = [], onTaskClick }) => {
  const [projectFilter, setProjectFilter] = useState('')
  const [rangeDays, setRangeDays] = useState(30) // pencere boyutu (gün)

  // Filtrele: tarih bilgisi olmayanlar gösterilmez
  const filtered = useMemo(() => {
    return tasks
      .filter(t => t.due_date)
      .filter(t => projectFilter === '' || String(t.project_id) === String(projectFilter))
  }, [tasks, projectFilter])

  // Zaman aralığı: min(start) → max(due)
  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (filtered.length === 0) {
      const today = startOfDay(new Date())
      return { rangeStart: today, rangeEnd: new Date(today.getTime() + rangeDays * DAY_MS), totalDays: rangeDays }
    }
    let minD = null
    let maxD = null
    filtered.forEach(t => {
      const s = startOfDay(t.start_date || t.due_date)
      const e = startOfDay(t.due_date)
      if (!minD || s < minD) minD = s
      if (!maxD || e > maxD) maxD = e
    })
    // bugünü de kapsa
    const today = startOfDay(new Date())
    if (today < minD) minD = today
    if (today > maxD) maxD = today
    // küçük tampon
    const start = new Date(minD.getTime() - 2 * DAY_MS)
    const end = new Date(maxD.getTime() + 3 * DAY_MS)
    const days = Math.max(7, Math.round((end - start) / DAY_MS))
    return { rangeStart: start, rangeEnd: end, totalDays: days }
  }, [filtered, rangeDays])

  // Sütun başlıkları: her gün için bir hücre
  const dayList = useMemo(() => {
    const arr = []
    for (let i = 0; i < totalDays; i++) {
      arr.push(new Date(rangeStart.getTime() + i * DAY_MS))
    }
    return arr
  }, [rangeStart, totalDays])

  const todayOffset = useMemo(() => {
    const today = startOfDay(new Date())
    const diff = (today - rangeStart) / DAY_MS
    if (diff < 0 || diff > totalDays) return null
    return diff
  }, [rangeStart, totalDays])

  return (
    <div className="gantt-wrap">
      <div className="gantt-toolbar">
        <div className="gantt-filter">
          <label>Proje:</label>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="">Tümü</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="gantt-legend">
          <span className="gantt-legend-item"><i style={{ background: priorityColor('kritik') }} /> Kritik</span>
          <span className="gantt-legend-item"><i style={{ background: priorityColor('yuksek') }} /> Yüksek</span>
          <span className="gantt-legend-item"><i style={{ background: priorityColor('orta') }} /> Orta</span>
          <span className="gantt-legend-item"><i style={{ background: priorityColor('dusuk') }} /> Düşük</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="gantt-empty">Tarihli görev yok.</div>
      ) : (
        <div className="gantt-grid">
          <div className="gantt-side">
            <div className="gantt-head">Görev</div>
            {filtered.map(t => (
              <div key={t.id} className="gantt-row-label" onClick={() => onTaskClick?.(t)}>
                <div className="gantt-row-title">{t.title}</div>
                <div className="gantt-row-sub">
                  {t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name}` : '—'}
                  {t.project ? ` · ${t.project.name}` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="gantt-canvas">
            <div className="gantt-days">
              {dayList.map((d, i) => {
                const isToday = startOfDay(d).getTime() === startOfDay(new Date()).getTime()
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div key={i} className={`gantt-day-col ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}>
                    <div className="gantt-day-head">{fmtDay(d)}</div>
                  </div>
                )
              })}
            </div>

            <div className="gantt-bars" style={{ height: `calc(${filtered.length} * var(--gantt-row-h))` }}>
              {todayOffset != null && (
                <div className="gantt-today-line" style={{ left: `calc(${todayOffset} * var(--gantt-cell-w) + var(--gantt-cell-w) / 2)` }} />
              )}
              {filtered.map((t, idx) => {
                const s = startOfDay(t.start_date || t.due_date)
                const e = startOfDay(t.due_date)
                const startOff = Math.max(0, (s - rangeStart) / DAY_MS)
                const endOff = Math.max(startOff + 1, (e - rangeStart) / DAY_MS + 1)
                const widthDays = endOff - startOff
                const color = priorityColor(t.priority)
                const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'tamamlandi'
                return (
                  <div
                    key={t.id}
                    className={`gantt-bar ${overdue ? 'overdue' : ''}`}
                    onClick={() => onTaskClick?.(t)}
                    style={{
                      top: `calc(${idx} * var(--gantt-row-h) + 6px)`,
                      left: `calc(${startOff} * var(--gantt-cell-w))`,
                      width: `calc(${widthDays} * var(--gantt-cell-w) - 2px)`,
                      background: color + '33',
                      borderColor: color,
                    }}
                    title={`${t.title} (${fmtDay(s)} → ${fmtDay(e)})`}
                  >
                    <span className="gantt-bar-label" style={{ color }}>{t.title}</span>
                    <span className="gantt-bar-status" style={{ background: statusColor(t.status) }} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskGantt

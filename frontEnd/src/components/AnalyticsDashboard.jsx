import { useEffect, useState, useCallback } from 'react'
import './AnalyticsDashboard.css'

const API_URL = 'http://localhost:5000/api'

const STATUS_LABEL = { beklemede: 'Beklemede', devam_ediyor: 'Devam Ediyor', tamamlandi: 'Tamamlandı', iptal: 'İptal' }
const STATUS_COLOR = { beklemede: '#94a3b8', devam_ediyor: '#3b82f6', tamamlandi: '#10b981', iptal: '#ef4444' }
const PRIO_LABEL = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek', kritik: 'Kritik' }
const PRIO_COLOR = { dusuk: '#10b981', orta: '#f59e0b', yuksek: '#ef4444', kritik: '#7c3aed' }

// ─── Yardımcı SVG bileşenleri ───────────────────────────────

const DonutChart = ({ data, size = 160, thickness = 30, title }) => {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div className="ad-empty">Veri yok</div>
  const cx = size / 2, cy = size / 2, r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="ad-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const portion = d.value / total
          const dash = portion * circ
          const seg = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
          offset += dash
          return seg
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="ad-donut-num">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="ad-donut-sub">toplam</text>
      </svg>
      <div className="ad-donut-legend">
        {data.map((d, i) => (
          <div key={i} className="ad-legend-row">
            <span className="ad-legend-dot" style={{ background: d.color }} />
            <span className="ad-legend-label">{d.label}</span>
            <span className="ad-legend-val">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const BarChart = ({ data, height = 180, color = '#FFD700', valueKey = 'value', labelKey = 'label' }) => {
  if (!data || data.length === 0) return <div className="ad-empty">Veri yok</div>
  const max = Math.max(1, ...data.map(d => d[valueKey] || 0))
  return (
    <div className="ad-bars" style={{ height }}>
      {data.map((d, i) => {
        const h = ((d[valueKey] || 0) / max) * (height - 30)
        return (
          <div key={i} className="ad-bar-col" title={`${d[labelKey]}: ${d[valueKey]}`}>
            <div className="ad-bar-val">{d[valueKey] || 0}</div>
            <div className="ad-bar" style={{ height: h, background: color }} />
            <div className="ad-bar-label">{d[labelKey]}</div>
          </div>
        )
      })}
    </div>
  )
}

const DualBarChart = ({ data, height = 220 }) => {
  // data: [{ name, total, completed, overdue }]
  if (!data || data.length === 0) return <div className="ad-empty">Veri yok</div>
  const max = Math.max(1, ...data.map(d => d.total || 0))
  return (
    <div className="ad-bars dual" style={{ height }}>
      {data.map((d, i) => {
        const totalH = (d.total / max) * (height - 50)
        const completedH = (d.completed / max) * (height - 50)
        const overdueH = (d.overdue / max) * (height - 50)
        return (
          <div key={i} className="ad-bar-col" title={`${d.name}: ${d.total} görev`}>
            <div className="ad-bar-val">{d.total}</div>
            <div className="ad-bar-group">
              <div className="ad-bar" style={{ height: totalH, background: '#3b82f622' }} />
              <div className="ad-bar" style={{ height: completedH, background: '#10b981' }} />
              <div className="ad-bar" style={{ height: overdueH, background: '#ef4444' }} />
            </div>
            <div className="ad-bar-label">{d.name.split(' ')[0]}</div>
          </div>
        )
      })}
    </div>
  )
}

const TrendChart = ({ data, height = 180 }) => {
  if (!data || data.length === 0) return <div className="ad-empty">Veri yok</div>
  const max = Math.max(1, ...data.map(d => Math.max(d.created || 0, d.completed || 0)))
  const w = 100 / (data.length - 1 || 1)
  const path = (key, color) => {
    const points = data.map((d, i) => `${i * w},${100 - ((d[key] || 0) / max) * 100}`).join(' ')
    return <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
  }
  return (
    <div className="ad-trend" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        {path('created', '#FFD700')}
        {path('completed', '#10b981')}
      </svg>
      <div className="ad-trend-legend">
        <span><i style={{ background: '#FFD700' }} /> Yeni</span>
        <span><i style={{ background: '#10b981' }} /> Tamamlanan</span>
      </div>
      <div className="ad-trend-axis">
        <span>{data[0].date.slice(5)}</span>
        <span>{data[Math.floor(data.length / 2)].date.slice(5)}</span>
        <span>{data[data.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}

// ─── Ana bileşen ─────────────────────────────────────────────

const AnalyticsDashboard = ({ user }) => {
  const [data, setData] = useState(null)
  const [capacity, setCapacity] = useState([])
  const [perf, setPerf] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const isManager = user.user_type === 'manager'
    const mq = isManager ? `?manager_id=${user.id}` : ''
    try {
      const [a, b, c] = await Promise.all([
        fetch(`${API_URL}/analytics/overview${mq}`).then(r => r.json()),
        fetch(`${API_URL}/analytics/team-capacity${mq}`).then(r => r.json()),
        fetch(`${API_URL}/analytics/performance${mq}`).then(r => r.json()),
      ])
      if (a.success) setData(a)
      if (b.success) setCapacity(b.days || [])
      if (c.success) setPerf(c.rows || [])
    } catch (_) {}
    finally { setLoading(false) }
  }, [user.id, user.user_type])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="ad-loading">Analitik yükleniyor…</div>
  if (!data) return <div className="ad-loading">Veri alınamadı.</div>

  const statusData = Object.entries(data.by_status || {}).map(([k, v]) => ({
    label: STATUS_LABEL[k] || k, value: v, color: STATUS_COLOR[k] || '#94a3b8'
  }))

  const prioData = Object.entries(data.by_priority || {}).map(([k, v]) => ({
    label: PRIO_LABEL[k] || k, value: v, color: PRIO_COLOR[k] || '#94a3b8'
  }))

  const kpis = data.kpis || {}

  const isManager = user.user_type === 'manager'
  const mq = isManager ? `?manager_id=${user.id}` : ''

  return (
    <div className="ad-wrap">
      {/* Rapor indirme barı */}
      <div className="ad-reports">
        <span className="ad-reports-label">Raporlar:</span>
        <a className="ad-report-btn" href={`${API_URL}/reports/tasks.csv${mq}`} target="_blank" rel="noreferrer">📊 Görevler CSV</a>
        <a className="ad-report-btn" href={`${API_URL}/reports/tasks.pdf${mq}`} target="_blank" rel="noreferrer">📄 Görevler PDF</a>
        <a className="ad-report-btn" href={`${API_URL}/reports/timesheets.csv`} target="_blank" rel="noreferrer">📊 Timesheet CSV</a>
        <a className="ad-report-btn" href={`${API_URL}/reports/timesheets.pdf`} target="_blank" rel="noreferrer">📄 Timesheet PDF</a>
      </div>

      {/* KPI kartları */}
      <div className="ad-kpis">
        <div className="ad-kpi">
          <div className="ad-kpi-label">Toplam Görev</div>
          <div className="ad-kpi-value">{kpis.total_tasks}</div>
        </div>
        <div className="ad-kpi danger">
          <div className="ad-kpi-label">Gecikmiş</div>
          <div className="ad-kpi-value">{kpis.overdue}</div>
        </div>
        <div className="ad-kpi warn">
          <div className="ad-kpi-label">Onay Bekleyen</div>
          <div className="ad-kpi-value">{kpis.pending_approval}</div>
        </div>
        <div className="ad-kpi success">
          <div className="ad-kpi-label">Bu Hafta Tamamlanan</div>
          <div className="ad-kpi-value">{kpis.completed_this_week}</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Ek Süre Talebi</div>
          <div className="ad-kpi-value">{kpis.extension_pending}</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Bekleyen Timesheet</div>
          <div className="ad-kpi-value">{kpis.timesheet_pending}</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Bu Hafta Saat</div>
          <div className="ad-kpi-value">{kpis.hours_this_week}</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Ort. Tamamlanma (gün)</div>
          <div className="ad-kpi-value">{kpis.avg_completion_days}</div>
        </div>
      </div>

      {/* Grafik kartları */}
      <div className="ad-grid">
        <div className="ad-card">
          <h3 className="ad-card-title">Görev Durumu Dağılımı</h3>
          <DonutChart data={statusData} />
        </div>

        <div className="ad-card">
          <h3 className="ad-card-title">Öncelik Dağılımı</h3>
          <DonutChart data={prioData} />
        </div>

        <div className="ad-card wide">
          <h3 className="ad-card-title">Son 14 Gün Trendi</h3>
          <TrendChart data={data.daily_trend || []} />
        </div>

        <div className="ad-card wide">
          <h3 className="ad-card-title">Bu Hafta Kapasitesi (saat)</h3>
          <BarChart data={capacity} valueKey="hours" labelKey="day_label" color="#FFD700" />
        </div>

        <div className="ad-card full">
          <h3 className="ad-card-title">Kişi Başı Görev Yükü</h3>
          <div className="ad-card-sub">
            <span><i style={{ background: '#3b82f622' }} /> Toplam</span>
            <span><i style={{ background: '#10b981' }} /> Tamamlanan</span>
            <span><i style={{ background: '#ef4444' }} /> Gecikmiş</span>
          </div>
          <DualBarChart data={data.user_workload || []} />
        </div>

        <div className="ad-card full">
          <h3 className="ad-card-title">Performans Sıralaması</h3>
          {perf.length === 0 ? (
            <div className="ad-empty">Performans verisi yok.</div>
          ) : (
            <table className="ad-perf-table">
              <thead>
                <tr>
                  <th>#</th><th>Kullanıcı</th><th>Atanan</th><th>Tamamlanan</th>
                  <th>Zamanında</th><th>Geciken</th><th>Tamamlanma</th><th>Zamanında %</th>
                  <th>Ort. Süre</th><th>Skor</th>
                </tr>
              </thead>
              <tbody>
                {perf.map((r, i) => (
                  <tr key={r.user_id}>
                    <td className="ad-rank">{i + 1}</td>
                    <td className="ad-name">{r.name}</td>
                    <td>{r.assigned}</td>
                    <td>{r.completed}</td>
                    <td className="ad-good">{r.on_time}</td>
                    <td className="ad-bad">{r.late}</td>
                    <td>
                      <div className="ad-progress">
                        <div className="ad-progress-fill" style={{ width: `${Math.min(100, r.completion_rate)}%`, background: '#3b82f6' }} />
                        <span>%{r.completion_rate}</span>
                      </div>
                    </td>
                    <td>
                      <div className="ad-progress">
                        <div className="ad-progress-fill" style={{ width: `${Math.min(100, r.on_time_rate)}%`, background: '#10b981' }} />
                        <span>%{r.on_time_rate}</span>
                      </div>
                    </td>
                    <td>{r.avg_completion_days > 0 ? `${r.avg_completion_days} gün` : '—'}</td>
                    <td>
                      <span className="ad-score" style={{
                        background: r.score >= 80 ? '#10b98122' : r.score >= 50 ? '#f59e0b22' : '#ef444422',
                        color: r.score >= 80 ? '#15803d' : r.score >= 50 ? '#b45309' : '#b91c1c'
                      }}>{r.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalyticsDashboard

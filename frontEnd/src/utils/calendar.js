/**
 * Takvim şerit görünümü için yardımcı fonksiyonlar.
 *
 * buildMonthGrid(month):
 *   Verilen ay için Pazartesi-başlangıçlı 6 haftalık (42 gün) grid döner.
 *   Her hafta = 7 günlük dizi. Her gün = { date, inMonth, isToday, isWeekend }.
 *
 * buildTaskSpans(tasks, monthGrid):
 *   Her hafta için, o haftaya değen görevlerin "şerit" segmentlerini hesaplar.
 *   start_date yoksa → görev tek günlük blok (due_date günü) olarak ele alınır.
 *   Aynı hafta içinde çakışan şeritler için greedy slot ataması yapılır (row).
 *
 *   Dönüş: weeks = [{ days: [...], spans: [{ task, startCol, endCol, row,
 *                     continuesLeft, continuesRight }], maxRow }]
 */

const MS_PER_DAY = 86400000

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/**
 * Verilen ay için 6 haftalık (Pazartesi başlangıçlı) takvim ızgarası döner.
 * @param {Date} month — ayın herhangi bir gününü temsil eden Date
 */
export const buildMonthGrid = (month) => {
  const first = startOfDay(new Date(month.getFullYear(), month.getMonth(), 1))
  // Pazartesi=0 ofset (JS'te Pazar=0, Pazartesi=1 → düzeltiyoruz)
  const offset = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - offset)

  const today = startOfDay(new Date())
  const monthIndex = month.getMonth()

  const weeks = []
  for (let w = 0; w < 6; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + w * 7 + d)
      days.push({
        date,
        label: date.getDate(),
        inMonth: date.getMonth() === monthIndex,
        isToday: sameDay(date, today),
        isWeekend: d >= 5,
      })
    }
    weeks.push(days)
  }
  return weeks
}

/**
 * Tek bir hafta için, o haftada görünmesi gereken görevlerin şerit segmentlerini
 * hesaplar. start_date yoksa due_date günü tek hücrelik blok döner.
 *
 * @param {Array} tasks — görev listesi (her görev t.due_date zorunlu, t.start_date opsiyonel)
 * @param {Array} week — buildMonthGrid'in döndüğü hafta dizisi (7 gün)
 * @returns { spans: [...], maxRow: number }
 */
export const buildWeekSpans = (tasks, week) => {
  const weekStart = startOfDay(week[0].date)
  const weekEnd = startOfDay(week[6].date)
  const weekEndInclusive = new Date(weekEnd)
  weekEndInclusive.setHours(23, 59, 59, 999)

  // Bu haftaya değen görevler
  const candidates = []
  for (const t of tasks) {
    if (!t.due_date) continue
    const due = startOfDay(new Date(t.due_date))
    const start = t.start_date ? startOfDay(new Date(t.start_date)) : due
    // start > due durumunda korumalı: start_date due_date'ten sonraysa start_date'i due'ya çekelim
    const actualStart = start > due ? due : start
    // Çakışma kontrolü
    if (actualStart > weekEnd || due < weekStart) continue
    candidates.push({ task: t, start: actualStart, end: due })
  }

  // Önce başlangıç, sonra süre uzunluğu (uzun olan üstte daha kararlı görünür)
  candidates.sort((a, b) => {
    if (a.start - b.start !== 0) return a.start - b.start
    return (b.end - b.start) - (a.end - a.start)
  })

  // Segment + slot atama
  const slotsEndCol = [] // her slot'un son end col değeri
  const spans = candidates.map(({ task, start, end }) => {
    const segStart = start < weekStart ? weekStart : start
    const segEnd = end > weekEnd ? weekEnd : end
    const startCol = Math.round((segStart - weekStart) / MS_PER_DAY) + 1
    // grid-column-end exclusive: +2
    const endCol = Math.round((segEnd - weekStart) / MS_PER_DAY) + 2

    // En küçük boş slot'u bul (slot end <= bu şeridin start)
    let row = 0
    while (row < slotsEndCol.length && slotsEndCol[row] > startCol) row++
    slotsEndCol[row] = endCol

    return {
      task,
      startCol,
      endCol,
      row,
      continuesLeft: start < weekStart,
      continuesRight: end > weekEnd,
    }
  })

  return { spans, maxRow: slotsEndCol.length }
}

/**
 * Tek hamlede tüm ay için şeritleri hesapla.
 * @returns weeks: [{ days, spans, maxRow }]
 */
export const buildCalendarWeeks = (tasks, month) => {
  const grid = buildMonthGrid(month)
  return grid.map((week) => {
    const { spans, maxRow } = buildWeekSpans(tasks, week)
    return { days: week, spans, maxRow }
  })
}

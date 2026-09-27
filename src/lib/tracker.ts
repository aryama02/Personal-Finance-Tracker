import type { TrackerData, Shift, Week } from '../types'

export const STORAGE_KEY = 'finance-tracker-data'
export const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function dateOnly(date: Date) { return date.toISOString().slice(0, 10) }
export function getPeriodStart(date = new Date(), startDay = 5, resetTime = '00:00') {
  const result = new Date(date)
  const [hour, minute] = resetTime.split(':').map(Number)
  result.setHours(hour, minute, 0, 0)
  const daysSinceStart = (result.getDay() - startDay + 7) % 7
  if (date.getTime() < result.getTime()) result.setDate(result.getDate() - 7)
  else result.setDate(result.getDate() - daysSinceStart)
  return result
}
export function makeWeek(start = getPeriodStart(), startDay = 5): Week {
  const shifts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { day: dayNames[(startDay + index) % 7], date: dateOnly(date), start: '', end: '' }
  })
  return { id: dateOnly(start), label: `Week of ${dateFormat.format(start)}`, startDate: dateOnly(start), shifts }
}
export function parseTimeMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]?.toUpperCase()
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = 0
    if (meridiem === 'PM') hour += 12
  } else if (hour > 23) return null
  return hour * 60 + minute
}
export function formatTime(value: string) {
  const minutes = parseTimeMinutes(value)
  if (minutes === null) return value
  const hour24 = Math.floor(minutes / 60)
  const hour12 = hour24 % 12 || 12
  const meridiem = hour24 >= 12 ? 'PM' : 'AM'
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${meridiem}`
}
export function hoursFor(shift: Shift) {
  if (typeof shift.hours === 'number') return shift.hours
  if (typeof shift.hoursInput === 'string') return Number(shift.hoursInput) || 0
  if (!shift.start || !shift.end) return 0
  const startMinutes = parseTimeMinutes(shift.start)
  const endMinutes = parseTimeMinutes(shift.end)
  if (startMinutes === null || endMinutes === null) return 0
  let minutes = endMinutes - startMinutes
  if (minutes < 0) minutes += 1440
  return minutes / 60
}
export function blankData(): TrackerData {
  return { wage: 0, targetStartDate: '', targetDate: '', weekStartDay: 5, resetTime: '00:00', activeWeek: makeWeek(getPeriodStart(), 5), archivedWeeks: [], goals: { week: 0, biweekly: 0, semester: 0 } }
}
export function restoreData(stored: Partial<TrackerData>): TrackerData {
  const defaults = blankData()
  const data = { ...defaults, ...stored }
  const activeWeek = stored.activeWeek?.id && Array.isArray(stored.activeWeek.shifts) ? stored.activeWeek : defaults.activeWeek
  const archivedWeeks = Array.isArray(stored.archivedWeeks) ? stored.archivedWeeks : defaults.archivedWeeks
  const goals = stored.goals ? { ...defaults.goals, ...stored.goals } : defaults.goals
  return { ...data, activeWeek, archivedWeeks, goals }
}
export function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = restoreData(JSON.parse(saved) as Partial<TrackerData>)
      const currentPeriod = getPeriodStart(new Date(), data.weekStartDay, data.resetTime)
      if (data.activeWeek.id !== dateOnly(currentPeriod)) return { ...data, archivedWeeks: [data.activeWeek, ...data.archivedWeeks], activeWeek: makeWeek(currentPeriod, data.weekStartDay) }
      return data
    }
  } catch { /* fall back to blank data */ }
  return blankData()
}

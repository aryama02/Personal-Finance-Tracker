import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import './App.css'

type Shift = { day: string; date: string; start: string; end: string; hours?: number; hoursInput?: string }
type Week = { id: string; label: string; startDate: string; shifts: Shift[] }
type TrackerData = { wage: number; targetStartDate: string; targetDate: string; weekStartDay: number; resetTime: string; activeWeek: Week; archivedWeeks: Week[] }

const STORAGE_KEY = 'finance-tracker-data'

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function dateOnly(date: Date) { return date.toISOString().slice(0, 10) }
function getPeriodStart(date = new Date(), startDay = 5, resetTime = '00:00') {
  const result = new Date(date)
  const [hour, minute] = resetTime.split(':').map(Number)
  result.setHours(hour, minute, 0, 0)
  const daysSinceStart = (result.getDay() - startDay + 7) % 7
  if (date.getTime() < result.getTime()) result.setDate(result.getDate() - 7)
  else result.setDate(result.getDate() - daysSinceStart)
  return result
}
function makeWeek(start = getPeriodStart(), startDay = 5): Week {
  const shifts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { day: dayNames[(startDay + index) % 7], date: dateOnly(date), start: '', end: '' }
  })
  return { id: dateOnly(start), label: `Week of ${dateFormat.format(start)}`, startDate: dateOnly(start), shifts }
}
function hoursFor(shift: Shift) {
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

function parseTimeMinutes(value: string) {
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

function formatTime(value: string) {
  const minutes = parseTimeMinutes(value)
  if (minutes === null) return value
  const hour24 = Math.floor(minutes / 60)
  const hour12 = hour24 % 12 || 12
  const meridiem = hour24 >= 12 ? 'PM' : 'AM'
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${meridiem}`
}
function blankData(): TrackerData {
  return { wage: 0, targetStartDate: '', targetDate: '', weekStartDay: 5, resetTime: '00:00', activeWeek: makeWeek(getPeriodStart(), 5), archivedWeeks: [] }
}

function restoreData(stored: Partial<TrackerData>): TrackerData {
  const defaults = blankData()
  const data = { ...defaults, ...stored }
  const activeWeek = stored.activeWeek?.id && Array.isArray(stored.activeWeek.shifts) ? stored.activeWeek : defaults.activeWeek
  const archivedWeeks = Array.isArray(stored.archivedWeeks) ? stored.archivedWeeks : defaults.archivedWeeks
  return { ...data, activeWeek, archivedWeeks }
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const stored = JSON.parse(saved) as Partial<TrackerData>
      const data = restoreData(stored)
      const currentPeriod = getPeriodStart(new Date(), data.weekStartDay, data.resetTime)
      if (data.activeWeek.id !== dateOnly(currentPeriod)) return { ...data, archivedWeeks: [data.activeWeek, ...data.archivedWeeks], activeWeek: makeWeek(currentPeriod, data.weekStartDay) }
      return data
    }
  } catch { /* fall back to blank data */ }
  return blankData()
}

function App() {
  const [data, setData] = useState<TrackerData>(loadData)
  const [tab, setTab] = useState<'dashboard' | 'tracker'>('dashboard')
  const [editingWeek, setEditingWeek] = useState<string | null>(null)
  const [addingWeek, setAddingWeek] = useState(false)
  const [newWeekStart, setNewWeekStart] = useState('')
  const [newWeekEnd, setNewWeekEnd] = useState('')
  const [currentTime] = useState(() => Date.now())
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch { /* keep the in-memory tracker usable if browser storage is unavailable */ }
  }, [data])

  const allWeeks = useMemo(() => [data.activeWeek, ...data.archivedWeeks], [data])
  const totalHours = allWeeks.reduce((sum, week) => sum + week.shifts.reduce((weekSum, shift) => weekSum + hoursFor(shift), 0), 0)
  const activeHours = data.activeWeek.shifts.reduce((sum, shift) => sum + hoursFor(shift), 0)
  const totalEarnings = totalHours * data.wage
  const goalStart = data.targetStartDate ? new Date(`${data.targetStartDate}T00:00:00`).getTime() : currentTime
  const countdownBase = Math.max(currentTime, goalStart)
  const targetDays = data.targetDate ? Math.max(0, Math.ceil((new Date(`${data.targetDate}T23:59:59`).getTime() - countdownBase) / 86400000)) : 0
  const countdownWeeks = Math.floor(targetDays / 7)
  const countdownDays = targetDays % 7

  const updateActiveShift = (index: number, key: 'start' | 'end', value: string) => setData((current) => ({ ...current, activeWeek: { ...current.activeWeek, shifts: current.activeWeek.shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, [key]: value, hours: undefined, hoursInput: undefined } : shift) } }))
  const updateActiveHours = (index: number, value: string) => setData((current) => ({ ...current, activeWeek: { ...current.activeWeek, shifts: current.activeWeek.shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, hours: undefined, hoursInput: value } : shift) } }))
  const updateArchivedShift = (weekId: string, index: number, key: 'start' | 'end', value: string) => setData((current) => ({ ...current, archivedWeeks: current.archivedWeeks.map((week) => week.id !== weekId ? week : { ...week, shifts: week.shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, [key]: value, hours: undefined, hoursInput: undefined } : shift) }) }))
  const updateArchivedHours = (weekId: string, index: number, value: string) => setData((current) => ({ ...current, archivedWeeks: current.archivedWeeks.map((week) => week.id !== weekId ? week : { ...week, shifts: week.shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, hours: undefined, hoursInput: value } : shift) }) }))
  const archiveCurrentWeek = () => setData((current) => { const nextPeriod = getPeriodStart(new Date(Date.now() + 86400000), current.weekStartDay, current.resetTime); const alreadyArchived = current.archivedWeeks.some((week) => week.id === current.activeWeek.id); return { ...current, archivedWeeks: alreadyArchived ? current.archivedWeeks : [current.activeWeek, ...current.archivedWeeks], activeWeek: makeWeek(nextPeriod, current.weekStartDay) } })
  const addPastWeek = () => {
    if (!newWeekStart || !newWeekEnd || newWeekEnd < newWeekStart) return
    const start = new Date(`${newWeekStart}T00:00:00`)
    const end = new Date(`${newWeekEnd}T00:00:00`)
    const shifts: Shift[] = []
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) shifts.push({ day: dayNames[date.getDay()], date: dateOnly(date), start: '', end: '' })
    setData((current) => current.archivedWeeks.some((week) => week.id === newWeekStart) || current.activeWeek.id === newWeekStart ? current : { ...current, archivedWeeks: [{ id: newWeekStart, startDate: newWeekStart, label: `${dateFormat.format(start)} - ${dateFormat.format(end)}`, shifts }, ...current.archivedWeeks] })
    setNewWeekStart('')
    setNewWeekEnd('')
    setAddingWeek(false)
  }
  const deleteArchivedWeek = (weekId: string) => setData((current) => ({ ...current, archivedWeeks: current.archivedWeeks.filter((week) => week.id !== weekId) }))
  const updateSchedule = (key: 'weekStartDay' | 'resetTime', value: string) => setData((current) => ({ ...current, [key]: key === 'weekStartDay' ? Number(value) : value }))
  const exportData = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'finance-tracker-backup.json'; link.click(); URL.revokeObjectURL(url) }
  const importData = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(String(reader.result)) as Partial<TrackerData>; if (imported.activeWeek && Array.isArray(imported.archivedWeeks)) setData(restoreData(imported)) } catch { /* ignore invalid backups */ } }; reader.readAsText(file); event.target.value = '' }
  const activeEditingWeek = editingWeek ? allWeeks.find((week) => week.id === editingWeek) : null

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark">FT</div><div><p className="eyebrow">PERSONAL FINANCE</p><h1>Finance &amp; Time</h1></div><div className="topbar-right"><span className="saved-state">Saved locally</span><div className="avatar">A</div></div></header>
      <nav className="tabs" aria-label="Primary navigation"><button className={tab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setTab('dashboard')}>Dashboard</button><button className={tab === 'tracker' ? 'tab active' : 'tab'} onClick={() => setTab('tracker')}>Weekly HR Track</button></nav>

      {tab === 'tracker' ? <section className="page-content">
        <div className="page-heading"><div><p className="eyebrow accent-text">ACTIVE PERIOD</p><h2>Keep the week moving.</h2><p className="muted">Log your hours as you go. Your earnings update automatically.</p></div><button className="secondary-button" onClick={archiveCurrentWeek}>Archive week</button></div>
        <div className="summary-strip"><div><span className="summary-label">Current period</span><strong>{data.activeWeek.label}</strong></div><div><span className="summary-label">Hours logged</span><strong>{activeHours.toFixed(2)} <small>/ 40 hrs</small></strong></div><div><span className="summary-label">Estimated pay</span><strong>{money.format(activeHours * data.wage)}</strong></div><div><label className="summary-label" htmlFor="wage-input">Hourly wage</label><input id="wage-input" className="summary-input" type="number" min="0" step="0.25" value={data.wage || ''} placeholder="0.00" onChange={(event) => setData((current) => ({ ...current, wage: Number(event.target.value) }))} /></div></div>
        <div className="section-title"><div><h3>Daily shifts</h3><p className="muted">{data.activeWeek.shifts[0].day} through {data.activeWeek.shifts[6].day}</p></div><span className="live-badge"><i /> Live</span></div>
        <div className="shift-table"><div className="table-head"><span>Day</span><span>Start time</span><span>End time</span><span>Hours</span><span>Est. earnings</span></div>{data.activeWeek.shifts.map((shift, index) => <div className="table-row" key={shift.date}><div className="day-cell"><strong>{shift.day}</strong><span>{dateFormat.format(new Date(`${shift.date}T12:00:00`))}</span></div><input aria-label={`${shift.day} start time`} type="text" inputMode="text" placeholder="9:00 AM" value={shift.start} onChange={(event) => updateActiveShift(index, 'start', event.target.value)} onBlur={(event) => updateActiveShift(index, 'start', formatTime(event.target.value))} /><input aria-label={`${shift.day} end time`} type="text" inputMode="text" placeholder="5:00 PM" value={shift.end} onChange={(event) => updateActiveShift(index, 'end', event.target.value)} onBlur={(event) => updateActiveShift(index, 'end', formatTime(event.target.value))} /><input aria-label={`${shift.day} hours`} className="hours-input" type="text" inputMode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="0.00" value={shift.hoursInput ?? (typeof shift.hours === 'number' ? String(shift.hours) : '')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateActiveHours(index, event.target.value)} /><span className="earnings-cell">{money.format(hoursFor(shift) * data.wage)}</span></div>)}</div>
        <div className="tracker-footer"><span>Week total</span><strong>{activeHours.toFixed(2)} hrs</strong><strong>{money.format(activeHours * data.wage)}</strong></div>
        <div className="settings-row"><label>Goal start date<input type="date" value={data.targetStartDate} onChange={(event) => setData((current) => ({ ...current, targetStartDate: event.target.value }))} /></label><label>Goal end date<input type="date" value={data.targetDate} onChange={(event) => setData((current) => ({ ...current, targetDate: event.target.value }))} /></label><label>Week starts<select value={data.weekStartDay} onChange={(event) => updateSchedule('weekStartDay', event.target.value)}>{dayNames.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Reset time<input type="time" value={data.resetTime} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => updateSchedule('resetTime', event.target.value)} /></label><div className="reset-note"><span className="calendar-icon">R</span><span><strong>Weekly reset</strong><small>Archives on {dayNames[data.weekStartDay]} at {data.resetTime}</small></span></div></div>
        <div className="data-tools"><strong>Private browser data</strong><span>Stored only on this device.</span><button className="text-button" onClick={exportData}>Export backup</button><label className="text-button">Import backup<input className="file-input" type="file" accept="application/json" onChange={importData} /></label></div>
      </section> : <section className="page-content dashboard-page">
        <div className="page-heading"><div><p className="eyebrow accent-text">YOUR OVERVIEW</p><h2>Make your time count.</h2><p className="muted">A clear view of where your work is taking you.</p></div><button className="secondary-button" onClick={() => setTab('tracker')}>Log hours</button></div>
        <div className="metric-grid"><article className="metric-card featured"><span className="metric-label">Total earned</span><strong>{money.format(totalEarnings)}</strong><span className="metric-foot">Across {allWeeks.length} {allWeeks.length === 1 ? 'week' : 'weeks'}</span></article><article className="metric-card"><span className="metric-label">Total hours</span><strong>{totalHours.toFixed(2)}</strong><span className="metric-foot">Hours worked</span></article><article className="metric-card"><span className="metric-label">Goal countdown</span><strong>{data.targetDate ? countdownWeeks : '--'}<small>{data.targetDate ? `w ${countdownDays}d` : ' Set a date'}</small></strong><span className="metric-foot">{data.targetDate ? `Until ${dateFormat.format(new Date(`${data.targetDate}T12:00:00`))}` : 'Choose a goal end date'}</span></article></div>
        <div className="dashboard-grid"><section className="panel earnings-panel"><div className="section-title"><div><h3>Weekly earnings</h3><p className="muted">Your archive, at a glance</p></div><span className="chart-total">{money.format(totalEarnings)}</span></div><div className="bars">{allWeeks.slice(0, 8).map((week, index) => { const weekHours = week.shifts.reduce((sum, shift) => sum + hoursFor(shift), 0); const amount = weekHours * data.wage; const max = Math.max(...allWeeks.map((item) => item.shifts.reduce((sum, shift) => sum + hoursFor(shift), 0) * data.wage), 1); return <div className="bar-group" key={week.id}><span className="bar-value">{money.format(amount)}</span><div className="bar" style={{ height: `${Math.max(8, amount / max * 130)}px` }} /><span className="bar-label">{index === 0 ? 'Current' : `Week ${allWeeks.length - index}`}</span></div> })}</div></section><section className="panel goal-panel"><span className="metric-label">Semester goal</span><h3>{data.targetDate ? dateFormat.format(new Date(`${data.targetDate}T12:00:00`)) : 'No date set'}</h3><p className="goal-countdown-copy">{data.targetDate ? `Semester ends in ${targetDays} days` : 'Set a semester end date'}</p><p className="muted">{data.targetStartDate ? `Started ${dateFormat.format(new Date(`${data.targetStartDate}T12:00:00`))}` : 'Choose a semester start date'}{data.targetDate ? ` · Ends ${dateFormat.format(new Date(`${data.targetDate}T12:00:00`))}` : ''}</p><div className="countdown"><strong>{data.targetDate ? countdownWeeks : '--'}</strong><span>weeks</span><strong>{data.targetDate ? countdownDays : '--'}</strong><span>days</span></div><div className="progress-track"><div style={{ width: `${Math.min(100, totalEarnings / 1000 * 100)}%` }} /></div><small className="muted">{money.format(totalEarnings)} toward your tracked total</small></section></div>
        <section className="panel history-panel"><div className="section-title"><div><h3>Weeks</h3><p className="muted">Your current week and archived history.</p></div><div className="history-actions"><button className="text-button" onClick={() => setAddingWeek(true)}>+ Add past week</button><button className="text-button" onClick={() => setTab('tracker')}>View active week</button></div></div><div className="history-row current-week-row"><span><strong>Current week</strong><small>{data.activeWeek.label} · {activeHours.toFixed(2)} hours</small></span><strong>{money.format(activeHours * data.wage)}</strong><span className="current-badge">ACTIVE</span><button className="edit-button" onClick={() => setTab('tracker')}>Edit</button></div>{data.archivedWeeks.length === 0 ? <div className="empty-history">Your archived weeks will appear here after your first reset.</div> : data.archivedWeeks.map((week) => { const weekHours = week.shifts.reduce((sum, shift) => sum + hoursFor(shift), 0); return <div className="history-row" key={week.id}><span><strong>{week.label}</strong><small>{weekHours.toFixed(2)} hours</small></span><strong>{money.format(weekHours * data.wage)}</strong><button className="edit-button" onClick={() => setEditingWeek(week.id)}>Edit</button><button className="delete-button" onClick={() => deleteArchivedWeek(week.id)}>Delete</button></div> })}</section>
      </section>}

      {addingWeek && <div className="modal-backdrop" onClick={() => setAddingWeek(false)}><div className="modal small-modal" onClick={(event) => event.stopPropagation()}><div className="section-title"><div><p className="eyebrow accent-text">HISTORICAL WEEK</p><h3>Add a past week</h3></div><button className="close-button" onClick={() => setAddingWeek(false)}>X</button></div><p className="muted modal-copy">Choose the start and end dates. The blank period will be added to your archive for editing.</p><div className="date-pair"><label className="modal-date-label">Week start<input type="date" value={newWeekStart} onChange={(event) => setNewWeekStart(event.target.value)} /></label><label className="modal-date-label">Week end<input type="date" min={newWeekStart} value={newWeekEnd} onChange={(event) => setNewWeekEnd(event.target.value)} /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setAddingWeek(false)}>Cancel</button><button className="primary-button" disabled={!newWeekStart || !newWeekEnd || newWeekEnd < newWeekStart} onClick={addPastWeek}>Add week</button></div></div></div>}
      {activeEditingWeek && <div className="modal-backdrop" onClick={() => setEditingWeek(null)}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="section-title"><div><p className="eyebrow accent-text">HISTORICAL EDIT</p><h3>{activeEditingWeek.label}</h3></div><button className="close-button" onClick={() => setEditingWeek(null)}>X</button></div><div className="modal-shifts">{activeEditingWeek.shifts.map((shift, index) => <div className="modal-row" key={shift.date}><span>{shift.day}</span><input type="text" inputMode="text" placeholder="9:00 AM" aria-label={`${shift.day} historical start time`} value={shift.start} onChange={(event) => updateArchivedShift(activeEditingWeek.id, index, 'start', event.target.value)} onBlur={(event) => updateArchivedShift(activeEditingWeek.id, index, 'start', formatTime(event.target.value))} /><input type="text" inputMode="text" placeholder="5:00 PM" aria-label={`${shift.day} historical end time`} value={shift.end} onChange={(event) => updateArchivedShift(activeEditingWeek.id, index, 'end', event.target.value)} onBlur={(event) => updateArchivedShift(activeEditingWeek.id, index, 'end', formatTime(event.target.value))} /><input type="text" inputMode="decimal" pattern="[0-9]*[.]?[0-9]*" aria-label={`${shift.day} historical hours`} className="hours-input" placeholder="0.00" value={shift.hoursInput ?? (typeof shift.hours === 'number' ? String(shift.hours) : '')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateArchivedHours(activeEditingWeek.id, index, event.target.value)} /></div>)}</div><button className="primary-button full-button" onClick={() => setEditingWeek(null)}>Done editing</button></div></div>}
    </main>
  )
}

export default App

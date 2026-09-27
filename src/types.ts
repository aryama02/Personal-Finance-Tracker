export type Shift = { day: string; date: string; start: string; end: string; hours?: number; hoursInput?: string }
export type Week = { id: string; label: string; startDate: string; shifts: Shift[] }
export type GoalTargets = { week: number; biweekly: number; semester: number }
export type TrackerData = { wage: number; targetStartDate: string; targetDate: string; weekStartDay: number; resetTime: string; activeWeek: Week; archivedWeeks: Week[]; goals: GoalTargets }

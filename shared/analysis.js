export const GOALS = { strength: 'Стать сильнее', muscle: 'Набрать мышечную массу', fat_loss: 'Снизить вес', maintain: 'Поддерживать форму' }
export const PROMPT_VERSION = 'fittrack-1'
export const validProfile = p => !!p && typeof p === 'object' && Object.hasOwn(GOALS, p.goal) && (p.weightKg == null || (typeof p.weightKg === 'number' && Number.isFinite(p.weightKg) && p.weightKg >= 20 && p.weightKg <= 400))
const round = n => Math.round(n * 100) / 100
const numeric = v => Number(String(v).replace(',', '.'))
export function buildAnalysis(data, profile, days, endDate) {
  if (!validProfile(profile) || ![7, 28].includes(days) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(endDate)) || new Date(endDate).toISOString().slice(0, 10) !== endDate) throw new Error('Некорректные параметры разбора.')
  const start = new Date(`${endDate}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - days + 1)
  const startDate = start.toISOString().slice(0, 10)
  const inPeriod = x => x.date >= startDate && x.date <= endDate
  const workouts = [...data.workouts].filter(inPeriod).sort((a, b) => a.date.localeCompare(b.date))
  const exercises = new Map()
  let completedSets = 0; let totalVolume = 0
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const sets = exercise.sets.filter(s => s.done)
      if (!sets.length) continue
      const existing = exercises.get(exercise.id) ?? { name: exercise.name.slice(0, 60), sessions: 0, sets: 0, volumeKg: 0, firstSession: null, lastSession: null }
      const summary = { date: workout.date, sets: sets.length, maxWeightKg: Math.max(...sets.map(s => numeric(s.weight))), minReps: Math.min(...sets.map(s => numeric(s.reps))), maxReps: Math.max(...sets.map(s => numeric(s.reps))) }
      const volume = sets.reduce((n, s) => n + numeric(s.weight) * numeric(s.reps), 0)
      existing.sessions++; existing.sets += sets.length; existing.volumeKg = round(existing.volumeKg + volume)
      existing.firstSession ??= summary; existing.lastSession = summary
      exercises.set(exercise.id, existing); completedSets += sets.length; totalVolume += volume
    }
  }
  const nutrition = [...data.nutrition].filter(inPeriod).sort((a, b) => a.date.localeCompare(b.date))
  const averages = Object.fromEntries(['calories', 'protein', 'fat', 'carbs', 'fiber'].map(key => {
    const values = nutrition.map(d => d.nutrients[key]).filter(n => typeof n === 'number' && Number.isFinite(n))
    return [key, { value: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null, recordedDays: values.length }]
  }))
  return {
    period: { start: startDate, end: endDate, days }, goal: GOALS[profile.goal], weightKg: profile.weightKg ?? null,
    training: { sessions: workouts.length, completedSets, volumeKg: round(totalVolume), exercises: [...exercises.values()] },
    nutrition: { recordedDays: nutrition.length, averages, completeness: 'unknown; missing days are not zero intake' },
  }
}
export function validReport(value) {
  const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 1800
  const items = a => Array.isArray(a) && a.length <= 5 && a.every(text)
  return !!value && typeof value === 'object' && text(value.summary) && items(value.training) && items(value.nutrition) && items(value.nextSteps) && items(value.missingData)
}

export type SetEntry = { id: string; weight: string; reps: string; done: boolean }
export type Exercise = { id: string; name: string; sets: SetEntry[] }
export type Workout = { id: string; title: string; date: string; exercises: Exercise[] }
export type Template = { id: string; title: string; exercises: { id: string; name: string; sets: number; reps: number }[] }
export type Nutrients = Record<string, number | null>
export type Food = { name: string; portion: string; meal: string; nutrients: Nutrients }
export type NutritionDay = { date: string; nutrients: Nutrients; foods: Food[]; source: string }
export type Data = { version: 1; templates: Template[]; workouts: Workout[]; draft: Workout | null; nutrition: NutritionDay[]; exerciseNames: Record<string, string>; aiProfile?: { goal: 'strength' | 'muscle' | 'fat_loss' | 'maintain'; weightKg?: number } }
export const uid = () => crypto.randomUUID()
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const blankSet = (reps = ''): SetEntry => ({ id: uid(), weight: '', reps, done: false })
export const emptyData = (): Data => ({ version: 1, templates: [], workouts: [], draft: null, nutrition: [], exerciseNames: {} })
export const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
export const validSet = (s: SetEntry) => s.weight.trim() !== '' && Number.isFinite(Number(s.weight.replace(',', '.'))) && Number(s.weight.replace(',', '.')) >= 0 && /^\d+$/.test(s.reps) && Number(s.reps) > 0
export const volume = (w: Workout) => w.exercises.reduce((total, e) => total + e.sets.filter(s => s.done).reduce((n, s) => n + Number(s.weight.replace(',', '.')) * Number(s.reps), 0), 0)
export function previousExercise(workouts: Workout[], exerciseId: string, current: Workout) {
  return [...workouts].filter(w => w.id !== current.id && w.date <= current.date).sort((a, b) => b.date.localeCompare(a.date)).find(w => w.exercises.some(e => e.id === exerciseId))
}

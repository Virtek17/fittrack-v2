import { validProfile } from './analysis.js'
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v, max = 200) => typeof v === 'string' && v.length <= max
const id = v => str(v, 100) && v.length > 0
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const list = (v, test, max = 20000) => Array.isArray(v) && v.length <= max && v.every(test)
const unique = a => new Set(a.map(x => x.id)).size === a.length
const set = v => obj(v) && id(v.id) && str(v.weight, 30) && str(v.reps, 10) && typeof v.done === 'boolean' && (!v.done || (v.weight.trim() !== '' && Number.isFinite(Number(v.weight.replace(',', '.'))) && Number(v.weight.replace(',', '.')) >= 0 && /^\d+$/.test(v.reps) && Number(v.reps) > 0))
const exercise = v => obj(v) && id(v.id) && str(v.name) && list(v.sets, set, 1000) && unique(v.sets)
const workout = v => obj(v) && id(v.id) && str(v.title) && date(v.date) && list(v.exercises, exercise, 200) && unique(v.exercises)
const draft = v => obj(v) && workout({ ...v, date: v.date === '' ? '2000-01-01' : v.date })
const template = v => obj(v) && id(v.id) && str(v.title) && list(v.exercises, e => obj(e) && id(e.id) && str(e.name) && Number.isInteger(e.sets) && e.sets > 0 && e.sets <= 30 && Number.isInteger(e.reps) && e.reps > 0 && e.reps <= 999, 200) && unique(v.exercises)
const nutrients = v => obj(v) && Object.entries(v).every(([k, n]) => str(k, 100) && (n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0)))
const food = v => obj(v) && str(v.name, 1000) && str(v.portion, 500) && str(v.meal) && nutrients(v.nutrients)
const day = v => obj(v) && date(v.date) && nutrients(v.nutrients) && list(v.foods, food, 5000) && str(v.source, 1000)
export function isData(d) {
  return obj(d) && d.version === 1 && (d.aiProfile === undefined || validProfile(d.aiProfile)) && list(d.workouts, workout) && unique(d.workouts) && list(d.templates, template, 1000) && unique(d.templates) && list(d.nutrition, day) && new Set(d.nutrition.map(n => n.date)).size === d.nutrition.length && obj(d.exerciseNames) && Object.entries(d.exerciseNames).every(([k, v]) => id(k) && str(v)) && (d.draft === null || draft(d.draft))
}

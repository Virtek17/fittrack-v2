import type { Food, Nutrients, NutritionDay } from './model'

export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (quoted) throw new Error('В CSV не закрыты кавычки. Экспортируйте отчёт повторно.')
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}
const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const columns: Record<string, string> = { 'Кал': 'calories', 'Жир': 'fat', 'Н/жир': 'saturatedFat', 'Углев': 'carbs', 'Клетч': 'fiber', 'Сахар': 'sugar', 'Белк': 'protein', 'Натри': 'sodium', 'Холес': 'cholesterol', 'Калий': 'potassium' }
export function parseFatSecret(text: string, source: string): NutritionDay[] {
  const rows = csvRows(text.replace(/^\uFEFF/, '')); const days: NutritionDay[] = []
  let keys: string[] = []; let current: NutritionDay | undefined; let meal = ''; let food: Food | undefined
  for (const row of rows) {
    const first = row[0] ?? ''; const name = first.trim()
    if (name === 'Дата') { keys = row.map(h => columns[h.split('(')[0].trim()] ?? ''); continue }
    if (!keys.length || !name || name.startsWith('#')) continue
    const nutrients = (): Nutrients => Object.fromEntries(keys.flatMap((key, i) => {
      if (!key) return []
      const value = (row[i] ?? '').trim(); const number = value ? Number(value.replace(',', '.')) : null
      if (number !== null && (!Number.isFinite(number) || number < 0)) throw new Error(`Некорректное значение в строке «${name}».`)
      return [[key, number]]
    }))
    const date = name.match(/^[^,]+,\s*([^\s]+)\s+(\d{1,2}),\s*(\d{4})$/)
    if (date) {
      const month = months.indexOf(date[1].toLowerCase()); const day = Number(date[2])
      if (month < 0 || day < 1 || day > new Date(Number(date[3]), month + 1, 0).getDate()) throw new Error('Не удалось распознать дату отчёта.')
      current = { date: `${date[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, nutrients: nutrients(), foods: [], source }
      if (days.some(d => d.date === current!.date)) throw new Error('В отчёте повторяется дата.')
      days.push(current); meal = ''; food = undefined; continue
    }
    if (!current || name === 'Всего') continue
    const indent = first.length - first.trimStart().length
    if (indent === 1) { meal = name; food = undefined }
    else if (indent === 2) { food = { name, portion: '', meal, nutrients: nutrients() }; current.foods.push(food) }
    else if (indent >= 3 && food) food.portion = name
  }
  if (!keys.includes('calories') || !keys.includes('protein') || !days.length) throw new Error('Нужен подробный CSV-отчёт FatSecret на русском языке с разделом «Дата».')
  return days
}

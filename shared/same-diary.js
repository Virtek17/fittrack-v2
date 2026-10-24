// PostgreSQL JSONB can reorder object keys. Array order (sets, exercises) remains meaningful.
const canonical = value => JSON.stringify(value, (_key, entry) => {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  }
  return entry
})
export const sameDiary = (left, right) => canonical(left) === canonical(right)

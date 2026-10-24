import { verifyTelegram } from '../server/auth.mjs'
import { isData } from '../shared/validate.js'
import { supabaseConfig } from '../server/supabase.mjs'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'PUT'].includes(req.method)) { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'Метод не поддерживается.' }) }
  const { TELEGRAM_BOT_TOKEN } = process.env
  const config = supabaseConfig()
  if (!TELEGRAM_BOT_TOKEN || !config) return res.status(503).json({ error: 'Облако ещё не настроено. Добавьте параметры Telegram и Supabase на сервере.' })
  let userId
  try { const auth = req.headers.authorization ?? ''; if (!auth.startsWith('tma ')) throw new Error('Откройте приложение через Telegram.'); userId = verifyTelegram(auth.slice(4), TELEGRAM_BOT_TOKEN) }
  catch (e) { return res.status(401).json({ error: e.message }) }
  const { url: SUPABASE_URL, headers } = config
  try {
    if (req.method === 'GET') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/diaries?telegram_user_id=eq.${userId}&select=data,revision`, { headers, signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error('database')
      const rows = await response.json()
      return res.status(200).json(rows[0] ?? { data: null, revision: 0 })
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!body || JSON.stringify(body).length > 2_000_000) return res.status(413).json({ error: 'Дневник слишком большой для одной копии (лимит 2 МБ).' })
    const d = body.data
    if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !isData(d)) return res.status(400).json({ error: 'Некорректный формат дневника.' })
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_diary`, { method: 'POST', headers, body: JSON.stringify({ p_user_id: userId, p_revision: body.revision, p_data: d }), signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('database')
    const nextRevision = await response.json()
    if (nextRevision === null) return res.status(409).json({ error: 'Облачная копия изменилась на другом устройстве. Скачайте локальную резервную копию и повторите синхронизацию.' })
    return res.status(200).json({ revision: nextRevision })
  } catch { return res.status(502).json({ error: 'Не удалось связаться с базой. Локальные данные сохранены; попробуйте позже.' }) }
}

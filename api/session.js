import { verifyTelegramUser } from '../server/auth.mjs'
import { supabaseConfig } from '../server/supabase.mjs'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Метод не поддерживается.' }) }
  const config = supabaseConfig()
  if (!config || !process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: 'Вход ещё не настроен. Требуются параметры Supabase и Telegram-бота на сервере.' })
  let user
  try {
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('tma ')) throw new Error('Откройте приложение из Telegram-бота.')
    user = verifyTelegramUser(auth.slice(4), process.env.TELEGRAM_BOT_TOKEN)
  } catch (e) { return res.status(401).json({ error: e.message }) }
  try {
    const response = await fetch(`${config.url}/rest/v1/app_users?on_conflict=telegram_user_id`, {
      method: 'POST', headers: { ...config.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ telegram_user_id: user.id, first_name: user.first_name, username: user.username, last_seen_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('database')
    return res.status(200).json({ user })
  } catch { return res.status(502).json({ error: 'Не удалось выполнить вход. Попробуйте ещё раз; локальные записи сохранены.' }) }
}

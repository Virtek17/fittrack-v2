import { verifyTelegram } from '../server/auth.mjs'
import { supabaseConfig } from '../server/supabase.mjs'
import { analysisIdentity, generateRecommendation } from '../server/recommendations.mjs'
import { buildAnalysis, validProfile, validReport } from '../shared/analysis.js'
import { isData } from '../shared/validate.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Метод не поддерживается.' }) }
  let userId
  try {
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('tma ')) throw new Error('Для ИИ-разбора откройте приложение из Telegram-бота.')
    userId = verifyTelegram(auth.slice(4), process.env.TELEGRAM_BOT_TOKEN)
  } catch (e) { return res.status(401).json({ error: e.message }) }
  let body
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body } catch { return res.status(400).json({ error: 'Некорректный запрос.' }) }
  if (!body || JSON.stringify(body).length > 2_000_000) return res.status(413).json({ error: 'Размер дневника превышает 2 МБ.' })
  if (body.consent !== true || !isData(body.data) || !validProfile(body.profile) || ![7, 28].includes(body.days)) return res.status(400).json({ error: 'Проверьте цель, вес и согласие на отправку сводки в OpenRouter.' })
  let summary
  try { summary = buildAnalysis(body.data, body.profile, body.days, body.endDate) } catch (e) { return res.status(400).json({ error: e.message }) }
  if (body.endDate > new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10)) return res.status(400).json({ error: 'Выберите период без будущих дат.' })
  if (!summary.training.sessions && !summary.nutrition.recordedDays) return res.status(400).json({ error: 'В выбранном периоде пока нет завершённых тренировок или записей питания.' })
  if (JSON.stringify(summary).length > 7000) return res.status(413).json({ error: 'Для такого объёма данных выберите период 7 дней.' })
  const config = supabaseConfig()
  const model = process.env.OPENROUTER_MODEL || 'openrouter/free'
  if (model !== 'openrouter/free' && !model.endsWith(':free')) return res.status(503).json({ error: 'Настройте бесплатную модель OpenRouter.' })
  if (!config) return res.status(503).json({ error: 'Хранение ИИ-разборов ещё не настроено.' })
  const hash = analysisIdentity(summary, model)
  let requestId
  const request = async (path, options = {}) => {
    const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers: { ...config.headers, ...options.headers }, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('База ИИ-разборов временно недоступна.')
    return response
  }
  const reportPath = () => `ai_reports?telegram_user_id=eq.${userId}&input_hash=eq.${hash}`
  try {
    // Read cache before requiring an API key: saved reports remain readable during provider outages.
    const cached = await (await request(`${reportPath()}&status=eq.completed&select=report,generated_at,model`)).json()
    if (cached[0] && validReport(cached[0].report)) return res.status(200).json({ report: cached[0].report, generatedAt: cached[0].generated_at, cached: true, model: cached[0].model, inputHash: hash })
    if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'ИИ ещё не подключён: добавьте OPENROUTER_API_KEY в серверные настройки.' })
    const claim = await (await request('rpc/claim_ai_report', { method: 'POST', body: JSON.stringify({ p_user_id: userId, p_hash: hash, p_model: model }) })).json()
    if (claim.state === 'cached' && validReport(claim.report)) return res.status(200).json({ report: claim.report, generatedAt: claim.generated_at, model: claim.model, cached: true, inputHash: hash })
    if (claim.state !== 'claimed') {
      res.setHeader('Retry-After', claim.state === 'daily_limit' ? '3600' : '60')
      const error = claim.state === 'daily_limit' ? 'На сегодня использованы 2 новых ИИ-разбора. Сохранённые разборы доступны без лимита.' : claim.state === 'pending' ? 'Этот разбор уже создаётся. Откройте его чуть позже.' : 'Нужно немного подождать перед новым ИИ-разбором. Попробуйте позже.'
      return res.status(429).json({ error })
    }
    requestId = claim.request_id
    const report = await generateRecommendation(summary, process.env.OPENROUTER_API_KEY.trim(), model)
    const generatedAt = new Date().toISOString()
    await request(`${reportPath()}&request_id=eq.${requestId}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', report, generated_at: generatedAt }) })
    return res.status(200).json({ report, generatedAt, model, cached: false, inputHash: hash })
  } catch (e) {
    if (requestId) { try { await request(`${reportPath()}&request_id=eq.${requestId}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) }) } catch { /* Reservation remains bounded by its expiry and daily quota. */ } }
    return res.status(e.status || 502).json({ error: e.name === 'TimeoutError' ? 'Разбор занял слишком много времени. Попробуйте позже.' : e.message || 'ИИ-разбор временно недоступен.' })
  }
}

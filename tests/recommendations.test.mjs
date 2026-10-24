import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildAnalysis, validReport } from '../shared/analysis.js'
import { analysisIdentity, generateRecommendation } from '../server/recommendations.mjs'
import handler from '../api/recommendations.js'
import { emptyData } from '../src/model.ts'

const report = { summary: 'Есть одна тренировка.', training: ['Записаны выполненные подходы.'], nutrition: [], nextSteps: ['Продолжайте вести записи.'], missingData: ['Нужна динамика за несколько тренировок.'] }
const data = () => ({ ...emptyData(), workouts: [{ id: 'private-workout-id', date: '2026-10-24', title: 'Private workout title', exercises: [{ id: 'private-exercise-id', name: 'Жим', sets: [{ id: 's1', done: true, weight: '40,5', reps: '10' }, { id: 's2', done: false, weight: '50', reps: '8' }] }] }] })
const requestBody = () => ({ data: data(), profile: { goal: 'strength', weightKg: 75 }, days: 7, endDate: '2026-10-24', consent: true })
function signature() {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 12345, first_name: 'PRIVATE NAME', username: 'PRIVATE USERNAME' }) })
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update('test-bot-token').digest()
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
  return `tma ${params}`
}
const response = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(n) { this.code = n; return this }, json(v) { this.body = v; return this } })
const json = value => ({ ok: true, status: 200, json: async () => value })
async function environment(fn) {
  const names = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL']
  const original = Object.fromEntries(names.map(k => [k, process.env[k]])); const originalFetch = globalThis.fetch
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: 'test-bot-token', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'openrouter/free' })
  try { await fn() } finally { globalThis.fetch = originalFetch; for (const [k, v] of Object.entries(original)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
}

test('summary counts only completed sets in selected period; identifiers and source files are omitted', () => {
  const d = data(); d.workouts.unshift({ ...structuredClone(d.workouts[0]), id: 'old', date: '2026-10-17' })
  d.nutrition = [{ date: '2026-10-24', nutrients: { calories: 1000, protein: 0, fat: null }, foods: [{ name: 'PRIVATE PRODUCT', portion: 'PRIVATE PORTION', meal: 'Обед', nutrients: {} }], source: 'PRIVATE FILE.csv' }]
  const s = buildAnalysis(d, { goal: 'strength' }, 7, '2026-10-24')
  assert.equal(s.period.start, '2026-10-18'); assert.equal(s.training.sessions, 1); assert.equal(s.training.completedSets, 1); assert.equal(s.training.volumeKg, 405)
  assert.equal(s.nutrition.averages.calories.value, 1000); assert.equal(s.nutrition.averages.calories.recordedDays, 1)
  assert.equal(s.nutrition.averages.protein.value, 0); assert.equal(s.nutrition.averages.fat.value, null)
  const text = JSON.stringify(s)
  for (const privateText of ['private-workout-id', 'Private workout title', 'private-exercise-id', 'PRIVATE FILE', 'PRIVATE PRODUCT']) assert.ok(!text.includes(privateText))
  assert.throws(() => buildAnalysis(d, { goal: 'strength' }, 7, '2026-02-30'))
})
test('cache identity changes with goal, weight, dates, input values and model', () => {
  const b = requestBody(); const s = buildAnalysis(b.data, b.profile, b.days, b.endDate); const hash = analysisIdentity(s, 'openrouter/free')
  assert.equal(hash, analysisIdentity(buildAnalysis(structuredClone(b.data), b.profile, b.days, b.endDate), 'openrouter/free'))
  assert.notEqual(hash, analysisIdentity(buildAnalysis(b.data, { goal: 'muscle', weightKg: 75 }, b.days, b.endDate), 'openrouter/free'))
  assert.notEqual(hash, analysisIdentity({ ...s, weightKg: 76 }, 'openrouter/free'))
  assert.notEqual(hash, analysisIdentity(s, 'example/model:free'))
  assert.equal(validReport({ ...report, training: ['a'.repeat(1801)] }), false)
})
test('API rejects unsigned requests and absent consent before accessing database/provider', async () => environment(async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('Unexpected network request') }
  const unsigned = response(); await handler({ method: 'POST', headers: {}, body: requestBody() }, unsigned)
  assert.equal(unsigned.code, 401); assert.equal(unsigned.headers['Cache-Control'], 'no-store')
  const noConsent = response(); await handler({ method: 'POST', headers: { authorization: signature() }, body: { ...requestBody(), consent: false } }, noConsent)
  assert.equal(noConsent.code, 400); assert.equal(calls, 0)
  const empty = response(); await handler({ method: 'POST', headers: { authorization: signature() }, body: { ...requestBody(), data: emptyData() } }, empty)
  assert.equal(empty.code, 400); assert.equal(calls, 0)
}))
test('cached report is isolated by signed user and returned without provider key or quota use', async () => environment(async () => {
  delete process.env.OPENROUTER_API_KEY
  let calls = 0; globalThis.fetch = async url => { calls++; assert.ok(url.includes('telegram_user_id=eq.12345')); assert.ok(url.includes('status=eq.completed')); return json([{ report, generated_at: '2026-10-24T10:00:00Z', model: 'openrouter/free' }]) }
  const res = response(); await handler({ method: 'POST', headers: { authorization: signature() }, body: requestBody() }, res)
  assert.equal(res.code, 200); assert.equal(res.body.cached, true); assert.equal(calls, 1)
}))
test('daily limit refuses generation before provider call', async () => environment(async () => {
  let calls = 0; globalThis.fetch = async (url, options) => {
    calls++; if (url.includes('/ai_reports?')) return json([])
    assert.ok(url.endsWith('/rpc/claim_ai_report')); assert.equal(JSON.parse(options.body).p_user_id, '12345'); return json({ state: 'daily_limit' })
  }
  const res = response(); await handler({ method: 'POST', headers: { authorization: signature() }, body: requestBody() }, res)
  assert.equal(res.code, 429); assert.equal(calls, 2); assert.ok(res.headers['Retry-After'])
}))
test('OpenRouter requests enforce free models, zero prices and strict provider privacy', async () => environment(async () => {
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'openrouter/free'); assert.equal(body.provider.data_collection, 'deny'); assert.equal(body.provider.zdr, undefined); assert.equal(body.provider.require_parameters, true)
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 })
    assert.ok(!body.messages[1].content.includes('PRIVATE NAME')); assert.ok(!body.messages[1].content.includes('12345'))
    return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(report) } }] })
  }
  const b = requestBody(); assert.deepEqual(await generateRecommendation(buildAnalysis(b.data, b.profile, b.days, b.endDate), 'sk-or-test', 'openrouter/free'), report)
  await assert.rejects(() => generateRecommendation({}, 'sk-or-test', 'paid/model'))
  assert.equal(calls, 1)
}))
test('failed provider call marks reservation failed and never returns a fabricated report', async () => environment(async () => {
  const updates = []
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('openrouter.ai/')) return { ok: false, status: 429 }
    if (url.endsWith('/rpc/claim_ai_report')) return json({ state: 'claimed', request_id: 'test-request' })
    if (options.method === 'PATCH') { updates.push(JSON.parse(options.body)); assert.ok(url.includes('request_id=eq.test-request')); return json(null) }
    return json([])
  }
  const res = response(); await handler({ method: 'POST', headers: { authorization: signature() }, body: requestBody() }, res)
  assert.equal(res.code, 429); assert.deepEqual(updates, [{ status: 'failed' }]); assert.equal(res.body.report, undefined)
}))
test('successful report is saved only for the verified user and reservation', async () => environment(async () => {
  let providerCalls = 0; let saved = false
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('openrouter.ai/')) { providerCalls++; return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(report) } }] }) }
    if (url.endsWith('/rpc/claim_ai_report')) return json({ state: 'claimed', request_id: 'request-id' })
    if (options.method === 'PATCH') { assert.ok(url.includes('telegram_user_id=eq.12345')); assert.ok(url.includes('request_id=eq.request-id')); const update = JSON.parse(options.body); assert.equal(update.status, 'completed'); assert.deepEqual(update.report, report); saved = true; return json(null) }
    return json([])
  }
  const res = response(); await handler({ method: 'POST', headers: { authorization: signature() }, body: requestBody() }, res)
  assert.equal(res.code, 200); assert.equal(res.body.cached, false); assert.equal(providerCalls, 1); assert.ok(saved)
}))
test('truncated or malformed generated text is rejected', async () => environment(async () => {
  globalThis.fetch = async () => json({ choices: [{ finish_reason: 'length', message: { content: '{' } }] })
  await assert.rejects(() => generateRecommendation({}, 'sk-or-test', 'openrouter/free'))
  globalThis.fetch = async () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"summary":"only summary"}' } }] })
  await assert.rejects(() => generateRecommendation({}, 'sk-or-test', 'openrouter/free'))
}))

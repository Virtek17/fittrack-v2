import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { parseFatSecret, csvRows } from '../src/fatsecret.ts'
import { blankSet, emptyData, validSet, previousExercise, volume } from '../src/model.ts'
import { isData } from '../shared/validate.js'
import { verifyTelegram } from '../server/auth.mjs'
import handler from '../api/state.js'
import sessionHandler from '../api/session.js'
import { supabaseConfig } from '../server/supabase.mjs'
import { sameDiary } from '../shared/same-diary.js'

const csv = `# Food Diary Report - Detailed Report,"воскресенье, октября 18, 2026","суббота, октября 24, 2026"
Cреднесуточная норма,Кал ( ккал),Жир( г),Углев( г),Белк( г)
Всего,1096,"38,72","110,73","71,67"
Дата,Кал ( ккал),Жир( г),Н/жир( г),Углев( г),Клетч( г),Сахар( г),Белк( г),Натри( мг),Холес( мг),Калий( мг)
"суббота, октября 24, 2026",1096,"38,72","10,825","110,73","5,1","27,94","71,67",1559,797,1059
 Завтрак,434,"24,59","7,058","14,15","0,8","3,09","36,69",520,711,385
  Котлета Куриная,214,"9,68","2,41","12,99","0,8","1,93","17,82",310,77,184
   1 котлета
  Яйцо,220,"14,91","4,648","1,16",0,"1,16","18,87",210,634,201
   150 г
 Обед,81,0,0,"20,25",,18,0,,,
  Double You Энергетик,81,0,0,"20,25",,18,0,,,
   450 г
 Ужин,581,"14,13","3,767","76,33","4,3","6,85","34,98",1039,86,674
  Шаурма с Курицей,581,"14,13","3,767","76,33","4,3","6,85","34,98",1039,86,674
   1 Шаурма
Всего,1096,"38,72","10,825","110,73","5,1","27,94","71,67",1559,797,1059`
test('FatSecret: actual date, no doubled totals, portions, null versus zero', () => {
  const days = parseFatSecret(csv, 'test.csv')
  assert.equal(days.length, 1); const d = days[0]
  assert.equal(d.date, '2026-10-24'); assert.equal(d.nutrients.calories, 1096)
  assert.equal(d.foods.length, 4); assert.equal(d.foods.reduce((s, f) => s + f.nutrients.calories, 0), 1096)
  assert.equal(d.foods[1].portion, '150 г'); assert.equal(d.foods[2].nutrients.fiber, null)
  assert.equal(d.foods[2].nutrients.protein, 0); assert.equal(d.nutrients.protein, 71.67)
  assert.ok(isData({ ...emptyData(), nutrition: days }))
})
test('CSV: BOM, CRLF, quoted commas and escaped quotes', () => {
  assert.equal(parseFatSecret('\uFEFF' + csv.replaceAll('\n', '\r\n'), 'test.csv').length, 1)
  assert.deepEqual(csvRows('"a, b","two ""quotes"""\r\n'), [['a, b', 'two "quotes"']])
  assert.throws(() => csvRows('"broken'))
  assert.throws(() => parseFatSecret('not a report', 'test.csv'))
  assert.throws(() => parseFatSecret(csv.replaceAll('октября 24', 'октября 32'), 'test.csv'))
})
test('approach validation accepts bodyweight and decimal commas, rejects empty/negative/fractional reps', () => {
  assert.ok(validSet({ ...blankSet('10'), weight: '0' }))
  assert.ok(validSet({ ...blankSet('8'), weight: '42,5' }))
  for (const [weight, reps] of [['', '10'], ['-1', '10'], ['20', '1.5'], ['abc', '10'], ['20', '0']]) assert.equal(validSet({ ...blankSet(reps), weight }), false)
})
test('history uses exercise identity, excludes current and future; volume counts completed sets', () => {
  const w = { id: 'one', title: 'A', date: '2026-10-20', exercises: [{ id: 'bench', name: 'Жим', sets: [{ id: 's', reps: '10', weight: '40', done: true }, { ...blankSet('8'), weight: '45' }] }] }
  const current = { ...w, id: 'current', date: '2026-10-24' }
  assert.equal(previousExercise([w, current, { ...w, id: 'future', date: '2026-10-25' }], 'bench', current).id, 'one')
  assert.equal(volume(w), 400)
})
test('backup validation rejects malformed nested records', () => {
  assert.ok(isData(emptyData()))
  assert.equal(isData({ ...emptyData(), workouts: [{}] }), false)
  assert.equal(isData({ ...emptyData(), nutrition: [{ date: 'wrong' }] }), false)
  assert.ok(isData({ ...emptyData(), draft: { id: 'draft', title: '', date: '', exercises: [] } }))
})
test('unchanged JSONB snapshots skip writes despite object key order; changed values and array order differ', () => {
  const local = { ...emptyData(), exerciseNames: { b: 'Жим', a: 'Присед' } }
  const remote = Object.fromEntries(Object.entries({ ...local, exerciseNames: { a: 'Присед', b: 'Жим' } }).reverse())
  assert.ok(sameDiary(local, remote))
  assert.equal(sameDiary(local, { ...local, exerciseNames: { b: 'Жим', a: 'Тяга' } }), false)
  const foods = parseFatSecret(csv, 'test.csv')
  assert.equal(sameDiary({ ...local, nutrition: foods }, { ...local, nutrition: [{ ...foods[0], foods: [...foods[0].foods].reverse() }] }), false)
})
function signed(token, now) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(now / 1000)), user: JSON.stringify({ id: 12345, first_name: 'Test' }), query_id: 'test' })
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex')); return params.toString()
}
test('Telegram signature: valid user, forgery, expired and future sessions', () => {
  const now = Date.now(); const token = 'test-token'; const value = signed(token, now)
  assert.equal(verifyTelegram(value, token, now), '12345')
  assert.throws(() => verifyTelegram(value.replace('12345', '99999'), token, now))
  assert.throws(() => verifyTelegram(value, 'wrong-token', now))
  assert.throws(() => verifyTelegram(value, token, now + 3601000))
  assert.throws(() => verifyTelegram(value, token, now - 60000))
  assert.throws(() => verifyTelegram(value + '&user=bad', token, now))
})
test('API binds requests to signed Telegram user and handles optimistic conflicts', async () => {
  const original = { token: process.env.TELEGRAM_BOT_TOKEN, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, fetch: globalThis.fetch }
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'; process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
  const response = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(n) { this.code = n; return this }, json(v) { this.body = v; return this } })
  try {
    let called = false
    globalThis.fetch = async () => { called = true; throw new Error('unexpected fetch') }
    const denied = response(); await handler({ method: 'GET', headers: {} }, denied)
    assert.equal(denied.code, 401); assert.equal(called, false)
    assert.equal(denied.headers['Cache-Control'], 'no-store')
    const headers = { authorization: `tma ${signed('test-token', Date.now())}` }
    globalThis.fetch = async (url, options) => { assert.ok(url.endsWith('/rpc/save_diary')); const body = JSON.parse(options.body); assert.equal(body.p_user_id, '12345'); assert.equal(body.p_revision, 1); return { ok: true, json: async () => null } }
    const conflict = response(); await handler({ method: 'PUT', headers, body: { data: emptyData(), revision: 1, userId: '99999' } }, conflict)
    assert.equal(conflict.code, 409)
    const invalid = response(); await handler({ method: 'PUT', headers, body: { data: { ...emptyData(), workouts: [{}] }, revision: 1 } }, invalid)
    assert.equal(invalid.code, 400)
    globalThis.fetch = async url => { assert.ok(url.includes('telegram_user_id=eq.12345')); return { ok: true, json: async () => [{ data: emptyData(), revision: 2 }] } }
    const loaded = response(); await handler({ method: 'GET', headers }, loaded); assert.equal(loaded.body.revision, 2)
    assert.equal(loaded.headers['Cache-Control'], 'no-store')
  } finally {
    globalThis.fetch = original.fetch
    for (const [key, value] of [['TELEGRAM_BOT_TOKEN', original.token], ['SUPABASE_URL', original.url], ['SUPABASE_SERVICE_ROLE_KEY', original.key]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
test('automatic registration only accepts signed Telegram data and keeps account identity server-side', async () => {
  const original = { token: process.env.TELEGRAM_BOT_TOKEN, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, fetch: globalThis.fetch }
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'; process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test-only'
  const response = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(n) { this.code = n; return this }, json(v) { this.body = v; return this } })
  try {
    assert.equal(supabaseConfig().headers.Authorization, undefined)
    let calls = 0
    globalThis.fetch = async (url, options) => {
      calls++
      assert.ok(url.includes('/app_users?on_conflict=telegram_user_id'))
      const profile = JSON.parse(options.body)
      assert.equal(profile.telegram_user_id, 12345); assert.equal(profile.first_name, 'Test')
      assert.equal(options.headers.apikey, 'sb_secret_test-only')
      assert.ok(!JSON.stringify(profile).includes('test-token'))
      return { ok: true }
    }
    const denied = response(); await sessionHandler({ method: 'GET', headers: {} }, denied)
    assert.equal(denied.code, 401); assert.equal(calls, 0)
    const allowed = response(); await sessionHandler({ method: 'GET', headers: { authorization: `tma ${signed('test-token', Date.now())}` } }, allowed)
    assert.equal(allowed.code, 200); assert.equal(allowed.body.user.id, 12345); assert.equal(calls, 1)
    assert.equal(allowed.body.user.first_name, 'Test')
    assert.equal(allowed.headers['Cache-Control'], 'no-store')
  } finally {
    globalThis.fetch = original.fetch
    for (const [key, value] of [['TELEGRAM_BOT_TOKEN', original.token], ['SUPABASE_URL', original.url], ['SUPABASE_SECRET_KEY', original.key]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})

const base = new URL(process.argv[2])
if (base.protocol !== 'https:') throw new Error('HTTPS deployment URL required')
let failed = false
const check = (condition, label) => { console.log(`${condition ? 'OK' : 'FAIL'} ${label}`); if (!condition) failed = true }
try {
  const index = await fetch(base, { signal: AbortSignal.timeout(20000) })
  const html = await index.text()
  check(index.status === 200 && html.includes('<div id="root">'), 'application serves React HTML')
  check(index.headers.get('cache-control')?.includes('must-revalidate'), 'HTML checks for updates')
  const assets = [...new Set(html.match(/\/assets\/[^"'<>\s]+\.(?:js|css)/g) ?? [])]
  check(assets.length >= 2, 'versioned JS and CSS assets found')
  for (const path of assets) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) })
    const content = await response.text()
    check(response.status === 200, `${path} accessible`)
    check(response.headers.get('cache-control')?.includes('immutable'), `${path} immutable cache`)
    for (const key of ['SUPABASE_SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'OPENROUTER_API_KEY']) {
      if (process.env[key]) check(!content.includes(process.env[key]), `${key} absent from ${path}`)
    }
  }
  for (const path of ['/api/session', '/api/state', '/api/recommendations']) {
    const response = await fetch(new URL(path, base), { method: path === '/api/recommendations' ? 'POST' : 'GET', signal: AbortSignal.timeout(20000) })
    check(response.status === 401, `${path} requires Telegram authentication`)
    check(response.headers.get('cache-control')?.includes('no-store'), `${path} excluded from cache`)
    check(response.headers.get('content-type')?.includes('application/json'), `${path} serves JSON`)
  }
} catch (e) { console.error(`Network check failed: ${e.name}`); failed = true }
process.exitCode = failed ? 1 : 0

import { createServer } from 'vite'
import stateHandler from '../api/state.js'
import sessionHandler from '../api/session.js'
import recommendationsHandler from '../api/recommendations.js'

async function apiMiddleware(req, res, next) {
  const path = req.url?.split('?')[0]
  const handler = path === '/api/state' ? stateHandler : path === '/api/session' ? sessionHandler : path === '/api/recommendations' ? recommendationsHandler : null
  if (!handler) return next()
  res.status = status => { res.statusCode = status; return res }
  res.json = body => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); return res }
  try {
    if (req.method === 'PUT' || req.method === 'POST') {
      const chunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 2_000_000) return res.status(413).json({ error: 'Размер дневника превышает 2 МБ.' })
        chunks.push(chunk)
      }
      try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return res.status(400).json({ error: 'Некорректный JSON.' }) }
    }
    await handler(req, res)
  } catch { if (!res.writableEnded) res.status(500).json({ error: 'Сервер временно недоступен.' }) }
}
const vite = await createServer({
  server: { host: '127.0.0.1', port: 5173 },
  plugins: [{ name: 'fittrack-local-api', configureServer(server) { server.middlewares.use(apiMiddleware) } }],
})
await vite.listen()
vite.printUrls()
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await vite.close(); process.exit(0) })

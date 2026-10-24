const url = new URL(process.argv[2])
if (url.protocol !== 'https:') throw new Error('Mini App requires HTTPS')
const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing')
async function telegram(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  })
  const payload = await response.json()
  if (!response.ok || !payload.ok) throw new Error('Telegram rejected request')
  return payload.result
}
try {
  const me = await telegram('getMe')
  if (me.username?.toLowerCase() !== 'fittrackv2_bot') throw new Error('Unexpected bot identity')
  if (process.argv.includes('--apply')) {
    await telegram('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть FitTrack', web_app: { url: url.href } } })
  }
  const menu = await telegram('getChatMenuButton')
  if (process.argv.includes('--apply') && menu.web_app?.url !== url.href) throw new Error('Menu verification failed')
  console.log(JSON.stringify({ bot: me.username, menu }, null, 2))
} catch (e) { console.error(`Bot configuration failed: ${e.name}`); process.exitCode = 1 }

import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyTelegram(initData, token, now = Date.now()) {
  return String(verifyTelegramUser(initData, token, now).id)
}

export function verifyTelegramUser(initData, token, now = Date.now()) {
  if (typeof initData !== 'string' || !token || initData.length > 16384) throw new Error('Откройте приложение заново через Telegram.')
  const params = new URLSearchParams(initData)
  const keys = [...params.keys()]
  if (new Set(keys).size !== keys.length) throw new Error('Некорректные данные авторизации.')
  const hash = params.get('hash')
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Некорректная подпись Telegram.')
  params.delete('hash')
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const expected = createHmac('sha256', secret).update(check).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new Error('Не удалось подтвердить пользователя Telegram.')
  const authDate = Number(params.get('auth_date'))
  if (!Number.isInteger(authDate) || now / 1000 - authDate > 3600 || authDate > now / 1000 + 30) throw new Error('Сессия истекла. Откройте приложение заново через Telegram.')
  let user
  try { user = JSON.parse(params.get('user')) } catch { throw new Error('Некорректный пользователь.') }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error('Некорректный пользователь.')
  return { id: user.id, first_name: typeof user.first_name === 'string' ? user.first_name.slice(0, 100) : '', username: typeof user.username === 'string' ? user.username.slice(0, 100) : null }
}

import { useEffect, useRef, useState } from 'react'
import { buildAnalysis, GOALS, validProfile, validReport } from '../shared/analysis.js'
import type { AnalysisProfile, AnalysisReport } from '../shared/analysis.js'
import type { Data } from './model'
import { dateLabel, today } from './model'
import './Recommendations.css'

type Saved = { input: string; report: AnalysisReport; generatedAt: string; model: string }
const cacheKey = () => `fittrack.analysis.v1.${window.Telegram?.WebApp.initDataUnsafe?.user?.id ?? 'local'}`
const readSaved = (): Saved | null => {
  try { const value = JSON.parse(localStorage.getItem(cacheKey()) ?? 'null'); return value && typeof value.input === 'string' && typeof value.generatedAt === 'string' && validReport(value.report) ? value : null } catch { return null }
}

export default function Recommendations({ data, onProfileChange, authenticated }: { data: Data; onProfileChange: (profile: AnalysisProfile) => void; authenticated: boolean }) {
  const [goal, setGoal] = useState<AnalysisProfile['goal']>(data.aiProfile?.goal ?? 'maintain')
  const [weight, setWeight] = useState(data.aiProfile?.weightKg?.toString() ?? '')
  const [days, setDays] = useState(7)
  const [endDate, setEndDate] = useState(today)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState<Saved | null>(readSaved)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { controller.current?.abort() }, [])
  const profile: AnalysisProfile = { goal, ...(weight.trim() ? { weightKg: Number(weight.replace(',', '.')) } : {}) }
  let summary: ReturnType<typeof buildAnalysis> | null = null
  try { summary = buildAnalysis(data, profile, days, endDate) } catch { /* Validation is shown alongside the form. */ }
  const input = summary ? JSON.stringify(summary) : ''
  const current = saved?.input === input ? saved : null
  const hasData = !!summary && (summary.training.sessions > 0 || summary.nutrition.recordedDays > 0)
  const generate = async () => {
    if (!summary || !validProfile(profile) || !consent || !authenticated || !hasData || busy) return
    if (current) { setNotice('Показываем сохранённый разбор. Новый запрос не нужен.'); return }
    setBusy(true); setError(''); setNotice('')
    const abort = new AbortController(); controller.current = abort
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST', cache: 'no-store', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `tma ${window.Telegram?.WebApp.initData ?? ''}` },
        body: JSON.stringify({ data, profile, days, endDate, consent: true }),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? 'Разбор пока недоступен.')
      if (!validReport(value.report) || typeof value.generatedAt !== 'string') throw new Error('Не удалось прочитать ответ ИИ.')
      const result: Saved = { input, report: value.report, generatedAt: value.generatedAt, model: value.model }
      setSaved(result)
      try { localStorage.setItem(cacheKey(), JSON.stringify(result)) } catch { /* Server retains the report; local storage is optional. */ }
      setNotice(value.cached ? 'Найден сохранённый разбор. Квота не потрачена.' : 'Разбор готов и сохранён.')
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось получить разбор.') } finally { if (!abort.signal.aborted) setBusy(false) }
  }
  const number = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('ru', { maximumFractionDigits: 1 })
  const changeProfile = (next: AnalysisProfile) => { if (validProfile(next)) onProfileChange(next) }
  return <>
    <div className="heading"><div><h1>ИИ-разбор</h1></div></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="layout"><div className="stack">
      <section className="card form"><h2>Что хотите улучшить?</h2><div className="form-grid"><label className="field">Цель<select disabled={busy} value={goal} onChange={e => { const next = e.target.value as AnalysisProfile['goal']; setGoal(next); changeProfile({ ...profile, goal: next }) }}>{Object.entries(GOALS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="field">Вес тела, кг · необязательно<input disabled={busy} inputMode="decimal" placeholder="Например, 75" maxLength={6} value={weight} onChange={e => { setWeight(e.target.value); const value = e.target.value.trim(); changeProfile({ goal, ...(value ? { weightKg: Number(value.replace(',', '.')) } : {}) }) }} /></label></div>
        {!validProfile(profile) && <p className="ai-warning">Укажите вес от 20 до 400 кг или оставьте поле пустым.</p>}
        <div className="form-grid"><label className="field">Период<select disabled={busy} value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>7 дней</option><option value={28}>28 дней</option></select></label><label className="field">По какую дату<input disabled={busy} type="date" max={today()} value={endDate} onChange={e => setEndDate(e.target.value)} /></label></div>
        {summary && <div className="ai-overview"><p className="muted">{dateLabel(summary.period.start)} — {dateLabel(summary.period.end)}</p><div className="stats"><div className="stat"><strong>{summary.training.sessions}</strong><span>тренировок</span></div><div className="stat"><strong>{summary.training.completedSets}</strong><span>подходов</span></div><div className="stat"><strong>{summary.nutrition.recordedDays}/{days}</strong><span>дней питания</span></div></div><div className="ai-nutrients"><span>Средние по записанным дням</span><strong>{number(summary.nutrition.averages.calories.value)} ккал · Б {number(summary.nutrition.averages.protein.value)} · Ж {number(summary.nutrition.averages.fat.value)} · У {number(summary.nutrition.averages.carbs.value)} г</strong></div></div>}
        {!hasData && <p className="note">Для разбора добавьте завершённую тренировку или импортируйте питание за выбранный период.</p>}
        {!authenticated && <p className="ai-warning">Для получения разбора откройте приложение из Telegram-бота и дождитесь входа.</p>}
        <label className="ai-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /><span>Разрешаю отправить сводку в OpenRouter и выбранному поставщику модели. Она включает цель, указанный вес тела, показатели упражнений и средние нутриенты. Имя и Telegram ID в сводку не входят. Поставщик может временно хранить запрос по своим правилам.</span></label>
        <button className="primary wide" disabled={busy || !authenticated || !consent || !hasData || !summary || endDate > today()} onClick={() => void generate()}>{busy ? 'Создаём разбор…' : current ? 'Разбор уже сохранён' : 'Получить рекомендации'}</button>
        <p className="note">До 2 новых запросов за сутки UTC, включая неудачные попытки. Сохранённые результаты доступны повторно без расхода квоты.</p>
      </section>
      {saved && !current && <div className="notice">Параметры или данные отличаются от прошлого разбора. Для актуальных рекомендаций создайте новый.</div>}
      {current && <section className="card ai-report"><div className="row"><h2>Ваш разбор</h2><span className="badge">Сохранён</span></div><p className="muted">{new Date(current.generatedAt).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p><p className="ai-summary">{current.report.summary}</p>{([['training', 'Тренировки'], ['nutrition', 'Питание'], ['nextSteps', 'Следующие шаги'], ['missingData', 'Что стоит уточнить']] as const).map(([key, label]) => current.report[key].length > 0 && <div className="ai-report-section" key={key}><h3>{label}</h3><ul>{current.report[key].map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}<div className="divider" /><p className="note">Ответ сгенерирован ИИ и может ошибаться. Это общие наблюдения по дневнику; медицинские назначения в разбор не входят.</p></section>}
    </div></div>
  </>
}

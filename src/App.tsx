import { Button } from 'pixel-retroui'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { blankSet, dateLabel, emptyData, previousExercise, today, uid, validSet, volume } from './model'
import type { Data, Exercise, NutritionDay, Template, Workout } from './model'
import { parseFatSecret } from './fatsecret'
import { isData } from '../shared/validate.js'
import { sameDiary } from '../shared/same-diary.js'
import './App.css'
import Recommendations from './Recommendations'

type IconName = 'workout' | 'template' | 'history' | 'food' | 'analysis' | 'plus' | 'arrow' | 'check' | 'copy' | 'trash' | 'upload' | 'edit' | 'close'
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    analysis: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
    workout: <><path d="M6 5v14M3 8v8M18 5v14M21 8v8M6 12h12" /></>,
    template: <><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 3h6v4H9zM9 12h6M9 16h4" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" /></>,
    food: <><path d="M7 3v7M3 3v5a4 4 0 0 0 8 0V3M7 12v9M20 3c-5 2-5 9 0 9V3Zm0 9v9" /></>,
    plus: <path d="M12 5v14M5 12h14" />, arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />, copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 4H4v12" /></>,
    trash: <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></>,
    edit: <><path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" /></>, close: <path d="m6 6 12 12M6 18 18 6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) { return <Button className="iconbutton" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size={17} /></Button> }
function Empty({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) { return <div className="empty"><div className="empty-icon"><Icon name={icon} size={26} /></div><h3>{title}</h3>{children}</div> }
const fmt = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('ru', { maximumFractionDigits: 2 })
const tg = () => window.Telegram?.WebApp
const storageKey = () => `fittrack.v1.${tg()?.initDataUnsafe?.user?.id ?? 'local'}`
function initialState(): { data: Data; error: string } {
  try { const raw = localStorage.getItem(storageKey()); if (!raw) return { data: emptyData(), error: '' }; const data = JSON.parse(raw); if (!isData(data)) throw new Error(); return { data, error: '' } }
  catch { return { data: emptyData(), error: 'Не удалось прочитать сохранённые данные. Исходная копия не перезаписана. Сохраните её перед продолжением.' } }
}
function Macros({ day }: { day: NutritionDay }) { return <div className="nutrition-mini">{[['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([key, title]) => <div key={key}><b>{fmt(day.nutrients[key])}</b><span>{title}</span></div>)}</div> }

export default function App() {
  const [initial] = useState(initialState)
  const [data, setData] = useState<Data>(initial.data)
  const [storageError, setStorageError] = useState(initial.error)
  const [storageBlocked, setStorageBlocked] = useState(!!initial.error)
  const [tab, setTab] = useState<'workout' | 'template' | 'history' | 'food' | 'analysis'>('workout')
  const [editing, setEditing] = useState<Template | null>(null)
  const [exerciseName, setExerciseName] = useState('')
  const [preview, setPreview] = useState<NutritionDay[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState('')
  const [openNutritionDays, setOpenNutritionDays] = useState<Record<string, boolean>>({})
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: () => void } | null>(null)
  const [cloud, setCloud] = useState('')
  const [busy, setBusy] = useState(false)
  const [account, setAccount] = useState<{ status: 'local' | 'loading' | 'ready' | 'error'; name?: string }>({ status: tg()?.initData ? 'loading' : 'local' })
  const revision = useRef<number | null>((() => { try { const value = localStorage.getItem(`${storageKey()}.revision`); return value === null ? null : Number(value) } catch { return null } })())
  const rememberRevision = (value: number) => { revision.current = value; try { localStorage.setItem(`${storageKey()}.revision`, String(value)) } catch { /* The next session will ask to reload the cloud copy. */ } }
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data; if (storageBlocked) return; try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch { queueMicrotask(() => setStorageError('Не удалось сохранить на устройстве. Экспортируйте резервную копию.')); } }, [data, storageBlocked])
  useEffect(() => { const app = tg(); app?.ready(); app?.expand(); app?.setHeaderColor?.('#f5f1e5'); app?.setBackgroundColor?.('#f5f1e5') }, [])
  useEffect(() => {
    const initData = tg()?.initData
    if (!initData) return
    const controller = new AbortController()
    const login = async () => {
      try {
        const headers = { Authorization: `tma ${initData}` }
        const response = await fetch('/api/session', { headers, signal: controller.signal, cache: 'no-store' })
        const session = await response.json()
        if (!response.ok) throw new Error(session.error ?? 'Не удалось войти через Telegram.')
        setAccount({ status: 'ready', name: session.user.first_name || 'Спортсмен' })
        const result = await fetch('/api/state', { headers, signal: controller.signal, cache: 'no-store' })
        const remote = await result.json()
        if (!result.ok) throw new Error(remote.error ?? 'Не удалось загрузить дневник.')
        if (remote.data) {
          if (!isData(remote.data)) throw new Error('Не удалось прочитать облачный дневник.')
          const local = dataRef.current
          const isEmpty = !local.draft && !local.workouts.length && !local.templates.length && !local.nutrition.length
          if (isEmpty && !initial.error) {
            setData(remote.data)
            revision.current = remote.revision
            try { localStorage.setItem(`${storageKey()}.revision`, String(remote.revision)) } catch { /* Local backup remains available via export. */ }
            setCloud('Загружено из облака')
          } else if (revision.current !== remote.revision) {
            setMessage('В облаке есть другая версия дневника. Сохраните резервную копию и нажмите «Синхронизировать», чтобы выбрать облачную версию.')
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return
        setAccount({ status: 'error' })
        setError(e instanceof Error ? e.message : 'Вход временно недоступен.')
      }
    }
    void login()
    return () => controller.abort()
  }, [initial])
  const navigate = (next: typeof tab) => { setTab(next); setError(''); setMessage(''); window.scrollTo({ top: 0 }) }
  const update = (fn: (d: Data) => Data) => setData(fn)
  const draft = data.draft
  const draftUpdate = (fn: (w: Workout) => Workout) => update(d => ({ ...d, draft: d.draft ? fn(d.draft) : null }))
  const exerciseUpdate = (id: string, fn: (e: Exercise) => Exercise) => draftUpdate(w => ({ ...w, exercises: w.exercises.map(e => e.id === id ? fn(e) : e) }))
  const start = (template?: Template) => {
    if (draft) { navigate('workout'); setMessage('Продолжите или завершите текущую тренировку перед началом новой.'); return }
    update(d => ({ ...d, draft: { id: uid(), title: template?.title ?? 'Моя тренировка', date: today(), exercises: template?.exercises.map(e => ({ id: e.id, name: e.name, sets: Array.from({ length: e.sets }, () => blankSet(String(e.reps))) })) ?? [] } })); navigate('workout')
  }
  const addExercise = () => {
    const name = exerciseName.trim(); if (!name) return
    const id = Object.keys(data.exerciseNames).find(k => data.exerciseNames[k].toLocaleLowerCase() === name.toLocaleLowerCase()) ?? uid()
    if (draft?.exercises.some(e => e.id === id)) { setError('Это упражнение уже есть. Добавьте подход в его карточке.'); return }
    update(d => ({ ...d, exerciseNames: { ...d.exerciseNames, [id]: name }, draft: d.draft ? { ...d.draft, exercises: [...d.draft.exercises, { id, name, sets: [blankSet()] }] } : null })); setExerciseName(''); setError('')
  }
  const finish = () => {
    if (!draft) return
    if (!draft.title.trim() || !draft.date || draft.date > today()) { setError('Укажите название и дату не позднее сегодняшней.'); return }
    const exercises = draft.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.done && validSet(s)) })).filter(e => e.sets.length)
    if (!exercises.length) { setError('Заполните вес и повторения хотя бы одного подхода и отметьте его галочкой.'); return }
    const save = () => { update(d => ({ ...d, workouts: [{ ...draft, title: draft.title.trim(), exercises }, ...d.workouts.filter(w => w.id !== draft.id)], draft: null })); setMessage('Тренировка сохранена. Хорошая работа!'); setError('') }
    if (draft.exercises.some(e => e.sets.some(s => !s.done))) setConfirm({ title: 'Завершить тренировку?', text: 'В историю попадут только подходы, отмеченные галочкой. Невыполненные строки не сохранятся.', action: save }); else save()
  }
  const saveTemplate = () => {
    if (!editing) return
    if (!editing.title.trim() || !editing.exercises.length || editing.exercises.some(e => !e.name.trim() || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 30 || !Number.isInteger(e.reps) || e.reps < 1 || e.reps > 999)) { setError('Укажите название, упражнения, 1–30 подходов и 1–999 повторений.'); return }
    const names = { ...data.exerciseNames }
    const exercises = editing.exercises.map(e => { const name = e.name.trim(); const knownId = Object.keys(names).find(k => names[k].toLocaleLowerCase() === name.toLocaleLowerCase()); const id = knownId ?? e.id; names[id] = name; return { ...e, id, name } })
    if (new Set(exercises.map(e => e.id)).size !== exercises.length) { setError('Упражнение повторяется. Объедините его подходы в одну строку.'); return }
    update(d => ({ ...d, exerciseNames: names, templates: [...d.templates.filter(t => t.id !== editing.id), { ...editing, title: editing.title.trim(), exercises }] })); setEditing(null); setError(''); setMessage('Шаблон сохранён.')
  }
  const importFile = async (file?: File) => {
    if (!file) return
    setError(''); setMessage(''); setPreview([])
    try { if (file.size > 5_000_000) throw new Error('Максимальный размер CSV — 5 МБ.'); const buffer = await file.arrayBuffer(); let text = new TextDecoder('utf-8').decode(buffer); if (text.includes('\uFFFD')) text = new TextDecoder('windows-1251').decode(buffer); setPreview(parseFatSecret(text, file.name)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать CSV.') }
  }
  const commitImport = () => {
    const apply = () => { update(d => ({ ...d, nutrition: [...d.nutrition.filter(n => !preview.some(p => p.date === n.date)), ...preview].sort((a, b) => b.date.localeCompare(a.date)) })); setMessage(`Импортировано дней: ${preview.length}.`); setPreview([]) }
    const duplicates = preview.filter(p => data.nutrition.some(n => n.date === p.date))
    if (duplicates.length) setConfirm({ title: 'Обновить данные питания?', text: `Уже есть записи за ${duplicates.map(d => dateLabel(d.date)).join(', ')}. Они будут заменены данными из этого отчёта.`, action: apply }); else apply()
  }
  const backup = () => { try { const blob = new Blob([storageBlocked ? localStorage.getItem(storageKey()) ?? '' : JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `fittrack-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch { setError('Браузер запретил доступ к хранилищу. Разрешите хранение данных для приложения.') } }
  const restore = async (file?: File) => {
    if (!file) return
    try { if (file.size > 5_000_000) throw new Error('Резервная копия должна быть не больше 5 МБ.'); const restored: unknown = JSON.parse(await file.text()); if (!isData(restored)) throw new Error('Файл не является корректной резервной копией FitTrack.'); setConfirm({ title: 'Восстановить дневник?', text: 'Текущие локальные данные будут заменены резервной копией. Облачная копия не изменится до синхронизации.', action: () => { setData(restored); setStorageBlocked(false); setStorageError(''); setMessage('Резервная копия восстановлена.'); } }) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать копию.') }
  }
  const sync = async () => {
    if (!tg()?.initData) { setError('Облачная синхронизация доступна при открытии через Telegram после настройки сервера. Сейчас данные сохраняются на этом устройстве.'); return }
    setBusy(true); setError('')
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `tma ${tg()!.initData}` }
      const response = await fetch('/api/state', { headers, cache: 'no-store' }); const remote = await response.json()
      if (!response.ok) throw new Error(remote.error ?? 'Сервер недоступен.')
      if (remote.data && !isData(remote.data)) throw new Error('Неизвестный формат данных в облаке.')
      if (remote.data && (revision.current === null || remote.revision !== revision.current)) {
        setConfirm({ title: 'Загрузить облачную копию?', text: 'В облаке есть сохранённый дневник. Его загрузка заменит локальные записи. Если они нужны, сначала отмените действие и скачайте резервную копию.', action: () => { setData(remote.data); rememberRevision(remote.revision); setCloud('Загружено из облака'); setMessage('Облачная копия загружена. После изменений нажмите «Синхронизировать».') } }); return
      }
      if (remote.data && sameDiary(remote.data, dataRef.current)) {
        rememberRevision(remote.revision); setCloud('Копия в облаке'); setMessage('Дневник уже синхронизирован. Новых изменений нет.'); return
      }
      const result = await fetch('/api/state', { method: 'PUT', headers, body: JSON.stringify({ data: dataRef.current, revision: remote.revision ?? 0 }) }); const saved = await result.json()
      if (!result.ok) throw new Error(saved.error ?? 'Не удалось сохранить в облаке.')
      rememberRevision(saved.revision); setCloud('Копия в облаке'); setMessage('Дневник сохранён в облаке.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Синхронизация недоступна. Локальные записи сохранены.') } finally { setBusy(false) }
  }
  const totalSets = draft?.exercises.reduce((n, e) => n + e.sets.length, 0) ?? 0
  const doneSets = draft?.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0) ?? 0
  const newTemplate = () => { setEditing({ id: uid(), title: '', exercises: [{ id: uid(), name: '', sets: 3, reps: 10 }] }); setError(''); navigate('template') }
  const templateRows = (limit?: number) => data.templates.slice(0, limit).map(t => <div className="template-row" key={t.id}><div className="template-icon"><Icon name="workout" /></div><div className="grow"><h3>{t.title}</h3><p className="muted">{t.exercises.length} упр. · {t.exercises.reduce((n, e) => n + e.sets, 0)} подходов</p></div>{tab === 'template' && <IconButton icon="edit" label={`Изменить ${t.title}`} onClick={() => setEditing(structuredClone(t))} />}<IconButton icon="arrow" label={`Начать ${t.title}`} onClick={() => start(t)} /></div>)

  return <div className="shell">
    <header className="topbar"><div className="brand"><div className="brandmark"><Icon name="workout" size={22} /></div><div>fittrack<span>.</span></div></div><div className="topright"><span className="storage">{account.status === 'ready' ? account.name : account.status === 'loading' ? 'Вход через Telegram…' : account.status === 'error' ? 'Вход недоступен' : 'Локальный режим'}</span></div></header>
    {account.status === 'local' && <div className="account-info"><span>Данные на этом устройстве.</span>{import.meta.env.VITE_TELEGRAM_BOT_URL && <a href={import.meta.env.VITE_TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">Открыть бота ↗</a>}</div>}
    {(error || storageError) && <div role="alert" className="notice error">{error || storageError}</div>}
    {message && <div role="status" className="notice">{message}</div>}
    {tab === 'workout' && <>
      <div className="heading"><h1>Тренировка</h1><span className="muted">{dateLabel(today())}</span></div>
      {!draft ? <div className="stack"><Button className="primary" onClick={() => start()}><Icon name="plus" size={17} />Начать тренировку</Button><div className="section-title"><h2>Шаблоны</h2><Button className="textbutton" onClick={newTemplate}><Icon name="plus" size={15} />Создать</Button></div><section className="card">{data.templates.length ? templateRows() : <p className="muted">Шаблонов пока нет.</p>}</section></div>
      : <div className="layout"><div className="stack"><section className="card form"><div className="form-grid"><label className="field">Название тренировки<input maxLength={100} value={draft.title} onChange={e => draftUpdate(w => ({ ...w, title: e.target.value }))} /></label><label className="field">Дата<input type="date" max={today()} value={draft.date} onChange={e => draftUpdate(w => ({ ...w, date: e.target.value }))} /></label></div><div className="row"><span className="muted">Выполнено {doneSets} из {totalSets} подходов</span><span className="badge">{fmt(volume(draft))} кг</span></div><div className="progress"><span style={{ width: `${totalSets ? doneSets / totalSets * 100 : 0}%` }} /></div></section>
        {draft.exercises.map((ex, ei) => { const previous = previousExercise(data.workouts, ex.id, draft); const sets = previous?.exercises.find(e => e.id === ex.id)?.sets; return <section className="card exercise" key={ex.id}><div className="exercise-head"><span className="exercise-number">{String(ei + 1).padStart(2, '0')}</span><h3>{ex.name}</h3><IconButton icon="trash" label={`Удалить упражнение ${ex.name}`} onClick={() => setConfirm({ title: 'Удалить упражнение?', text: 'Все его подходы в текущей тренировке будут удалены.', action: () => draftUpdate(w => ({ ...w, exercises: w.exercises.filter(e => e.id !== ex.id) })) })} /></div>{previous && <div className="previous">Прошлый раз · {dateLabel(previous.date)}<br />{sets?.map(s => `${s.weight} кг × ${s.reps}`).join(' · ')}</div>}<div className="set-grid labels"><span>№</span><span>Вес, кг</span><span>Повторы</span><span>Готово</span><span /><span /></div>{ex.sets.map((s, si) => <div className={`set-grid ${s.done ? 'completed' : ''}`} key={s.id}><span className="set-index">{si + 1}</span><input aria-label={`${ex.name}, подход ${si + 1}, вес`} inputMode="decimal" placeholder="0" value={s.weight} onChange={e => exerciseUpdate(ex.id, x => ({ ...x, sets: x.sets.map(v => v.id === s.id ? { ...v, weight: e.target.value, done: false } : v) }))} /><input aria-label={`${ex.name}, подход ${si + 1}, повторения`} inputMode="numeric" placeholder="10" value={s.reps} onChange={e => exerciseUpdate(ex.id, x => ({ ...x, sets: x.sets.map(v => v.id === s.id ? { ...v, reps: e.target.value, done: false } : v) }))} /><Button aria-label={`Подход ${si + 1} выполнен`} aria-pressed={s.done} className={`done-button ${s.done ? 'checked' : ''}`} onClick={() => { if (!validSet(s)) { setError('Введите вес от 0 кг и целое число повторений больше 0.'); return } setError(''); exerciseUpdate(ex.id, x => ({ ...x, sets: x.sets.map(v => v.id === s.id ? { ...v, done: !v.done } : v) })) }}><Icon name="check" size={18} /></Button><IconButton icon="copy" label={`Дублировать подход ${si + 1}`} onClick={() => exerciseUpdate(ex.id, x => ({ ...x, sets: [...x.sets.slice(0, si + 1), { ...s, id: uid(), done: false }, ...x.sets.slice(si + 1)] }))} /><IconButton icon="close" label={`Удалить подход ${si + 1}`} onClick={() => exerciseUpdate(ex.id, x => ({ ...x, sets: x.sets.filter(v => v.id !== s.id) }))} /></div>)}<Button className="add-set" onClick={() => exerciseUpdate(ex.id, x => ({ ...x, sets: [...x.sets, blankSet()] }))}><Icon name="plus" size={15} />Добавить подход</Button></section> })}
        <form className="card form" onSubmit={e => { e.preventDefault(); addExercise() }}><label className="field">Новое упражнение<input list="exercises" placeholder="Например, жим лёжа" maxLength={100} value={exerciseName} onChange={e => setExerciseName(e.target.value)} /></label><Button className="secondary" type="submit"><Icon name="plus" size={17} />Добавить упражнение</Button></form><Button className="primary wide" onClick={finish}><Icon name="check" size={18} />Завершить тренировку</Button></div><aside className="stack"><details className="help"><summary>Как записывать подходы</summary><p className="note">Одна строка — один подход. Копирование повторяет его значения, галочка отмечает выполненное. Для собственного веса укажите 0 кг. Черновик сохраняется автоматически.</p></details><Button className="textbutton" onClick={() => setConfirm({ title: 'Удалить черновик?', text: 'Несохранённые подходы будут удалены.', action: () => update(d => ({ ...d, draft: null })) })}>Отменить тренировку</Button></aside></div>}
    </>}
    {tab === 'template' && <><div className="heading"><div><h1>{editing ? 'Настройка шаблона' : 'Шаблоны'}</h1><p className="subtitle">Упражнения и план подходов. Вес заполните на тренировке.</p></div>{!editing && <Button className="primary" onClick={newTemplate}><Icon name="plus" size={17} />Создать</Button>}</div>{editing ? <section className="card form"><label className="field">Название<input placeholder="Например, верх тела" maxLength={100} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label><div>{editing.exercises.map((ex, i) => <div className="template-editor" key={i}><label className="field">Упражнение<input list="exercises" placeholder="Название" maxLength={100} value={ex.name} onChange={e => setEditing({ ...editing, exercises: editing.exercises.map((v, j) => i === j ? { ...v, name: e.target.value } : v) })} /></label><label className="field">Подходы<input type="number" min="1" max="30" value={ex.sets || ''} onChange={e => setEditing({ ...editing, exercises: editing.exercises.map((v, j) => i === j ? { ...v, sets: Number(e.target.value) } : v) })} /></label><label className="field">Повторы<input type="number" min="1" max="999" value={ex.reps || ''} onChange={e => setEditing({ ...editing, exercises: editing.exercises.map((v, j) => i === j ? { ...v, reps: Number(e.target.value) } : v) })} /></label><IconButton icon="close" label={`Удалить упражнение ${i + 1}`} onClick={() => setEditing({ ...editing, exercises: editing.exercises.filter((_, j) => j !== i) })} /></div>)}</div><Button className="secondary" onClick={() => setEditing({ ...editing, exercises: [...editing.exercises, { id: uid(), name: '', sets: 3, reps: 10 }] })}><Icon name="plus" size={16} />Ещё упражнение</Button><div className="actions"><Button className="secondary" onClick={() => { setEditing(null); setError('') }}>Отмена</Button><Button className="primary" onClick={saveTemplate}>Сохранить шаблон</Button></div>{data.templates.some(t => t.id === editing.id) && <Button className="textbutton" onClick={() => setConfirm({ title: 'Удалить шаблон?', text: 'Ранее выполненные тренировки останутся в истории.', action: () => { update(d => ({ ...d, templates: d.templates.filter(t => t.id !== editing.id) })); setEditing(null) } })}>Удалить шаблон</Button>}</section> : <section className="card">{data.templates.length ? templateRows() : <Empty icon="template" title="Нет шаблонов"><p>Создайте шаблон, чтобы не вводить одни и те же упражнения каждый раз.</p><Button className="primary" onClick={newTemplate}>Создать шаблон</Button></Empty>}</section>}</>}
    {tab === 'history' && <><div className="heading"><div><h1>История тренировок</h1></div><span className="badge">{data.workouts.length} тренировок</span></div><div className="stack">{!data.workouts.length && <section className="card"><Empty icon="history" title="Нет тренировок"><p>Завершите первую тренировку, чтобы сохранить упражнения, вес и повторения.</p><Button className="primary" onClick={() => start()}>Начать тренировку</Button></Empty></section>}{[...data.workouts].sort((a, b) => b.date.localeCompare(a.date)).map(w => <section className="card" key={w.id}><div className="row"><div className="template-icon"><Icon name="workout" /></div><div className="grow"><p className="eyebrow">{dateLabel(w.date)} · {w.date.slice(0, 4)}</p><h3>{w.title}</h3><p className="muted">{w.exercises.length} упр. · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} подходов · {fmt(volume(w))} кг</p></div><IconButton icon={expanded === w.id ? 'close' : 'arrow'} label="Показать подходы" onClick={() => setExpanded(expanded === w.id ? '' : w.id)} /></div>{expanded === w.id && <div className="history-details">{w.exercises.map(e => <div key={e.id}><h4>{e.name}</h4><p>{e.sets.map(s => `${s.weight} кг × ${s.reps}`).join(' · ')}</p></div>)}<div className="divider" /><div className="actions"><Button className="secondary" onClick={() => { if (draft) { setError('Сначала завершите текущую тренировку.'); return } update(d => ({ ...d, draft: structuredClone(w) })); navigate('workout') }}><Icon name="edit" size={16} />Изменить</Button><Button className="danger" onClick={() => setConfirm({ title: 'Удалить тренировку?', text: `${w.title}, ${dateLabel(w.date)}. Это действие нельзя отменить.`, action: () => update(d => ({ ...d, workouts: d.workouts.filter(x => x.id !== w.id) })) })}><Icon name="trash" size={16} />Удалить</Button></div></div>}</section>)}</div></>}
    {tab === 'food' && <><div className="heading"><div><h1>Дневник питания</h1></div></div><div className="layout"><div className="stack"><section className="import-toolbar"><label className="secondary file-label"><Icon name="upload" size={17} />Импорт CSV<input type="file" accept=".csv,text/csv" aria-label="Выбрать CSV FatSecret" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = '' }} /></label><span className="note">FatSecret · до 5 МБ</span></section>{preview.length > 0 && <section className="card form"><h2>Проверка перед импортом</h2>{preview.map(d => <div key={d.date}><div className="row"><h3>{dateLabel(d.date)} {d.date.slice(0, 4)}</h3><span className="muted">{d.foods.length} продуктов</span></div><p className="total">{fmt(d.nutrients.calories)} <small>ккал</small></p><Macros day={d} /></div>)}<div className="actions"><Button className="secondary" onClick={() => setPreview([])}>Отмена</Button><Button className="primary" onClick={commitImport}>Импортировать</Button></div></section>}{data.nutrition.map(d => <section className="card" key={d.date}><div className="row"><Button className="nutrition-day-toggle" aria-expanded={!!openNutritionDays[d.date]} aria-controls={`nutrition-details-${d.date}`} onClick={() => setOpenNutritionDays(days => ({ ...days, [d.date]: !days[d.date] }))}><span>{dateLabel(d.date)} {d.date.slice(0, 4)}</span><svg className={openNutritionDays[d.date] ? "day-chevron open" : "day-chevron"} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></Button><IconButton icon="trash" label={`Удалить питание за ${d.date}`} onClick={() => setConfirm({ title: 'Удалить запись питания?', text: `Данные за ${dateLabel(d.date)} будут удалены. Можно снова загрузить их из CSV.`, action: () => update(x => ({ ...x, nutrition: x.nutrition.filter(n => n.date !== d.date) })) })} /></div><div className="total" style={{ marginTop: 16 }}>{fmt(d.nutrients.calories)} <small>ккал</small></div><Macros day={d} /><div id={`nutrition-details-${d.date}`} hidden={!openNutritionDays[d.date]}>{[...new Set(d.foods.map(f => f.meal))].map(meal => <div className="meal" key={meal}><p className="eyebrow">{meal}</p>{d.foods.filter(f => f.meal === meal).map((f, i) => <div className="food-row" key={i}><div>{f.name}<small>{f.portion}</small></div><span>{fmt(f.nutrients.calories)} ккал</span></div>)}</div>)}</div></section>)}</div></div></>}
    {tab === 'analysis' && <Recommendations data={data} authenticated={account.status === 'ready'} onProfileChange={aiProfile => update(d => ({ ...d, aiProfile }))} />}
    <datalist id="exercises">{Object.entries(data.exerciseNames).map(([id, name]) => <option key={id} value={name} />)}</datalist>
    <footer className="footer-note"><details><summary>Данные и синхронизация</summary><div><Button className="backup" onClick={backup}>Скачать резервную копию</Button><label className="backup file-label">Восстановить<input type="file" accept=".json,application/json" aria-label="Восстановить резервную копию" onChange={e => { void restore(e.target.files?.[0]); e.target.value = '' }} /></label><Button className="backup" disabled={busy || storageBlocked} onClick={() => void sync()}>{busy ? 'Синхронизация…' : 'Синхронизировать'}</Button></div>{cloud && <span>{cloud} · синхронизация вручную</span>}</details></footer>
    <nav className="nav" aria-label="Основная навигация">{([['workout', 'Тренировка'], ['template', 'Шаблоны'], ['history', 'История'], ['food', 'Питание'], ['analysis', 'Разбор']] as const).map(([key, label]) => <Button key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon name={key} size={20} />{label}</Button>)}</nav>
    {confirm && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={e => { if (e.key === 'Escape') setConfirm(null); if (e.key === 'Tab') { const buttons = e.currentTarget.querySelectorAll('button'); if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[1].focus() } else if (!e.shiftKey && document.activeElement === buttons[1]) { e.preventDefault(); buttons[0].focus() } } }}><h2 id="confirm-title">{confirm.title}</h2><p>{confirm.text}</p><div className="actions"><Button autoFocus className="secondary" onClick={() => setConfirm(null)}>Отмена</Button><Button className="primary" onClick={() => { confirm.action(); setConfirm(null) }}>Подтвердить</Button></div></section></div>}
  </div>
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pixel-retroui/dist/index.css'
import '@fontsource/press-start-2p/400.css'
import './index.css'
import App from './App.tsx'

try {
  const saved = localStorage.getItem('fittrack.theme')
  document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
} catch { document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

interface Window {
  Telegram?: { WebApp: {
    initData: string
    initDataUnsafe?: { user?: { id: number; first_name: string } }
    ready: () => void
    expand: () => void
    setHeaderColor?: (color: string) => void
    setBackgroundColor?: (color: string) => void
  } }
}

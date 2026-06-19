import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA Service Worker — YALNIZCA üretim build'inde (vite build/preview).
// Dev'de (vite) SW, Vite'ın ES modüllerini cache'leyip "duplicate React /
// Invalid hook call / beyaz ekran" sorununa yol açıyordu. Bu yüzden dev'de
// kaydı yapmıyoruz ve daha önce kayıt olmuş SW + cache'leri temizliyoruz.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker kaydı başarısız:', err)
      })
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister())
    }).catch(() => {})
    if (window.caches) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
    }
  }
}

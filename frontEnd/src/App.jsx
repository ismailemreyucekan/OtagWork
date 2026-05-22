import { useState, useEffect } from 'react'
import LoginPage from './components/LoginPage'
import LandingPage from './components/LandingPage'
import './App.css'

const SESSION_KEY = 'iay_session'

function App() {
  // 'landing' (public tanıtım) | 'login' (giriş formu — sonrasında dashboard)
  // Eğer cihazda kayıtlı oturum varsa landing'i bypass edip doğrudan login'e
  // düşeriz; LoginPage zaten loggedInUser kontrolüyle dashboard'a yönlendirir.
  const hasSession = !!(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY))
  const [view, setView] = useState(hasSession ? 'login' : 'landing')

  // Erken çıkış: kullanıcı bir şekilde logout olursa view landing'e dönsün
  // (LoginPage handleLogout sonrası page state'i reset eder)
  useEffect(() => {
    if (view === 'login') return
    const stillHasSession = !!(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY))
    if (stillHasSession) setView('login')
  }, [view])

  return (
    <div className="App">
      {view === 'landing' ? (
        <LandingPage onLogin={() => setView('login')} />
      ) : (
        <LoginPage onBackToLanding={() => setView('landing')} />
      )}
    </div>
  )
}

export default App

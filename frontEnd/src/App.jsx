import { useState, useEffect } from 'react'
import LoginPage from './components/LoginPage'
import LandingPage from './components/LandingPage'
import SignupPage from './components/SignupPage'
import InviteAcceptPage from './components/InviteAcceptPage'
import './App.css'

const SESSION_KEY = 'iay_session'

/**
 * Uygulamanın 4 görünümü var:
 *   landing  — public tanıtım sayfası (varsayılan)
 *   login    — giriş formu (oturum yoksa)
 *   signup   — kayıt formu (solo / team plan seçimi)
 *   invite   — davet linkinden gelen kullanıcı için şifre belirleme
 *
 * URL'de ?invite=<token> varsa otomatik invite view'a düşer.
 * localStorage'da oturum varsa LoginPage doğrudan dashboard'a yönlendirir.
 */
function App() {
  const hasSession = !!(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY))

  // URL ?invite=<token> kontrolü — davet linki ile geliyorsa
  const initialInviteToken = (() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('invite') || null
    } catch { return null }
  })()

  const [view, setView] = useState(
    initialInviteToken ? 'invite'
    : hasSession ? 'login'
    : 'landing'
  )
  const [inviteToken, setInviteToken] = useState(initialInviteToken)

  // Kayıtlı oturum varsa landing/signup'tan login'e geç
  useEffect(() => {
    if (view === 'login' || view === 'invite') return
    const stillHasSession = !!(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY))
    if (stillHasSession) setView('login')
  }, [view])

  return (
    <div className="App">
      {view === 'landing' && (
        <LandingPage
          onLogin={() => setView('login')}
          onSignup={() => setView('signup')}
        />
      )}
      {view === 'login' && (
        <LoginPage
          onBackToLanding={() => setView('landing')}
          onGoToSignup={() => setView('signup')}
        />
      )}
      {view === 'signup' && (
        <SignupPage
          onBackToLanding={() => setView('landing')}
          onGoToLogin={() => setView('login')}
        />
      )}
      {view === 'invite' && inviteToken && (
        <InviteAcceptPage
          token={inviteToken}
          onBackToLogin={() => { setInviteToken(null); setView('login') }}
        />
      )}
    </div>
  )
}

export default App

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The opt-in prototype is absent from production bundles and never starts a mic.
if (import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('voice-demo')) {
  void import('./dev/VoiceNavigation').then(module => module.mountVoiceNavigation())
}

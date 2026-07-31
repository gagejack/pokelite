import { useEffect } from 'react'
import LoginForm from './LoginForm'

// Popup wrapper around LoginForm — used to trigger login from over another
// overlay (e.g. the stats screen when logged out). Sits above the stats panel.
export default function LoginModal({ onClose, onAuthSuccess }) {
  // Escape closes. Without it the only way out is a backdrop tap, which is
  // invisible to anyone navigating by keyboard.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 80, padding: '16px' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onClick={e => e.stopPropagation()}
      >
        <LoginForm onAuthSuccess={() => { onAuthSuccess?.(); onClose?.() }} />
      </div>
    </div>
  )
}

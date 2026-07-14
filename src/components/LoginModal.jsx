import LoginForm from './LoginForm'

// Popup wrapper around LoginForm — used to trigger login from over another
// overlay (e.g. the stats screen when logged out). Sits above the stats panel.
export default function LoginModal({ onClose, onAuthSuccess }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 80 }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()}>
        <LoginForm onAuthSuccess={() => { onAuthSuccess?.(); onClose?.() }} />
      </div>
    </div>
  )
}

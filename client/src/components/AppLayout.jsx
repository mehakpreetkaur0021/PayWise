import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function AppLayout({ children }) {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="app-logo" to="/dashboard">PayWise</NavLink>
        <nav className="app-nav" aria-label="Main navigation">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
        </nav>
        <div className="account-menu">
          <div className="account-name">
            <strong>{currentUser.name}</strong>
            <span>{currentUser.email}</span>
          </div>
          <button type="button" className="text-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      {children}
    </div>
  )
}

export default AppLayout

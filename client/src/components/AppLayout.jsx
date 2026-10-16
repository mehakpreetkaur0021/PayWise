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
      <aside className="app-sidebar">
        <NavLink className="app-logo" to="/dashboard" aria-label="PayWise dashboard">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PayWise</span>
        </NavLink>
        <p className="sidebar-label">Workspace</p>
        <nav className="app-nav sidebar-nav" aria-label="Main navigation">
          <NavLink to="/dashboard"><span className="nav-icon" aria-hidden="true">⌂</span> Dashboard</NavLink>
          <NavLink to="/transactions"><span className="nav-icon" aria-hidden="true">≡</span> Transactions</NavLink>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <span className="account-avatar" aria-hidden="true">{currentUser.name?.trim().charAt(0).toUpperCase() || 'P'}</span>
          <div className="account-name">
            <strong>{currentUser.name}</strong>
            <span>{currentUser.email}</span>
          </div>
        </div>
        <button type="button" className="sidebar-logout" onClick={handleLogout}><span aria-hidden="true">↪</span> Log out</button>
      </aside>
      <div className="app-workspace">
        <header className="mobile-header">
          <NavLink className="app-logo" to="/dashboard" aria-label="PayWise dashboard"><span className="brand-mark" aria-hidden="true">P</span><span>PayWise</span></NavLink>
          <nav className="app-nav mobile-nav" aria-label="Main navigation">
            <NavLink to="/dashboard" aria-label="Dashboard"><span aria-hidden="true">⌂</span></NavLink>
            <NavLink to="/transactions" aria-label="Transactions"><span aria-hidden="true">≡</span></NavLink>
          </nav>
          <button type="button" className="mobile-logout" onClick={handleLogout}>Log out</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export default AppLayout

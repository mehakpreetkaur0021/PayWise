import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card">
        <p className="brand">PayWise</p>
        <h1>Welcome, {currentUser.name}</h1>
        <dl className="user-details">
          <div><dt>Email</dt><dd>{currentUser.email}</dd></div>
          <div><dt>Role</dt><dd>{currentUser.role}</dd></div>
          <div><dt>Authentication status</dt><dd className="authenticated">Authenticated</dd></div>
        </dl>
        <div className="dashboard-actions">
          <button type="button" onClick={() => navigate('/transactions')}>View Transactions</button>
          <button type="button" className="secondary-button" onClick={handleLogout}>Logout</button>
        </div>
      </section>
    </main>
  )
}

export default Dashboard

import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Login() {
  const { isAuthenticated, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const registrationMessage = location.state?.message

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }

    setSubmitting(true)

    try {
      await login(email.trim(), password)
      navigate('/dashboard')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="brand">PayWise</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-subtitle">Log in to continue to your account.</p>

        {registrationMessage && <p className="success-message">{registrationMessage}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />

          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="auth-footer">Don't have an account? <Link to="/register">Register</Link></p>
      </section>
    </main>
  )
}

export default Login

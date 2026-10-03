import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Register() {
  const { isAuthenticated, loading, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  function validateForm() {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      return 'All fields are required.'
    }

    if (!emailPattern.test(email.trim())) {
      return 'Please provide a valid email address.'
    }

    if (password.length < 8) {
      return 'Password must be at least 8 characters long.'
    }

    if (password !== confirmPassword) {
      return 'Passwords do not match.'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateForm()
    setError(validationError)

    if (validationError) {
      return
    }

    setSubmitting(true)

    try {
      await register(name.trim(), email.trim(), password)
      navigate('/login', { state: { message: 'Registration successful. Please log in.' } })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <p className="brand">PayWise</p>
        <h1 id="register-title">Create your account</h1>
        <p className="auth-subtitle">Start with a secure PayWise account.</p>

        {error && <p className="error-message" role="alert">{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="register-name">Name</label>
          <input id="register-name" type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />

          <label htmlFor="register-email">Email</label>
          <input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />

          <label htmlFor="register-password">Password</label>
          <input id="register-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />

          <label htmlFor="register-confirm-password">Confirm password</label>
          <input id="register-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">Already have an account? <Link to="/login">Login</Link></p>
      </section>
    </main>
  )
}

export default Register

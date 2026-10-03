import { createContext, useContext, useEffect, useState } from 'react'
import { getCurrentUser, loginUser, registerUser } from '../api/authApi'
import { TOKEN_STORAGE_KEY } from '../api/client'

const AuthContext = createContext(null)

function getApiErrorMessage(error) {
  if (error.response?.status === 500) {
    return 'Something went wrong. Please try again.'
  }

  return error.response?.data?.message || 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY)

    async function restoreSession() {
      if (!storedToken) {
        if (isMounted) {
          setLoading(false)
        }
        return
      }

      try {
        const user = await getCurrentUser()

        if (isMounted) {
          setToken(storedToken)
          setCurrentUser(user)
        }
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY)

        if (isMounted) {
          setToken(null)
          setCurrentUser(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, [])

  async function login(email, password) {
    try {
      const data = await loginUser(email, password)

      localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
      setToken(data.token)
      setCurrentUser(data.user)

      return data
    } catch (error) {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setToken(null)
      setCurrentUser(null)
      throw new Error(getApiErrorMessage(error))
    }
  }

  async function register(name, email, password) {
    try {
      return await registerUser(name, email, password)
    } catch (error) {
      throw new Error(getApiErrorMessage(error))
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken(null)
    setCurrentUser(null)
  }

  const value = {
    token,
    currentUser,
    isAuthenticated: Boolean(token && currentUser),
    loading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

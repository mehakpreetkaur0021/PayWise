const { registerUser, loginUser, getUserById } = require('../services/authService')
const { generateToken } = require('../utils/jwt')

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function createClientError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function handleAuthError(error, res) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    })
  }

  console.error('Authentication request failed:', error.message)
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  })
}

async function register(req, res) {
  try {
    const body = req.body || {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = normalizeEmail(body.email)
    const { password } = body

    if (!name || !email || typeof password !== 'string' || !password) {
      throw createClientError('Name, email, and password are required')
    }

    if (name.length > 100) {
      throw createClientError('Name must be 100 characters or fewer')
    }

    if (!emailPattern.test(email)) {
      throw createClientError('Please provide a valid email address')
    }

    if (password.length < 8) {
      throw createClientError('Password must be at least 8 characters long')
    }

    const user = await registerUser({ name, email, password })

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user,
    })
  } catch (error) {
    return handleAuthError(error, res)
  }
}

async function login(req, res) {
  try {
    const body = req.body || {}
    const email = normalizeEmail(body.email)
    const { password } = body

    if (!email || typeof password !== 'string' || !password) {
      throw createClientError('Email and password are required')
    }

    if (!emailPattern.test(email)) {
      throw createClientError('Please provide a valid email address')
    }

    const user = await loginUser({ email, password })
    const token = generateToken(user)

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user,
    })
  } catch (error) {
    return handleAuthError(error, res)
  }
}

async function getCurrentUser(req, res) {
  try {
    const user = await getUserById(req.user.userId)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      })
    }

    return res.status(200).json({
      success: true,
      user,
    })
  } catch (error) {
    return handleAuthError(error, res)
  }
}

module.exports = { register, login, getCurrentUser }

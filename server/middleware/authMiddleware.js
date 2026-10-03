const { verifyToken } = require('../utils/jwt')

function authenticate(req, res, next) {
  const authorization = req.headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
  }

  const token = authorization.slice(7).trim()
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
  }

  try {
    const decoded = verifyToken(token)

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    }

    return next()
  } catch (error) {
    if (error.message === 'JWT_SECRET environment variable is required') {
      console.error('JWT configuration error')
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      })
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
  }
}

module.exports = { authenticate }

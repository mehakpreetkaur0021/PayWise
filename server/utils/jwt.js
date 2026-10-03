const jwt = require('jsonwebtoken')

const TOKEN_EXPIRATION = '7d'

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required')
  }

  return process.env.JWT_SECRET
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRATION }
  )
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret())
}

module.exports = { getJwtSecret, generateToken, verifyToken }

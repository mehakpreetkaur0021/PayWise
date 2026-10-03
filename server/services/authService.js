const bcrypt = require('bcrypt')

const { pool } = require('../config/db')

const BCRYPT_SALT_ROUNDS = 12

function createServiceError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

async function registerUser({ name, email, password }) {
  const connection = await pool.getConnection()
  let transactionStarted = false

  try {
    await connection.beginTransaction()
    transactionStarted = true

    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    )

    if (existingUsers.length > 0) {
      throw createServiceError('An account with this email already exists', 409)
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
    const [result] = await connection.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, passwordHash]
    )

    await connection.execute(
      'INSERT INTO wallets (user_id, balance) VALUES (?, ?)',
      [result.insertId, 0]
    )

    await connection.commit()
    transactionStarted = false

    return {
      id: result.insertId,
      name,
      email,
      role: 'student',
    }
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback()
      } catch (rollbackError) {
        console.error('Registration transaction rollback failed:', rollbackError.message)
      }
    }

    if (error.code === 'ER_DUP_ENTRY') {
      throw createServiceError('An account with this email already exists', 409)
    }

    throw error
  } finally {
    connection.release()
  }
}

async function loginUser({ email, password }) {
  const [users] = await pool.execute(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
    [email]
  )

  const user = users[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw createServiceError('Invalid email or password', 401)
  }

  return toSafeUser(user)
}

async function getUserById(userId) {
  const [users] = await pool.execute(
    'SELECT id, name, email, role FROM users WHERE id = ?',
    [userId]
  )

  return users[0] || null
}

module.exports = { registerUser, loginUser, getUserById }

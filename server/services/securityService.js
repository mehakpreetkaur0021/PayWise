const bcrypt = require('bcrypt')

const { pool } = require('../config/db')

const BCRYPT_SALT_ROUNDS = 12

function createServiceError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function setTransactionPin({ userId, pin }) {
  const pinHash = await bcrypt.hash(pin, BCRYPT_SALT_ROUNDS)

  await pool.execute(
    `INSERT INTO user_security (user_id, pin_hash, failed_attempts, locked_until)
     VALUES (?, ?, 0, NULL)
     ON DUPLICATE KEY UPDATE
       pin_hash = VALUES(pin_hash),
       failed_attempts = 0,
       locked_until = NULL`,
    [userId, pinHash]
  )
}

async function verifyTransactionPin({ userId, pin }) {
  const [securityRecords] = await pool.execute(
    'SELECT pin_hash FROM user_security WHERE user_id = ? LIMIT 1',
    [userId]
  )

  const securityRecord = securityRecords[0]
  if (!securityRecord) {
    throw createServiceError('Please set a transaction PIN before making a transfer', 403)
  }

  const pinMatches = await bcrypt.compare(pin, securityRecord.pin_hash)
  if (!pinMatches) {
    throw createServiceError('Incorrect transaction PIN', 401)
  }
}

module.exports = { setTransactionPin, verifyTransactionPin }

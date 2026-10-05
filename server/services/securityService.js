const bcrypt = require('bcrypt')

const { pool } = require('../config/db')

const BCRYPT_SALT_ROUNDS = 12
const MAX_FAILED_PIN_ATTEMPTS = 3
const DAILY_TRANSFER_LIMIT = 5000000

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
    `SELECT pin_hash, failed_attempts, locked_until
     FROM user_security
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  )

  const securityRecord = securityRecords[0]
  if (!securityRecord) {
    throw createServiceError('Please set a transaction PIN before making a transfer', 403)
  }

  if (securityRecord.locked_until && new Date(securityRecord.locked_until) > new Date()) {
    throw createServiceError('Transaction PIN is temporarily locked. Please try again later', 403)
  }

  let failedAttempts = Number(securityRecord.failed_attempts) || 0
  if (securityRecord.locked_until) {
    failedAttempts = 0
    await pool.execute(
      'UPDATE user_security SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
      [userId]
    )
  }

  const pinMatches = await bcrypt.compare(pin, securityRecord.pin_hash)
  if (!pinMatches) {
    failedAttempts += 1

    if (failedAttempts >= MAX_FAILED_PIN_ATTEMPTS) {
      await pool.execute(
        `UPDATE user_security
         SET failed_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
         WHERE user_id = ?`,
        [failedAttempts, userId]
      )
    } else {
      await pool.execute(
        'UPDATE user_security SET failed_attempts = ? WHERE user_id = ?',
        [failedAttempts, userId]
      )
    }

    throw createServiceError('Incorrect transaction PIN', 401)
  }

  await pool.execute(
    'UPDATE user_security SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
    [userId]
  )
}

async function checkDailyTransferLimit({ userId, amount, idempotencyKey }) {
  const [wallets] = await pool.execute(
    'SELECT id FROM wallets WHERE user_id = ? LIMIT 1',
    [userId]
  )
  const wallet = wallets[0]

  if (!wallet) {
    throw createServiceError('Wallet not found', 404)
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [totals] = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total_amount
     FROM transactions
     WHERE sender_wallet_id = ?
       AND type = 'TRANSFER'
       AND status = 'SUCCESS'
       AND created_at >= ?
       AND idempotency_key <> ?`,
    [wallet.id, startOfToday, idempotencyKey]
  )
  const transferTotal = Number(totals[0].total_amount) || 0

  if (transferTotal + amount > DAILY_TRANSFER_LIMIT) {
    throw createServiceError('Daily transfer limit of ₹50,000 exceeded', 400)
  }
}

module.exports = { setTransactionPin, verifyTransactionPin, checkDailyTransferLimit }

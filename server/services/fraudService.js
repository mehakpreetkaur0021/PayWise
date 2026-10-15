const { pool } = require('../config/db')

const LARGE_TRANSFER_AMOUNT = 2000000
const RAPID_TRANSFER_COUNT = 5
const HIGH_DAILY_TRANSFER_AMOUNT = 4000000

function evaluateSuspicion({ amount, recentTransferCount, dailyTransferAmount }) {
  const reasons = []

  if (amount > LARGE_TRANSFER_AMOUNT) {
    reasons.push('Large transaction amount')
  }

  if (recentTransferCount >= RAPID_TRANSFER_COUNT) {
    reasons.push('Too many transfers in a short time')
  }

  if (dailyTransferAmount + amount > HIGH_DAILY_TRANSFER_AMOUNT) {
    reasons.push('High daily transfer amount')
  }

  return {
    suspicious: reasons.length > 0,
    reason: reasons.length ? reasons.join('; ') : null,
  }
}

async function evaluateTransfer({ userId, amount }) {
  const [wallets] = await pool.execute(
    'SELECT id FROM wallets WHERE user_id = ? LIMIT 1',
    [userId]
  )
  const wallet = wallets[0]

  if (!wallet) {
    const error = new Error('Wallet not found')
    error.statusCode = 404
    throw error
  }

  const [recentTransfers] = await pool.execute(
    `SELECT COUNT(*) AS transfer_count
     FROM transactions
     WHERE sender_wallet_id = ?
       AND type = 'TRANSFER'
       AND status = 'SUCCESS'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    [wallet.id]
  )

  const [dailyTransfers] = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total_amount
     FROM transactions
     WHERE sender_wallet_id = ?
       AND type = 'TRANSFER'
       AND status = 'SUCCESS'
       AND created_at >= CURDATE()`,
    [wallet.id]
  )

  return evaluateSuspicion({
    amount,
    recentTransferCount: Number(recentTransfers[0].transfer_count) || 0,
    dailyTransferAmount: Number(dailyTransfers[0].total_amount) || 0,
  })
}

module.exports = {
  evaluateSuspicion,
  evaluateTransfer,
  LARGE_TRANSFER_AMOUNT,
  RAPID_TRANSFER_COUNT,
  HIGH_DAILY_TRANSFER_AMOUNT,
}

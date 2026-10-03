const { pool } = require('../config/db')

function createServiceError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function getWalletByUserId(userId) {
  const [wallets] = await pool.execute(
    `SELECT id, user_id, balance, created_at, updated_at
     FROM wallets
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  )

  return wallets[0] || null
}

async function getTransactionByIdempotencyKey(connection, idempotencyKey) {
  const [transactions] = await connection.execute(
    `SELECT id, type, sender_wallet_id, receiver_wallet_id, amount, status,
            idempotency_key, created_at
     FROM transactions
     WHERE idempotency_key = ?
     LIMIT 1`,
    [idempotencyKey]
  )

  return transactions[0] || null
}

async function depositToWallet({ userId, amount, idempotencyKey }) {
  const connection = await pool.getConnection()
  let transactionStarted = false

  try {
    await connection.beginTransaction()
    transactionStarted = true

    const [wallets] = await connection.execute(
      `SELECT id, user_id, balance, created_at, updated_at
       FROM wallets
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    )

    const wallet = wallets[0]
    if (!wallet) {
      throw createServiceError('Wallet not found', 404)
    }

    const existingTransaction = await getTransactionByIdempotencyKey(
      connection,
      idempotencyKey
    )

    if (existingTransaction) {
      await connection.commit()
      transactionStarted = false

      return {
        wallet,
        transaction: existingTransaction,
        idempotent: true,
      }
    }

    await connection.execute(
      'UPDATE wallets SET balance = balance + ? WHERE id = ?',
      [amount, wallet.id]
    )

    const [transactionResult] = await connection.execute(
      `INSERT INTO transactions
       (type, sender_wallet_id, receiver_wallet_id, amount, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['DEPOSIT', null, wallet.id, amount, 'SUCCESS', idempotencyKey]
    )

    const [updatedWallets] = await connection.execute(
      `SELECT id, user_id, balance, created_at, updated_at
       FROM wallets
       WHERE id = ?`,
      [wallet.id]
    )

    const [transactions] = await connection.execute(
      `SELECT id, type, sender_wallet_id, receiver_wallet_id, amount, status,
              idempotency_key, created_at
       FROM transactions
       WHERE id = ?`,
      [transactionResult.insertId]
    )

    await connection.commit()
    transactionStarted = false

    return {
      wallet: updatedWallets[0],
      transaction: transactions[0],
      idempotent: false,
    }
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback()
      } catch (rollbackError) {
        console.error('Deposit transaction rollback failed:', rollbackError.message)
      }
    }

    if (error.code === 'ER_DUP_ENTRY') {
      const existingTransaction = await getTransactionByIdempotencyKey(
        connection,
        idempotencyKey
      )

      if (existingTransaction) {
        const wallet = await getWalletByUserId(userId)

        if (wallet) {
          return {
            wallet,
            transaction: existingTransaction,
            idempotent: true,
          }
        }
      }
    }

    throw error
  } finally {
    connection.release()
  }
}

async function getWalletTransactions(userId) {
  const wallet = await getWalletByUserId(userId)

  if (!wallet) {
    throw createServiceError('Wallet not found', 404)
  }

  const [transactions] = await pool.execute(
    `SELECT id, type, sender_wallet_id, receiver_wallet_id, amount, status,
            idempotency_key, created_at
     FROM transactions
     WHERE sender_wallet_id = ? OR receiver_wallet_id = ?
     ORDER BY created_at DESC, id DESC`,
    [wallet.id, wallet.id]
  )

  return transactions
}

module.exports = {
  getWalletByUserId,
  depositToWallet,
  getWalletTransactions,
}

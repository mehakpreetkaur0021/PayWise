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

async function getTransactionByIdempotencyKeyForUpdate(connection, idempotencyKey) {
  const [transactions] = await connection.execute(
    `SELECT id, type, sender_wallet_id, receiver_wallet_id, amount, status,
            idempotency_key, created_at
     FROM transactions
     WHERE idempotency_key = ?
     LIMIT 1
     FOR UPDATE`,
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

async function transferBetweenWallets({ senderUserId, recipientEmail, amount, idempotencyKey }) {
  const connection = await pool.getConnection()
  let transactionStarted = false

  try {
    await connection.beginTransaction()
    transactionStarted = true

    // Locking the unique key makes concurrent retries serialize before either
    // request can move money. A repeat request then sees the completed record.
    const existingTransaction = await getTransactionByIdempotencyKeyForUpdate(
      connection,
      idempotencyKey
    )

    if (existingTransaction) {
      await connection.commit()
      transactionStarted = false

      return {
        transaction: existingTransaction,
        wallet: await getWalletByUserId(senderUserId),
        idempotent: true,
      }
    }

    const [senderWallets] = await connection.execute(
      `SELECT id, user_id, balance, created_at, updated_at
       FROM wallets
       WHERE user_id = ?
       LIMIT 1`,
      [senderUserId]
    )
    const senderWallet = senderWallets[0]

    if (!senderWallet) {
      throw createServiceError('Wallet not found', 404)
    }

    const [recipients] = await connection.execute(
      `SELECT users.id AS user_id, wallets.id AS wallet_id
       FROM users
       INNER JOIN wallets ON wallets.user_id = users.id
       WHERE users.email = ?
       LIMIT 1`,
      [recipientEmail]
    )
    const recipient = recipients[0]

    if (!recipient) {
      throw createServiceError('Recipient not found', 404)
    }

    if (recipient.user_id === senderUserId) {
      throw createServiceError('You cannot transfer money to yourself', 400)
    }

    // Acquire each wallet lock in the same ID order for every transfer.
    const walletIds = [senderWallet.id, recipient.wallet_id].sort((a, b) => a - b)
    const lockedWallets = new Map()

    for (const walletId of walletIds) {
      const [wallets] = await connection.execute(
        `SELECT id, user_id, balance, created_at, updated_at
         FROM wallets
         WHERE id = ?
         FOR UPDATE`,
        [walletId]
      )

      if (!wallets[0]) {
        throw createServiceError('Wallet not found', 404)
      }

      lockedWallets.set(walletId, wallets[0])
    }

    const lockedSenderWallet = lockedWallets.get(senderWallet.id)
    const lockedRecipientWallet = lockedWallets.get(recipient.wallet_id)

    if (lockedSenderWallet.balance < amount) {
      throw createServiceError('Insufficient wallet balance', 400)
    }

    const [debitResult] = await connection.execute(
      `UPDATE wallets
       SET balance = balance - ?
       WHERE id = ? AND balance >= ?`,
      [amount, lockedSenderWallet.id, amount]
    )

    if (debitResult.affectedRows !== 1) {
      throw createServiceError('Insufficient wallet balance', 400)
    }

    await connection.execute(
      'UPDATE wallets SET balance = balance + ? WHERE id = ?',
      [amount, lockedRecipientWallet.id]
    )

    const [transactionResult] = await connection.execute(
      `INSERT INTO transactions
       (type, sender_wallet_id, receiver_wallet_id, amount, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'TRANSFER',
        lockedSenderWallet.id,
        lockedRecipientWallet.id,
        amount,
        'SUCCESS',
        idempotencyKey,
      ]
    )

    const [transactions] = await connection.execute(
      `SELECT id, type, sender_wallet_id, receiver_wallet_id, amount, status,
              idempotency_key, created_at
       FROM transactions
       WHERE id = ?`,
      [transactionResult.insertId]
    )

    const [updatedWallets] = await connection.execute(
      `SELECT id, user_id, balance, created_at, updated_at
       FROM wallets
       WHERE id = ?`,
      [lockedSenderWallet.id]
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
        console.error('Transfer transaction rollback failed:', rollbackError.message)
      }
    }

    // A duplicate-key race can only have committed the other request. Return
    // its record, never retry the balance updates.
    if (error.code === 'ER_DUP_ENTRY') {
      const existingTransaction = await getTransactionByIdempotencyKey(
        connection,
        idempotencyKey
      )

      if (existingTransaction) {
        return {
          transaction: existingTransaction,
          wallet: await getWalletByUserId(senderUserId),
          idempotent: true,
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
  transferBetweenWallets,
  getWalletTransactions,
}

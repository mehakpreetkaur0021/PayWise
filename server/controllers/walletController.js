const {
  getWalletByUserId,
  depositToWallet,
  getWalletTransactions,
} = require('../services/walletService')

const MAX_IDEMPOTENCY_KEY_LENGTH = 100

function toWalletResponse(wallet) {
  return {
    id: wallet.id,
    userId: wallet.user_id,
    balance: wallet.balance,
    createdAt: wallet.created_at,
    updatedAt: wallet.updated_at,
  }
}

function toTransactionResponse(transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    senderWalletId: transaction.sender_wallet_id,
    receiverWalletId: transaction.receiver_wallet_id,
    amount: transaction.amount,
    status: transaction.status,
    idempotencyKey: transaction.idempotency_key,
    createdAt: transaction.created_at,
  }
}

function sendWalletError(error, res) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    })
  }

  console.error('Wallet request failed:', error.message)
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  })
}

async function getWallet(req, res) {
  try {
    const wallet = await getWalletByUserId(req.user.userId)

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found',
      })
    }

    return res.status(200).json({
      success: true,
      wallet: toWalletResponse(wallet),
    })
  } catch (error) {
    return sendWalletError(error, res)
  }
}

async function deposit(req, res) {
  const body = req.body || {}
  const { amount } = body
  const idempotencyKey = typeof body.idempotencyKey === 'string'
    ? body.idempotencyKey.trim()
    : ''

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be a positive integer amount in paise',
    })
  }

  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return res.status(400).json({
      success: false,
      message: 'A valid idempotency key is required',
    })
  }

  try {
    const result = await depositToWallet({
      userId: req.user.userId,
      amount,
      idempotencyKey,
    })

    return res.status(200).json({
      success: true,
      message: result.idempotent ? 'Deposit already processed' : 'Deposit successful',
      wallet: toWalletResponse(result.wallet),
      transaction: toTransactionResponse(result.transaction),
    })
  } catch (error) {
    return sendWalletError(error, res)
  }
}

async function getTransactions(req, res) {
  try {
    const transactions = await getWalletTransactions(req.user.userId)

    return res.status(200).json({
      success: true,
      transactions: transactions.map(toTransactionResponse),
    })
  } catch (error) {
    return sendWalletError(error, res)
  }
}

module.exports = { getWallet, deposit, getTransactions }

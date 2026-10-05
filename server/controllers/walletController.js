const walletService = require('../services/walletService')
const securityService = require('../services/securityService')
const { isValidPin } = require('./securityController')

const MAX_IDEMPOTENCY_KEY_LENGTH = 100
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    const wallet = await walletService.getWalletByUserId(req.user.userId)

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
    const result = await walletService.depositToWallet({
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

async function transfer(req, res) {
  const body = req.body || {}
  const recipientEmail = typeof body.recipientEmail === 'string'
    ? body.recipientEmail.trim().toLowerCase()
    : ''
  const { amount } = body
  const { pin } = body
  const idempotencyKey = typeof body.idempotencyKey === 'string'
    ? body.idempotencyKey.trim()
    : ''

  if (!recipientEmail || !emailPattern.test(recipientEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid recipient email address',
    })
  }

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

  if (!isValidPin(pin)) {
    return res.status(400).json({
      success: false,
      message: 'Transaction PIN must be exactly 4 digits',
    })
  }

  try {
    await securityService.verifyTransactionPin({ userId: req.user.userId, pin })
    await securityService.checkDailyTransferLimit({
      userId: req.user.userId,
      amount,
      idempotencyKey,
    })

    const result = await walletService.transferBetweenWallets({
      senderUserId: req.user.userId,
      recipientEmail,
      amount,
      idempotencyKey,
    })

    return res.status(200).json({
      success: true,
      message: result.idempotent ? 'Transfer already processed' : 'Transfer successful',
      wallet: toWalletResponse(result.wallet),
      transaction: toTransactionResponse(result.transaction),
    })
  } catch (error) {
    return sendWalletError(error, res)
  }
}

async function getTransactions(req, res) {
  try {
    const transactions = await walletService.getWalletTransactions(req.user.userId)

    return res.status(200).json({
      success: true,
      transactions: transactions.map(toTransactionResponse),
    })
  } catch (error) {
    return sendWalletError(error, res)
  }
}

module.exports = { getWallet, deposit, transfer, getTransactions }

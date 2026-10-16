const assert = require('node:assert/strict')
const test = require('node:test')

const { transfer, getTransactions } = require('../controllers/walletController')
const walletService = require('../services/walletService')
const securityService = require('../services/securityService')
const fraudService = require('../services/fraudService')
const aiAnomalyService = require('../services/aiAnomalyService')

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) { this.statusCode = statusCode; return this },
    json(body) { this.body = body; return this },
  }
}

function successfulTransferResult(idempotent = false) {
  return {
    idempotent,
    wallet: { id: 9, user_id: 7, balance: 4000, created_at: null, updated_at: null },
    transaction: { id: 20, type: 'TRANSFER', sender_wallet_id: 9, receiver_wallet_id: 3, amount: 1000, status: 'SUCCESS', suspicious: false, suspicious_reason: null, idempotency_key: 'transfer-1', created_at: null },
  }
}

test('saves an advisory AI anomaly result after a successful transfer without changing its success response', async () => {
  const originals = {
    verify: securityService.verifyTransactionPin,
    daily: securityService.checkDailyTransferLimit,
    fraud: fraudService.evaluateTransfer,
    transfer: walletService.transferBetweenWallets,
    update: walletService.updateTransactionAiAnomalyStatus,
    ai: aiAnomalyService.predictAnomaly,
  }
  let saved
  try {
    securityService.verifyTransactionPin = async () => {}
    securityService.checkDailyTransferLimit = async () => {}
    fraudService.evaluateTransfer = async () => ({ suspicious: false, reason: null })
    walletService.transferBetweenWallets = async () => successfulTransferResult()
    aiAnomalyService.predictAnomaly = async ({ amount }) => { assert.equal(amount, 1000); return 'NORMAL' }
    walletService.updateTransactionAiAnomalyStatus = async (id, status) => { saved = { id, status } }

    const response = createResponse()
    await transfer({ body: { recipientEmail: 'recipient@example.com', amount: 1000, idempotencyKey: 'transfer-1', pin: '4821' }, user: { userId: 7 } }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.transaction.status, 'SUCCESS')
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(saved, { id: 20, status: 'NORMAL' })
  } finally {
    securityService.verifyTransactionPin = originals.verify
    securityService.checkDailyTransferLimit = originals.daily
    fraudService.evaluateTransfer = originals.fraud
    walletService.transferBetweenWallets = originals.transfer
    walletService.updateTransactionAiAnomalyStatus = originals.update
    aiAnomalyService.predictAnomaly = originals.ai
  }
})

test('an AI failure does not fail or repeat a completed transfer', async () => {
  const originals = { verify: securityService.verifyTransactionPin, daily: securityService.checkDailyTransferLimit, fraud: fraudService.evaluateTransfer, transfer: walletService.transferBetweenWallets, update: walletService.updateTransactionAiAnomalyStatus, ai: aiAnomalyService.predictAnomaly }
  let transferCalls = 0
  let savedStatus
  try {
    securityService.verifyTransactionPin = async () => {}
    securityService.checkDailyTransferLimit = async () => {}
    fraudService.evaluateTransfer = async () => ({ suspicious: false, reason: null })
    walletService.transferBetweenWallets = async () => { transferCalls += 1; return successfulTransferResult() }
    aiAnomalyService.predictAnomaly = async () => { throw new Error('AI down') }
    walletService.updateTransactionAiAnomalyStatus = async (_, status) => { savedStatus = status }

    const response = createResponse()
    await transfer({ body: { recipientEmail: 'recipient@example.com', amount: 1000, idempotencyKey: 'transfer-1', pin: '4821' }, user: { userId: 7 } }, response)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(response.statusCode, 200)
    assert.equal(transferCalls, 1)
    assert.equal(savedStatus, 'UNAVAILABLE')
  } finally {
    securityService.verifyTransactionPin = originals.verify; securityService.checkDailyTransferLimit = originals.daily; fraudService.evaluateTransfer = originals.fraud; walletService.transferBetweenWallets = originals.transfer; walletService.updateTransactionAiAnomalyStatus = originals.update; aiAnomalyService.predictAnomaly = originals.ai
  }
})

test('transaction history returns AI status and safely maps old rows with no AI result', async () => {
  const originalGetTransactions = walletService.getWalletTransactions
  try {
    walletService.getWalletTransactions = async () => [
      { id: 1, type: 'TRANSFER', sender_wallet_id: 9, receiver_wallet_id: 3, amount: 100, status: 'SUCCESS', suspicious: false, suspicious_reason: null, ai_anomaly_status: 'NORMAL', idempotency_key: 'new', created_at: null },
      { id: 2, type: 'TRANSFER', sender_wallet_id: 9, receiver_wallet_id: 3, amount: 100, status: 'SUCCESS', suspicious: false, suspicious_reason: null, ai_anomaly_status: null, idempotency_key: 'old', created_at: null },
    ]
    const response = createResponse()
    await getTransactions({ user: { userId: 7 } }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.transactions[0].aiAnomalyStatus, 'NORMAL')
    assert.equal(response.body.transactions[1].aiAnomalyStatus, null)
  } finally {
    walletService.getWalletTransactions = originalGetTransactions
  }
})

const assert = require('node:assert/strict')
const test = require('node:test')
const bcrypt = require('bcrypt')

const { pool } = require('../config/db')
const securityService = require('../services/securityService')
const walletService = require('../services/walletService')
const { setPin } = require('../controllers/securityController')
const { transfer } = require('../controllers/walletController')

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('creates and replaces a transaction PIN as a bcrypt hash', async () => {
  const originalExecute = pool.execute
  const records = new Map()

  pool.execute = async (sql, params) => {
    if (sql.includes('INSERT INTO user_security')) {
      records.set(params[0], { pin_hash: params[1], failed_attempts: 0, locked_until: null })
      return [{}]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  try {
    await securityService.setTransactionPin({ userId: 7, pin: '4821' })
    const firstHash = records.get(7).pin_hash

    assert.notEqual(firstHash, '4821')
    assert.equal(await bcrypt.compare('4821', firstHash), true)

    await securityService.setTransactionPin({ userId: 7, pin: '1234' })
    const replacement = records.get(7)
    assert.notEqual(replacement.pin_hash, firstHash)
    assert.equal(await bcrypt.compare('1234', replacement.pin_hash), true)
    assert.equal(replacement.failed_attempts, 0)
    assert.equal(replacement.locked_until, null)
  } finally {
    pool.execute = originalExecute
  }
})

test('accepts a correct transaction PIN and rejects an incorrect or missing one', async () => {
  const originalExecute = pool.execute
  const pinHash = await bcrypt.hash('4821', 12)

  try {
    pool.execute = async () => [[{ pin_hash: pinHash }]]
    await assert.doesNotReject(() => securityService.verifyTransactionPin({ userId: 7, pin: '4821' }))
    await assert.rejects(
      () => securityService.verifyTransactionPin({ userId: 7, pin: '1111' }),
      { message: 'Incorrect transaction PIN', statusCode: 401 }
    )

    pool.execute = async () => [[]]
    await assert.rejects(
      () => securityService.verifyTransactionPin({ userId: 7, pin: '4821' }),
      { message: 'Please set a transaction PIN before making a transfer', statusCode: 403 }
    )
  } finally {
    pool.execute = originalExecute
  }
})

test('locks PIN transfers after three wrong attempts and resets after expiry', async () => {
  const originalExecute = pool.execute
  const record = {
    pin_hash: await bcrypt.hash('4821', 12),
    failed_attempts: 0,
    locked_until: null,
  }

  pool.execute = async (sql, params) => {
    if (sql.includes('SELECT pin_hash')) {
      return [[{ ...record }]]
    }
    if (sql.includes('DATE_ADD(NOW(), INTERVAL 10 MINUTE)')) {
      record.failed_attempts = params[0]
      record.locked_until = new Date(Date.now() + 10 * 60 * 1000)
      return [{}]
    }
    if (sql.includes('SET failed_attempts = ?, locked_until = NULL')) {
      record.failed_attempts = params[0]
      record.locked_until = null
      return [{}]
    }
    if (sql.includes('SET failed_attempts = ?')) {
      record.failed_attempts = params[0]
      return [{}]
    }
    if (sql.includes('SET failed_attempts = 0, locked_until = NULL')) {
      record.failed_attempts = 0
      record.locked_until = null
      return [{}]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  try {
    await assert.rejects(() => securityService.verifyTransactionPin({ userId: 7, pin: '1111' }))
    assert.equal(record.failed_attempts, 1)

    await assert.rejects(() => securityService.verifyTransactionPin({ userId: 7, pin: '1111' }))
    assert.equal(record.failed_attempts, 2)

    await assert.rejects(() => securityService.verifyTransactionPin({ userId: 7, pin: '1111' }))
    assert.equal(record.failed_attempts, 3)
    assert.ok(record.locked_until > new Date())

    await assert.rejects(
      () => securityService.verifyTransactionPin({ userId: 7, pin: '4821' }),
      { message: 'Transaction PIN is temporarily locked. Please try again later', statusCode: 403 }
    )
    assert.equal(record.failed_attempts, 3)

    record.locked_until = new Date(Date.now() - 1000)
    await assert.doesNotReject(() => securityService.verifyTransactionPin({ userId: 7, pin: '4821' }))
    assert.equal(record.failed_attempts, 0)
    assert.equal(record.locked_until, null)
  } finally {
    pool.execute = originalExecute
  }
})

test('allows transfers at the daily limit and rejects totals above it', async () => {
  const originalExecute = pool.execute
  let totalAmount = 4500000
  let dailyLimitQuery

  pool.execute = async (sql) => {
    if (sql.includes('SELECT id FROM wallets')) {
      return [[{ id: 9 }]]
    }
    if (sql.includes('COALESCE(SUM(amount), 0)')) {
      dailyLimitQuery = sql
      return [[{ total_amount: totalAmount }]]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  try {
    await assert.doesNotReject(() => securityService.checkDailyTransferLimit({
      userId: 7,
      amount: 500000,
      idempotencyKey: 'transfer-at-limit',
    }))
    assert.match(dailyLimitQuery, /type = 'TRANSFER'/)
    assert.match(dailyLimitQuery, /status = 'SUCCESS'/)

    totalAmount = 5000000
    await assert.rejects(
      () => securityService.checkDailyTransferLimit({
        userId: 7,
        amount: 1,
        idempotencyKey: 'transfer-over-limit',
      }),
      { message: 'Daily transfer limit of ₹50,000 exceeded', statusCode: 400 }
    )
  } finally {
    pool.execute = originalExecute
  }
})

test('rejects invalid transaction PIN setup and never exposes a hash', async () => {
  const invalidResponse = createResponse()
  await setPin({ body: { pin: '12a4' }, user: { userId: 7 } }, invalidResponse)

  assert.equal(invalidResponse.statusCode, 400)
  assert.equal(invalidResponse.body.message, 'Transaction PIN must be exactly 4 digits')

  const originalSetTransactionPin = securityService.setTransactionPin
  let receivedArguments
  securityService.setTransactionPin = async (arguments_) => {
    receivedArguments = arguments_
  }

  try {
    const response = createResponse()
    await setPin({ body: { userId: 99, pin: '4821' }, user: { userId: 7 } }, response)

    assert.deepEqual(receivedArguments, { userId: 7, pin: '4821' })
    assert.equal(response.statusCode, 200)
    assert.equal(Object.hasOwn(response.body, 'pin_hash'), false)
    assert.equal(JSON.stringify(response.body).includes('4821'), false)
  } finally {
    securityService.setTransactionPin = originalSetTransactionPin
  }
})

test('verifies a correct PIN before continuing a transfer using the JWT user ID', async () => {
  const originalVerifyTransactionPin = securityService.verifyTransactionPin
  const originalCheckDailyTransferLimit = securityService.checkDailyTransferLimit
  const originalTransferBetweenWallets = walletService.transferBetweenWallets
  let verifiedArguments
  let dailyLimitArguments
  let transferredArguments

  securityService.verifyTransactionPin = async (arguments_) => {
    verifiedArguments = arguments_
  }
  securityService.checkDailyTransferLimit = async (arguments_) => {
    dailyLimitArguments = arguments_
  }
  walletService.transferBetweenWallets = async (arguments_) => {
    transferredArguments = arguments_
    return {
      idempotent: false,
      wallet: { id: 9, user_id: 7, balance: 4000, created_at: null, updated_at: null },
      transaction: {
        id: 20,
        type: 'TRANSFER',
        sender_wallet_id: 9,
        receiver_wallet_id: 3,
        amount: 1000,
        status: 'SUCCESS',
        idempotency_key: 'transfer-1',
        created_at: null,
      },
    }
  }

  try {
    const response = createResponse()
    await transfer({
      body: {
        senderUserId: 99,
        recipientEmail: 'recipient@example.com',
        amount: 1000,
        idempotencyKey: 'transfer-1',
        pin: '4821',
      },
      user: { userId: 7 },
    }, response)

    assert.deepEqual(verifiedArguments, { userId: 7, pin: '4821' })
    assert.deepEqual(dailyLimitArguments, {
      userId: 7,
      amount: 1000,
      idempotencyKey: 'transfer-1',
    })
    assert.equal(transferredArguments.senderUserId, 7)
    assert.equal(response.statusCode, 200)
  } finally {
    securityService.verifyTransactionPin = originalVerifyTransactionPin
    securityService.checkDailyTransferLimit = originalCheckDailyTransferLimit
    walletService.transferBetweenWallets = originalTransferBetweenWallets
  }
})

test('rejects transfers with an incorrect PIN or no configured PIN', async () => {
  const originalVerifyTransactionPin = securityService.verifyTransactionPin
  const originalTransferBetweenWallets = walletService.transferBetweenWallets
  let transferCalled = false
  walletService.transferBetweenWallets = async () => {
    transferCalled = true
  }

  try {
    for (const error of [
      Object.assign(new Error('Incorrect transaction PIN'), { statusCode: 401 }),
      Object.assign(new Error('Please set a transaction PIN before making a transfer'), { statusCode: 403 }),
      Object.assign(new Error('Transaction PIN is temporarily locked. Please try again later'), { statusCode: 403 }),
    ]) {
      securityService.verifyTransactionPin = async () => { throw error }
      const response = createResponse()
      await transfer({
        body: { recipientEmail: 'recipient@example.com', amount: 1000, idempotencyKey: 'transfer-1', pin: '4821' },
        user: { userId: 7 },
      }, response)
      assert.equal(response.statusCode, error.statusCode)
      assert.equal(response.body.message, error.message)
    }

    assert.equal(transferCalled, false)
  } finally {
    securityService.verifyTransactionPin = originalVerifyTransactionPin
    walletService.transferBetweenWallets = originalTransferBetweenWallets
  }
})

test('rejects an over-limit transfer before the existing transfer service runs', async () => {
  const originalVerifyTransactionPin = securityService.verifyTransactionPin
  const originalCheckDailyTransferLimit = securityService.checkDailyTransferLimit
  const originalTransferBetweenWallets = walletService.transferBetweenWallets
  let transferCalled = false

  securityService.verifyTransactionPin = async () => {}
  securityService.checkDailyTransferLimit = async () => {
    throw Object.assign(new Error('Daily transfer limit of ₹50,000 exceeded'), { statusCode: 400 })
  }
  walletService.transferBetweenWallets = async () => {
    transferCalled = true
  }

  try {
    const response = createResponse()
    await transfer({
      body: { recipientEmail: 'recipient@example.com', amount: 1000, idempotencyKey: 'transfer-1', pin: '4821' },
      user: { userId: 7 },
    }, response)

    assert.equal(response.statusCode, 400)
    assert.equal(response.body.message, 'Daily transfer limit of ₹50,000 exceeded')
    assert.equal(transferCalled, false)
  } finally {
    securityService.verifyTransactionPin = originalVerifyTransactionPin
    securityService.checkDailyTransferLimit = originalCheckDailyTransferLimit
    walletService.transferBetweenWallets = originalTransferBetweenWallets
  }
})

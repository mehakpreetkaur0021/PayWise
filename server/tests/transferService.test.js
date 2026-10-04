const assert = require('node:assert/strict')
const test = require('node:test')

const { pool } = require('../config/db')
const { transferBetweenWallets } = require('../services/walletService')

function createConnection({
  existingTransaction,
  senderBalance = 50000,
  receiverBalance = 1200,
  recipient,
  failInsert = false,
}) {
  const calls = []
  const balances = new Map([[9, senderBalance], [3, receiverBalance]])
  let committed = false
  let rolledBack = false
  let released = false

  const connection = {
    async beginTransaction() {
      calls.push('BEGIN')
    },
    async commit() {
      committed = true
      calls.push('COMMIT')
    },
    async rollback() {
      rolledBack = true
      calls.push('ROLLBACK')
    },
    release() {
      released = true
    },
    async execute(sql, params) {
      const compactSql = sql.replace(/\s+/g, ' ').trim()
      calls.push({ sql: compactSql, params })

      if (compactSql.includes('FROM transactions') && compactSql.includes('FOR UPDATE')) {
        return [existingTransaction ? [existingTransaction] : []]
      }
      if (compactSql.includes('FROM wallets') && compactSql.includes('WHERE user_id = ?')) {
        return [[{ id: 9, user_id: 1, balance: balances.get(9) }]]
      }
      if (compactSql.includes('FROM users')) {
        return [recipient ? [recipient] : []]
      }
      if (compactSql.includes('FROM wallets') && compactSql.includes('WHERE id = ?') && compactSql.includes('FOR UPDATE')) {
        const walletId = params[0]
        return [[{
          id: walletId,
          user_id: walletId === 9 ? 1 : 2,
          balance: balances.get(walletId),
        }]]
      }
      if (compactSql.startsWith('UPDATE wallets SET balance = balance -')) {
        balances.set(params[1], balances.get(params[1]) - params[0])
        return [{ affectedRows: 1 }]
      }
      if (compactSql.startsWith('UPDATE wallets SET balance = balance +')) {
        balances.set(params[1], balances.get(params[1]) + params[0])
        return [{ affectedRows: 1 }]
      }
      if (compactSql.startsWith('INSERT INTO transactions')) {
        if (failInsert) throw new Error('simulated insert failure')
        return [{ insertId: 44 }]
      }
      if (compactSql.includes('FROM transactions') && compactSql.includes('WHERE id = ?')) {
        return [[{
          id: 44,
          type: 'TRANSFER',
          sender_wallet_id: 9,
          receiver_wallet_id: 3,
          amount: 1000,
          status: 'SUCCESS',
          idempotency_key: 'transfer-1',
        }]]
      }
      if (compactSql.includes('FROM wallets') && compactSql.includes('WHERE id = ?')) {
        return [[{ id: 9, user_id: 1, balance: balances.get(9) }]]
      }
      throw new Error(`Unexpected SQL: ${compactSql}`)
    },
  }

  return {
    calls,
    connection,
    get committed() { return committed },
    get rolledBack() { return rolledBack },
    get released() { return released },
    getWalletBalance(walletId) { return balances.get(walletId) },
  }
}

async function withMockedPool(mock, callback) {
  const originalGetConnection = pool.getConnection
  const originalExecute = pool.execute
  pool.getConnection = async () => mock.connection
  pool.execute = async (sql) => {
    if (sql.includes('WHERE user_id = ?')) {
      return [[{ id: 9, user_id: 1, balance: mock.getWalletBalance(9) }]]
    }
    throw new Error(`Unexpected pool SQL: ${sql}`)
  }

  try {
    return await callback()
  } finally {
    pool.getConnection = originalGetConnection
    pool.execute = originalExecute
  }
}

test('transfers atomically and locks wallets in ascending ID order', async () => {
  const mock = createConnection({ recipient: { user_id: 2, wallet_id: 3 } })

  const result = await withMockedPool(mock, () => transferBetweenWallets({
    senderUserId: 1,
    recipientEmail: 'recipient@example.com',
    amount: 1000,
    idempotencyKey: 'transfer-1',
  }))

  assert.equal(result.idempotent, false)
  assert.equal(result.wallet.balance, 49000)
  assert.equal(result.transaction.id, 44)
  assert.equal(mock.committed, true)
  assert.equal(mock.rolledBack, false)
  assert.equal(mock.released, true)
  const lockIds = mock.calls
    .filter((call) => typeof call === 'object' && call.sql.includes('WHERE id = ? FOR UPDATE'))
    .map((call) => call.params[0])
  assert.deepEqual(lockIds, [3, 9])
})

test('conserves total money across a successful transfer', async () => {
  const mock = createConnection({
    senderBalance: 75000,
    receiverBalance: 22500,
    recipient: { user_id: 2, wallet_id: 3 },
  })
  const totalBefore = mock.getWalletBalance(9) + mock.getWalletBalance(3)

  const result = await withMockedPool(mock, () => transferBetweenWallets({
    senderUserId: 1,
    recipientEmail: 'recipient@example.com',
    amount: 12500,
    idempotencyKey: 'transfer-conservation',
  }))
  const totalAfter = mock.getWalletBalance(9) + mock.getWalletBalance(3)

  assert.equal(result.transaction.status, 'SUCCESS')
  assert.equal(totalAfter, totalBefore)
})

test('rejects insufficient funds without balance updates and rolls back', async () => {
  const mock = createConnection({ senderBalance: 999, recipient: { user_id: 2, wallet_id: 3 } })

  await withMockedPool(mock, async () => {
    await assert.rejects(
      () => transferBetweenWallets({
        senderUserId: 1,
        recipientEmail: 'recipient@example.com',
        amount: 1000,
        idempotencyKey: 'transfer-insufficient',
      }),
      { message: 'Insufficient wallet balance', statusCode: 400 }
    )
  })

  assert.equal(mock.committed, false)
  assert.equal(mock.rolledBack, true)
  assert.equal(mock.released, true)
  assert.equal(mock.calls.some((call) => typeof call === 'object' && call.sql.startsWith('UPDATE wallets')), false)
})

test('rejects a missing recipient and self-transfer before balance updates', async () => {
  const missingRecipient = createConnection({ recipient: null })
  await withMockedPool(missingRecipient, async () => {
    await assert.rejects(() => transferBetweenWallets({
      senderUserId: 1,
      recipientEmail: 'missing@example.com',
      amount: 1000,
      idempotencyKey: 'transfer-missing-recipient',
    }), { message: 'Recipient not found', statusCode: 404 })
  })

  const selfTransfer = createConnection({ recipient: { user_id: 1, wallet_id: 9 } })
  await withMockedPool(selfTransfer, async () => {
    await assert.rejects(() => transferBetweenWallets({
      senderUserId: 1,
      recipientEmail: 'sender@example.com',
      amount: 1000,
      idempotencyKey: 'transfer-self',
    }), { message: 'You cannot transfer money to yourself', statusCode: 400 })
  })

  for (const mock of [missingRecipient, selfTransfer]) {
    assert.equal(mock.rolledBack, true)
    assert.equal(mock.calls.some((call) => typeof call === 'object' && call.sql.startsWith('UPDATE wallets')), false)
  }
})

test('returns an existing idempotent transfer without wallet updates', async () => {
  const existingTransaction = {
    id: 44,
    type: 'TRANSFER',
    sender_wallet_id: 9,
    receiver_wallet_id: 3,
    amount: 1000,
    status: 'SUCCESS',
    idempotency_key: 'transfer-1',
  }
  const mock = createConnection({ existingTransaction })

  const result = await withMockedPool(mock, () => transferBetweenWallets({
    senderUserId: 1,
    recipientEmail: 'recipient@example.com',
    amount: 1000,
    idempotencyKey: 'transfer-1',
  }))

  assert.equal(result.idempotent, true)
  assert.equal(result.transaction.id, 44)
  assert.equal(mock.committed, true)
  assert.equal(mock.calls.some((call) => typeof call === 'object' && call.sql.startsWith('UPDATE wallets')), false)
})

test('rolls back both balance changes when transaction insertion fails', async () => {
  const mock = createConnection({ recipient: { user_id: 2, wallet_id: 3 }, failInsert: true })

  await withMockedPool(mock, async () => {
    await assert.rejects(() => transferBetweenWallets({
      senderUserId: 1,
      recipientEmail: 'recipient@example.com',
      amount: 1000,
      idempotencyKey: 'transfer-rollback',
    }), /simulated insert failure/)
  })

  assert.equal(mock.committed, false)
  assert.equal(mock.rolledBack, true)
  assert.equal(mock.released, true)
})

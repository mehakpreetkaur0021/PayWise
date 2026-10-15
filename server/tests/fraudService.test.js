const assert = require('node:assert/strict')
const test = require('node:test')

const { evaluateSuspicion } = require('../services/fraudService')

test('does not flag a transfer below ₹20,000', () => {
  const result = evaluateSuspicion({
    amount: 1999999,
    recentTransferCount: 0,
    dailyTransferAmount: 0,
  })

  assert.deepEqual(result, { suspicious: false, reason: null })
})

test('flags a transfer above ₹20,000', () => {
  const result = evaluateSuspicion({
    amount: 2000001,
    recentTransferCount: 0,
    dailyTransferAmount: 0,
  })

  assert.deepEqual(result, {
    suspicious: true,
    reason: 'Large transaction amount',
  })
})

test('flags five previous successful transfers in ten minutes', () => {
  const result = evaluateSuspicion({
    amount: 1000,
    recentTransferCount: 5,
    dailyTransferAmount: 1000,
  })

  assert.equal(result.suspicious, true)
  assert.equal(result.reason, 'Too many transfers in a short time')
})

test('flags a projected daily total above ₹40,000', () => {
  const result = evaluateSuspicion({
    amount: 100001,
    recentTransferCount: 0,
    dailyTransferAmount: 3900000,
  })

  assert.equal(result.suspicious, true)
  assert.equal(result.reason, 'High daily transfer amount')
})

test('combines every triggered suspicious-transfer reason', () => {
  const result = evaluateSuspicion({
    amount: 2500000,
    recentTransferCount: 5,
    dailyTransferAmount: 2000000,
  })

  assert.deepEqual(result, {
    suspicious: true,
    reason: 'Large transaction amount; Too many transfers in a short time; High daily transfer amount',
  })
})

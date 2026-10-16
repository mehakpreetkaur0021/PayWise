const assert = require('node:assert/strict')
const test = require('node:test')

const aiAnomalyService = require('../services/aiAnomalyService')

test('sends only amount and UTC-derived model features, then maps a suspicious response', async () => {
  const originalFetch = global.fetch
  let request
  global.fetch = async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ is_anomaly: true, prediction: 'suspicious' }) }
  }

  try {
    const status = await aiAnomalyService.predictAnomaly({
      amount: 1200,
      occurredAt: new Date('2024-01-01T05:00:00.000Z'),
    })
    assert.equal(status, 'SUSPICIOUS')
    assert.match(request.url, /\/predict$/)
    assert.deepEqual(JSON.parse(request.options.body), { amount: 12, hour_of_day: 5, day_of_week: 0 })
  } finally {
    global.fetch = originalFetch
  }
})

test('maps normal predictions and records AI failures as unavailable', async () => {
  const originalFetch = global.fetch
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ is_anomaly: false, prediction: 'normal' }) })
    assert.equal(await aiAnomalyService.predictAnomaly({ amount: 100 }), 'NORMAL')

    global.fetch = async () => { throw new Error('connection refused') }
    assert.equal(await aiAnomalyService.predictAnomaly({ amount: 100 }), 'UNAVAILABLE')
  } finally {
    global.fetch = originalFetch
  }
})

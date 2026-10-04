const assert = require('node:assert/strict')
const test = require('node:test')

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

test('validates recipient email, amount, and idempotency key before calling the service', async () => {
  const cases = [
    [{ recipientEmail: 'not-an-email', amount: 1000, idempotencyKey: 'key-1' }, 'Please provide a valid recipient email address'],
    [{ recipientEmail: 'recipient@example.com', amount: 0, idempotencyKey: 'key-2' }, 'Amount must be a positive integer amount in paise'],
    [{ recipientEmail: 'recipient@example.com', amount: 1000 }, 'A valid idempotency key is required'],
  ]

  for (const [body, message] of cases) {
    const res = createResponse()
    await transfer({ body, user: { userId: 1 } }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.success, false)
    assert.equal(res.body.message, message)
  }
})

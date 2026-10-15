import client from './client'

export async function getTransactions() {
  const response = await client.get('/wallet/transactions')
  return response.data.transactions
}

export async function getWallet() {
  const response = await client.get('/wallet')
  return response.data.wallet
}

export async function deposit({ amount, idempotencyKey }) {
  const response = await client.post('/wallet/deposit', { amount, idempotencyKey })
  return response.data
}

export async function transfer({ recipientEmail, amount, pin, idempotencyKey }) {
  const response = await client.post('/wallet/transfer', {
    recipientEmail,
    amount,
    pin,
    idempotencyKey,
  })
  return response.data
}

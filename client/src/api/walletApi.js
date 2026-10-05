import client from './client'

export async function getTransactions() {
  const response = await client.get('/wallet/transactions')
  return response.data.transactions
}

export async function getWallet() {
  const response = await client.get('/wallet')
  return response.data.wallet
}

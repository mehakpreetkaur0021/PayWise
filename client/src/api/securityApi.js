import client from './client'

export async function getSecurityStatus() {
  const response = await client.get('/security/status')
  return response.data
}

export async function setTransactionPin(pin) {
  const response = await client.post('/security/pin', { pin })
  return response.data
}

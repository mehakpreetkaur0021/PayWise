import client from './client'

export async function registerUser(name, email, password) {
  const response = await client.post('/auth/register', { name, email, password })
  return response.data
}

export async function loginUser(email, password) {
  const response = await client.post('/auth/login', { email, password })
  return response.data
}

export async function getCurrentUser() {
  const response = await client.get('/auth/me')
  return response.data.user
}

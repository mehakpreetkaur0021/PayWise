import axios from 'axios'

const TOKEN_STORAGE_KEY = 'paywise_token'

const client = axios.create({
  baseURL: 'http://localhost:5001/api',
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export { TOKEN_STORAGE_KEY }
export default client

const cors = require('cors')
const express = require('express')

const healthRoutes = require('./routes/healthRoutes')
const authRoutes = require('./routes/authRoutes')
const walletRoutes = require('./routes/walletRoutes')
const securityRoutes = require('./routes/securityRoutes')
const { apiNotFound, errorHandler } = require('./middleware/errorHandler')

const app = express()

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
}))
app.use(express.json())

app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/security', securityRoutes)

app.use('/api', apiNotFound)
app.use(errorHandler)

module.exports = app

const cors = require('cors')
const express = require('express')

const healthRoutes = require('./routes/healthRoutes')
const authRoutes = require('./routes/authRoutes')
const { apiNotFound, errorHandler } = require('./middleware/errorHandler')

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)

app.use('/api', apiNotFound)
app.use(errorHandler)

module.exports = app

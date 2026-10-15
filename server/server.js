require('dotenv').config()

const { getJwtSecret } = require('./utils/jwt')
const app = require('./app')
const { initializeSocket } = require('./socket')
const http = require('http')

const port = process.env.PORT || 5000

getJwtSecret()

const httpServer = http.createServer(app)
initializeSocket(httpServer)

httpServer.listen(port, () => {
  console.log(`PayWise API is running on port ${port}`)
})

require('dotenv').config()

const { getJwtSecret } = require('./utils/jwt')
const app = require('./app')

const port = process.env.PORT || 5000

getJwtSecret()

app.listen(port, () => {
  console.log(`PayWise API is running on port ${port}`)
})

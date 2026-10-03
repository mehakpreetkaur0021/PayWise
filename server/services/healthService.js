const { verifyDatabaseConnection } = require('../config/db')

async function checkSystemHealth() {
  await verifyDatabaseConnection()

  return {
    success: true,
    server: 'OK',
    database: 'OK',
  }
}

module.exports = { checkSystemHealth }

const securityService = require('../services/securityService')

const pinPattern = /^\d{4}$/

function isValidPin(pin) {
  return typeof pin === 'string' && pinPattern.test(pin)
}

async function setPin(req, res) {
  const { pin } = req.body || {}

  if (!isValidPin(pin)) {
    return res.status(400).json({
      success: false,
      message: 'Transaction PIN must be exactly 4 digits',
    })
  }

  try {
    await securityService.setTransactionPin({ userId: req.user.userId, pin })

    return res.status(200).json({
      success: true,
      message: 'Transaction PIN set successfully',
    })
  } catch (error) {
    console.error('Transaction PIN request failed:', error.message)
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    })
  }
}

module.exports = { setPin, isValidPin }

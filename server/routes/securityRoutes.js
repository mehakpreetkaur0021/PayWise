const express = require('express')

const { setPin, getSecurityStatus } = require('../controllers/securityController')
const { authenticate } = require('../middleware/authMiddleware')

const router = express.Router()

router.post('/pin', authenticate, setPin)
router.get('/status', authenticate, getSecurityStatus)

module.exports = router

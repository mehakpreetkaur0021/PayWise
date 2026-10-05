const express = require('express')

const { setPin } = require('../controllers/securityController')
const { authenticate } = require('../middleware/authMiddleware')

const router = express.Router()

router.post('/pin', authenticate, setPin)

module.exports = router

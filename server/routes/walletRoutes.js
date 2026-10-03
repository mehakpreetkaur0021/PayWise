const express = require('express')

const {
  getWallet,
  deposit,
  getTransactions,
} = require('../controllers/walletController')
const { authenticate } = require('../middleware/authMiddleware')

const router = express.Router()

router.get('/', authenticate, getWallet)
router.post('/deposit', authenticate, deposit)
router.get('/transactions', authenticate, getTransactions)

module.exports = router

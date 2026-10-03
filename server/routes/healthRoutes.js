const express = require('express')

const { checkSystemHealth } = require('../services/healthService')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const health = await checkSystemHealth()
    res.status(200).json(health)
  } catch (error) {
    res.status(503).json({
      success: false,
      server: 'OK',
      database: 'UNAVAILABLE',
      message: 'Database connection is unavailable',
    })
  }
})

module.exports = router

const { Server } = require('socket.io')
const { verifyToken } = require('./utils/jwt')

let io

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      socket.user = verifyToken(token)
      return next()
    } catch {
      return next(new Error('Invalid or expired token'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.userId}`)
  })

  return io
}

function emitPaymentReceived({ receiverUserId, transactionId, amount }) {
  if (!io) {
    return
  }

  try {
    io.to(`user:${receiverUserId}`).emit('payment:received', {
      transactionId,
      amount,
    })
  } catch (error) {
    // A temporary notification failure must not change an already committed payment.
    console.error('Payment notification failed:', error.message)
  }
}

module.exports = { initializeSocket, emitPaymentReceived }

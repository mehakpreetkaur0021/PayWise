import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../api/client'
import { useAuth } from '../context/AuthContext'

const SOCKET_URL = API_BASE_URL.replace(/\/api$/, '')

function formatRupees(amountInPaise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amountInPaise / 100)
}

function PaymentNotifications() {
  const { token, isAuthenticated } = useAuth()
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return undefined
    }

    let dismissTimer
    const socket = io(SOCKET_URL, { auth: { token } })

    socket.on('payment:received', ({ amount }) => {
      setNotification(`Payment received: ${formatRupees(amount)}`)
      window.dispatchEvent(new Event('paywise:payment-received'))
      clearTimeout(dismissTimer)
      dismissTimer = setTimeout(() => setNotification(null), 5000)
    })

    return () => {
      clearTimeout(dismissTimer)
      socket.disconnect()
    }
  }, [isAuthenticated, token])

  if (!notification) {
    return null
  }

  return <div className="payment-notification" role="status"><span>{notification}</span><button type="button" aria-label="Dismiss payment notification" onClick={() => setNotification(null)}>×</button></div>
}

export default PaymentNotifications

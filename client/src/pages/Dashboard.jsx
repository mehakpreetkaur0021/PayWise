import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WalletModal from '../components/WalletModal'
import PinSetupModal from '../components/PinSetupModal'
import { getTransactions, getWallet } from '../api/walletApi'
import { getSecurityStatus } from '../api/securityApi'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../utils/money'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getTransactionDetails(transaction, walletId) {
  if (transaction.type === 'DEPOSIT') return { label: 'Deposit', sign: '+' }
  return transaction.senderWalletId === walletId
    ? { label: 'Sent money', sign: '-' }
    : { label: 'Received money', sign: '+' }
}

function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalType, setModalType] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [successTitle, setSuccessTitle] = useState('')
  const [hasTransactionPin, setHasTransactionPin] = useState(null)

  useEffect(() => {
    let isMounted = true
    async function loadDashboard() {
      try {
        const [walletData, transactionData, securityStatus] = await Promise.all([getWallet(), getTransactions(), getSecurityStatus()])
        if (isMounted) {
          setWallet(walletData)
          setTransactions(transactionData)
          setHasTransactionPin(securityStatus.hasTransactionPin)
        }
      } catch (requestError) {
        if (isMounted) setError(requestError.response?.data?.message || 'Unable to load your wallet. Please try again.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadDashboard()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    async function refreshReceivedPayment() {
      try {
        const [walletData, transactionData] = await Promise.all([getWallet(), getTransactions()])
        setWallet(walletData)
        setTransactions(transactionData)
      } catch {
        // The existing page remains usable if the background refresh fails.
      }
    }

    window.addEventListener('paywise:payment-received', refreshReceivedPayment)
    return () => window.removeEventListener('paywise:payment-received', refreshReceivedPayment)
  }, [])

  function handleWalletSuccess({ wallet: updatedWallet, transaction, title, message }) {
    setWallet(updatedWallet)
    setTransactions((currentTransactions) => [transaction, ...currentTransactions.filter(({ id }) => id !== transaction.id)])
    setSuccessMessage(message)
    setSuccessTitle(title)
    setModalType(null)
  }

  function handlePinSuccess() {
    setHasTransactionPin(true)
    setSuccessTitle('Transaction PIN set successfully')
    setSuccessMessage('Your wallet is ready for secure transfers.')
    setModalType(null)
  }

  function openSendMoney() {
    setModalType(hasTransactionPin ? 'transfer' : 'pin')
  }

  return (
    <main className="wallet-page">
      <div className="page-content">
        <section className="dashboard-intro">
          <p className="eyebrow">Your personal wallet</p>
          <h1>{getGreeting()}, {currentUser.name}</h1>
          <p>Here&apos;s your wallet overview.</p>
        </section>

        {successMessage && <div className="success-banner" role="status"><div><strong>{successTitle}</strong><span>{successMessage}</span></div><button type="button" aria-label="Dismiss success message" onClick={() => setSuccessMessage('')}>×</button></div>}
        {error && <p className="error-message" role="alert">{error}</p>}

        {loading ? <p className="page-message">Loading wallet...</p> : wallet && <>
          {hasTransactionPin === false && <section className="pin-setup-card"><div><h2>Secure your wallet</h2><p>Set a 4-digit transaction PIN before sending money.</p></div><button type="button" onClick={() => setModalType('pin')}>Set Transaction PIN</button></section>}
          <section className="balance-card"><span>Total balance</span><strong>{formatMoney(wallet.balance)}</strong><p>Available to spend</p></section>
          <section className="quick-actions" aria-label="Wallet actions">
            <button type="button" className="action-button add-money" onClick={() => setModalType('deposit')}><span className="action-icon">+</span><span><strong>Add Money</strong><small>Top up your wallet</small></span></button>
            <button type="button" className="action-button send-money" onClick={openSendMoney}><span className="action-icon">↑</span><span><strong>Send Money</strong><small>Make a secure transfer</small></span></button>
          </section>
          <section className="recent-section">
            <div className="section-heading"><div><h2>Recent transactions</h2><p>Your latest wallet activity</p></div><button type="button" className="link-button" onClick={() => navigate('/transactions')}>View all</button></div>
            {transactions.length === 0 ? <div className="empty-state"><strong>No transactions yet</strong><span>Add money to start using your PayWise wallet.</span></div> : <ul className="recent-list">
              {transactions.slice(0, 5).map((transaction) => {
                const details = getTransactionDetails(transaction, wallet.id)
                return <li key={transaction.id}><div><strong>{details.label}</strong><span>{new Date(transaction.createdAt).toLocaleString('en-IN')}</span></div><div className="recent-amount"><strong className={details.sign === '+' ? 'transaction-credit' : 'transaction-debit'}>{details.sign} {formatMoney(transaction.amount)}</strong><span>{transaction.status === 'SUCCESS' ? 'Completed' : transaction.status}</span></div></li>
              })}
            </ul>}
          </section>
        </>}
      </div>
      {modalType === 'pin' && <PinSetupModal required={!hasTransactionPin} onClose={() => setModalType(null)} onSuccess={handlePinSuccess} />}
      {(modalType === 'deposit' || modalType === 'transfer') && wallet && <WalletModal type={modalType} balance={wallet.balance} onClose={() => setModalType(null)} onSuccess={handleWalletSuccess} />}
    </main>
  )
}

export default Dashboard

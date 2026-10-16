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
  if (transaction.type === 'DEPOSIT') return { label: 'Money added', sign: '+', icon: '↓', kind: 'deposit' }
  return transaction.senderWalletId === walletId
    ? { label: 'Sent money', sign: '-', icon: '↑', kind: 'sent' }
    : { label: 'Received money', sign: '+', icon: '↓', kind: 'received' }
}

function formatDate(value) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
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

  const summary = wallet ? transactions.reduce((totals, transaction) => {
    const details = getTransactionDetails(transaction, wallet.id)
    if (details.kind === 'deposit') totals.added += transaction.amount
    if (details.kind === 'sent') totals.sent += transaction.amount
    return totals
  }, { added: 0, sent: 0 }) : { added: 0, sent: 0 }

  return (
    <main className="wallet-page dashboard-page">
      <div className="page-content dashboard-content">
        <section className="dashboard-intro dashboard-heading">
          <div><p className="eyebrow">Personal finance</p><h1>{getGreeting()}, {currentUser.name}</h1><p>Here&apos;s a clear view of your wallet activity.</p></div>
          <span className="heading-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </section>

        {successMessage && <div className="success-banner" role="status"><div><strong>{successTitle}</strong><span>{successMessage}</span></div><button type="button" aria-label="Dismiss success message" onClick={() => setSuccessMessage('')}>×</button></div>}
        {error && <p className="error-message" role="alert">{error}</p>}

        {loading ? <p className="page-message">Loading wallet...</p> : wallet && <>
          <div className="dashboard-layout">
            <div className="dashboard-main-column">
              <section className="balance-card">
                <span className="balance-orbit orbit-one" aria-hidden="true" /><span className="balance-orbit orbit-two" aria-hidden="true" />
                <div className="balance-card-top"><span>Available balance</span><span className="balance-security"><span aria-hidden="true">⌁</span> Secure wallet</span></div>
                <strong>{formatMoney(wallet.balance)}</strong><p>Available to spend or transfer securely.</p>
                <span className="balance-card-number" aria-hidden="true">••••  PW</span>
              </section>
              <section className="quick-actions" aria-label="Wallet actions">
                <button type="button" className="action-button add-money" onClick={() => setModalType('deposit')}><span className="action-icon" aria-hidden="true">+</span><span><strong>Add Money</strong><small>Top up your wallet</small></span><span className="action-arrow" aria-hidden="true">→</span></button>
                <button type="button" className="action-button send-money" onClick={openSendMoney}><span className="action-icon" aria-hidden="true">↑</span><span><strong>Send Money</strong><small>Make a secure transfer</small></span><span className="action-arrow" aria-hidden="true">→</span></button>
              </section>
              <section className="recent-section">
            <div className="section-heading"><div><p className="eyebrow">Latest activity</p><h2>Recent transactions</h2><p>Your latest completed wallet activity.</p></div><button type="button" className="link-button" onClick={() => navigate('/transactions')}>View all <span aria-hidden="true">→</span></button></div>
            {transactions.length === 0 ? <div className="empty-state"><strong>No transactions yet</strong><span>Add money to start using your PayWise wallet.</span></div> : <ul className="recent-list">
              {transactions.slice(0, 5).map((transaction) => {
                const details = getTransactionDetails(transaction, wallet.id)
                return <li key={transaction.id} className="recent-transaction"><span className={`transaction-icon ${details.kind}`} aria-hidden="true">{details.icon}</span><div className="transaction-copy"><strong>{details.label}</strong><span>{formatDate(transaction.createdAt)}</span></div><div className="recent-amount"><strong className={details.sign === '+' ? 'transaction-credit' : 'transaction-debit'}>{details.sign} {formatMoney(transaction.amount)}</strong><span className={`status-label ${transaction.status === 'SUCCESS' ? 'success' : 'other'}`}>{transaction.status === 'SUCCESS' ? 'Completed' : transaction.status}</span></div></li>
              })}
            </ul>}
              </section>
            </div>
            <aside className="dashboard-side-column">
              {hasTransactionPin === false && <section className="pin-setup-card"><div><span className="side-card-icon" aria-hidden="true">⌁</span><h2>Secure your wallet</h2><p>Set a 4-digit transaction PIN before sending money.</p></div><button type="button" onClick={() => setModalType('pin')}>Set PIN</button></section>}
              <section className="summary-panel" aria-label="Wallet activity summary"><div className="summary-panel-heading"><p className="eyebrow">Overview</p><h2>At a glance</h2></div><div className="summary-grid">
                <article className="summary-card summary-added"><span className="summary-icon" aria-hidden="true">+</span><div><span>Money added</span><strong>{formatMoney(summary.added)}</strong></div></article>
                <article className="summary-card summary-sent"><span className="summary-icon" aria-hidden="true">↑</span><div><span>Money sent</span><strong>{formatMoney(summary.sent)}</strong></div></article>
                <article className="summary-card summary-activity"><span className="summary-icon" aria-hidden="true">↔</span><div><span>Activity</span><strong>{transactions.length}</strong><small>{transactions.length === 1 ? 'transaction recorded' : 'transactions recorded'}</small></div></article>
              </div></section>
            </aside>
          </div>
        </>}
      </div>
      {modalType === 'pin' && <PinSetupModal required={!hasTransactionPin} onClose={() => setModalType(null)} onSuccess={handlePinSuccess} />}
      {(modalType === 'deposit' || modalType === 'transfer') && wallet && <WalletModal type={modalType} balance={wallet.balance} onClose={() => setModalType(null)} onSuccess={handleWalletSuccess} />}
    </main>
  )
}

export default Dashboard

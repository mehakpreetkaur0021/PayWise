import { useEffect, useState } from 'react'
import { getTransactions, getWallet } from '../api/walletApi'
import { formatMoney } from '../utils/money'

function getTransactionDetails(transaction, walletId) {
  if (transaction.type === 'DEPOSIT') return { label: 'Deposit', sign: '+' }
  return transaction.senderWalletId === walletId ? { label: 'Sent money', sign: '-' } : { label: 'Received money', sign: '+' }
}

function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [walletId, setWalletId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    async function loadTransactions() {
      try {
        const [transactionData, wallet] = await Promise.all([getTransactions(), getWallet()])
        if (isMounted) {
          setTransactions(transactionData)
          setWalletId(wallet.id)
        }
      } catch (requestError) {
        if (isMounted) setError(requestError.response?.data?.message || 'Unable to load transactions. Please try again.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadTransactions()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    async function refreshReceivedPayment() {
      try {
        const [transactionData, wallet] = await Promise.all([getTransactions(), getWallet()])
        setTransactions(transactionData)
        setWalletId(wallet.id)
      } catch {
        // Keep the already-loaded history visible if a background refresh fails.
      }
    }

    window.addEventListener('paywise:payment-received', refreshReceivedPayment)
    return () => window.removeEventListener('paywise:payment-received', refreshReceivedPayment)
  }, [])

  return (
    <main className="wallet-page">
      <div className="page-content">
        <section className="page-heading"><p className="eyebrow">Wallet activity</p><h1>Transactions</h1><p>Your recent wallet activity, all in one place.</p></section>
        <section className="transactions-card">
          {loading && <p className="page-message">Loading transactions...</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          {!loading && !error && transactions.length === 0 && <div className="empty-state"><strong>No transactions yet</strong><span>Your completed deposits and transfers will appear here.</span></div>}
          {!loading && !error && transactions.length > 0 && <ul className="transaction-list">
            {transactions.map((transaction) => {
              const details = getTransactionDetails(transaction, walletId)
              return <li key={transaction.id} className="transaction-item"><div className="transaction-main"><strong>{details.label}</strong><span>{new Date(transaction.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>{transaction.suspicious && <span className="suspicious-transaction">Suspicious transaction{transaction.suspiciousReason ? ` · ${transaction.suspiciousReason}` : ''}</span>}</div><div className="transaction-summary"><strong className={details.sign === '+' ? 'transaction-credit' : 'transaction-debit'}>{details.sign} {formatMoney(transaction.amount)}</strong><span>{transaction.status === 'SUCCESS' ? 'Completed' : transaction.status}</span></div></li>
            })}
          </ul>}
        </section>
      </div>
    </main>
  )
}

export default Transactions

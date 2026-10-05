import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTransactions, getWallet } from '../api/walletApi'

function formatAmount(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

function getTransactionDetails(transaction, walletId) {
  if (transaction.type === 'DEPOSIT') {
    return { label: 'Deposit', sign: '+' }
  }

  if (transaction.senderWalletId === walletId) {
    return { label: 'Sent', sign: '-' }
  }

  return { label: 'Received', sign: '+' }
}

function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [walletId, setWalletId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function loadTransactions() {
      try {
        const [transactionData, wallet] = await Promise.all([
          getTransactions(),
          getWallet(),
        ])

        setTransactions(transactionData)
        setWalletId(wallet.id)
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load transactions. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadTransactions()
  }, [])

  return (
    <main className="transactions-page">
      <section className="transactions-card">
        <p className="brand">PayWise</p>
        <h1>Transactions</h1>

        {loading && <p className="transactions-message">Loading transactions...</p>}
        {error && <p className="error-message">{error}</p>}
        {!loading && !error && transactions.length === 0 && (
          <p className="transactions-message">No transactions yet.</p>
        )}

        {!loading && !error && transactions.length > 0 && (
          <ul className="transaction-list">
            {transactions.map((transaction) => {
              const details = getTransactionDetails(transaction, walletId)

              return (
                <li key={transaction.id} className="transaction-item">
                  <div>
                    <strong>{details.label}</strong>
                    <span>{new Date(transaction.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="transaction-summary">
                    <strong className={details.sign === '+' ? 'transaction-credit' : 'transaction-debit'}>
                      {details.sign} {formatAmount(transaction.amount)}
                    </strong>
                    <span>{transaction.status}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <button type="button" className="secondary-button" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </section>
    </main>
  )
}

export default Transactions

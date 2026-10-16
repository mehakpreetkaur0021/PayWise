import { useEffect, useMemo, useState } from 'react'
import { getTransactions, getWallet } from '../api/walletApi'
import { formatMoney } from '../utils/money'

function getTransactionDetails(transaction, walletId) {
  if (transaction.type === 'DEPOSIT') return { label: 'Money added', sign: '+', icon: '+', kind: 'deposit' }
  return transaction.senderWalletId === walletId
    ? { label: 'Sent money', sign: '-', icon: '↑', kind: 'sent' }
    : { label: 'Received money', sign: '+', icon: '↓', kind: 'received' }
}

function getAiStatus(transaction) {
  if (transaction.aiAnomalyStatus === 'SUSPICIOUS') return { tone: 'notice', text: 'AI signal: unusual pattern detected · experimental' }
  if (transaction.aiAnomalyStatus === 'NORMAL') return { tone: 'neutral', text: 'AI check: no unusual pattern detected · experimental' }
  return { tone: 'muted', text: 'AI check unavailable · experimental' }
}

function formatDate(value) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [walletId, setWalletId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

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

  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    const details = getTransactionDetails(transaction, walletId)
    const matchesFilter = filter === 'all' || details.kind === filter
    const searchable = [details.label, transaction.status, transaction.suspiciousReason, transaction.aiAnomalyStatus, transaction.type, formatDate(transaction.createdAt)].filter(Boolean).join(' ').toLowerCase()
    return matchesFilter && searchable.includes(query.trim().toLowerCase())
  }), [transactions, walletId, filter, query])

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
        <section className="page-heading"><p className="eyebrow">Wallet activity</p><h1>Transactions</h1><p>Review completed deposits and transfers in one place.</p></section>
        <section className="transactions-card">
          {loading && <p className="page-message">Loading transactions...</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          {!loading && !error && transactions.length === 0 && <div className="empty-state"><strong>No transactions yet</strong><span>Your completed deposits and transfers will appear here.</span></div>}
          {!loading && !error && transactions.length > 0 && <>
            <div className="transaction-tools">
              <label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">Search transactions</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" /></label>
              <div className="filter-group" aria-label="Filter transactions by type">
                {[['all', 'All'], ['deposit', 'Added'], ['received', 'Received'], ['sent', 'Sent']].map(([value, label]) => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
              </div>
            </div>
            <p className="result-count" aria-live="polite">{filteredTransactions.length} {filteredTransactions.length === 1 ? 'transaction' : 'transactions'}</p>
            {filteredTransactions.length === 0 ? <div className="empty-state compact"><strong>No matching transactions</strong><span>Try a different search or filter.</span></div> : <div className="transaction-table-wrap"><table className="transaction-table"><thead><tr><th scope="col">Transaction</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Experimental AI signal</th></tr></thead><tbody>
            {filteredTransactions.map((transaction) => {
              const details = getTransactionDetails(transaction, walletId)
              const aiStatus = transaction.type === 'TRANSFER' ? getAiStatus(transaction) : null
              return <tr key={transaction.id}><td data-label="Transaction"><div className="transaction-cell"><span className={`transaction-icon ${details.kind}`} aria-hidden="true">{details.icon}</span><div className="transaction-main"><strong>{details.label}</strong>{transaction.suspicious && <span className="rule-indicator">Review flag{transaction.suspiciousReason ? ` · ${transaction.suspiciousReason}` : ''}</span>}</div></div></td><td data-label="Date" className="transaction-date">{formatDate(transaction.createdAt)}</td><td data-label="Amount" className={`transaction-amount ${details.sign === '+' ? 'transaction-credit' : 'transaction-debit'}`}>{details.sign} {formatMoney(transaction.amount)}</td><td data-label="Status"><span className={`status-label ${transaction.status === 'SUCCESS' ? 'success' : 'other'}`}>{transaction.status === 'SUCCESS' ? 'Completed' : transaction.status}</span></td><td data-label="Experimental AI signal">{aiStatus ? <span className={`ai-indicator ${aiStatus.tone}`}>{aiStatus.text}</span> : <span className="ai-not-applicable">—</span>}</td></tr>
            })}
          </tbody></table></div>}</>}
        </section>
      </div>
    </main>
  )
}

export default Transactions

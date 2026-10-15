import { useState } from 'react'
import { deposit, transfer } from '../api/walletApi'
import { createIdempotencyKey, formatMoney, rupeesToPaise } from '../utils/money'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getApiMessage(error) {
  return error.response?.data?.message || 'Something went wrong. Please try again.'
}

function WalletModal({ type, balance, onClose, onSuccess }) {
  const isDeposit = type === 'deposit'
  const [amount, setAmount] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const amountInPaise = rupeesToPaise(amount)

    if (!amountInPaise) {
      setError('Enter an amount greater than zero, with up to two decimal places.')
      return
    }

    if (!isDeposit) {
      if (!emailPattern.test(recipientEmail.trim())) {
        setError('Please provide a valid recipient email address.')
        return
      }

      if (!/^\d{4}$/.test(pin)) {
        setError('Transaction PIN must be exactly 4 digits.')
        return
      }
    }

    setSubmitting(true)

    try {
      const result = isDeposit
        ? await deposit({ amount: amountInPaise, idempotencyKey: createIdempotencyKey() })
        : await transfer({
          recipientEmail: recipientEmail.trim(),
          amount: amountInPaise,
          pin,
          idempotencyKey: createIdempotencyKey(),
        })

      onSuccess({
        wallet: result.wallet,
        transaction: result.transaction,
        title: isDeposit ? 'Money added successfully' : 'Transfer successful',
        message: isDeposit
          ? `${formatMoney(amountInPaise)} has been added to your wallet.`
          : `${formatMoney(amountInPaise)} sent to ${recipientEmail.trim()}.`,
      })
    } catch (requestError) {
      setError(getApiMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">{isDeposit ? 'Wallet top up' : 'Secure transfer'}</p>
        <h2 id="wallet-modal-title">{isDeposit ? 'Add Money' : 'Send Money'}</h2>
        <p className="modal-subtitle">
          {isDeposit ? 'How much would you like to add?' : 'Send money safely using your transaction PIN.'}
        </p>

        {!isDeposit && <p className="available-balance">Available balance: <strong>{formatMoney(balance)}</strong></p>}
        {error && <p className="error-message" role="alert">{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          {!isDeposit && (
            <>
              <label htmlFor="recipient-email">Recipient email</label>
              <input id="recipient-email" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="rahul@example.com" autoComplete="email" disabled={submitting} />
            </>
          )}

          <label htmlFor="wallet-amount">Amount</label>
          <div className="currency-input">
            <span>₹</span>
            <input id="wallet-amount" type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={submitting} />
          </div>

          {!isDeposit && (
            <>
              <label htmlFor="transaction-pin">Transaction PIN</label>
              <input id="transaction-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength="4" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="••••" autoComplete="off" disabled={submitting} />
            </>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? (isDeposit ? 'Adding...' : 'Sending...') : (isDeposit ? 'Add Money' : `Send ${amount ? `₹${amount}` : 'Money'}`)}
          </button>
        </form>
      </section>
    </div>
  )
}

export default WalletModal

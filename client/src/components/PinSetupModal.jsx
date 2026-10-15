import { useState } from 'react'
import { setTransactionPin } from '../api/securityApi'

function PinSetupModal({ required = false, onClose, onSuccess }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!/^\d{4}$/.test(pin)) {
      setError('Transaction PIN must be exactly 4 digits.')
      return
    }
    if (pin !== confirmPin) {
      setError('Transaction PINs do not match.')
      return
    }

    setSubmitting(true)
    try {
      await setTransactionPin(pin)
      onSuccess()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to set your transaction PIN. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">Wallet security</p>
        <h2 id="pin-modal-title">Set Transaction PIN</h2>
        <p className="modal-subtitle">{required ? 'Set your transaction PIN before sending money.' : 'Choose a 4-digit PIN to approve transfers.'}</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="new-transaction-pin">Transaction PIN</label>
          <input id="new-transaction-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength="4" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="••••" autoComplete="new-password" disabled={submitting} />
          <label htmlFor="confirm-transaction-pin">Confirm Transaction PIN</label>
          <input id="confirm-transaction-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength="4" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))} placeholder="••••" autoComplete="new-password" disabled={submitting} />
          <button type="submit" disabled={submitting}>{submitting ? 'Setting PIN...' : 'Set Transaction PIN'}</button>
        </form>
      </section>
    </div>
  )
}

export default PinSetupModal

export function formatMoney(amountInPaise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format((Number(amountInPaise) || 0) / 100)
}

export function rupeesToPaise(value) {
  const normalizedValue = value.trim()

  if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
    return null
  }

  const [wholeRupees, decimalPart = ''] = normalizedValue.split('.')
  const paise = Number(wholeRupees) * 100 + Number(decimalPart.padEnd(2, '0'))

  return Number.isSafeInteger(paise) && paise > 0 ? paise : null
}

export function createIdempotencyKey() {
  return crypto.randomUUID()
}

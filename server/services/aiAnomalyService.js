const DEFAULT_AI_SERVICE_URL = 'http://127.0.0.1:8000'
const AI_REQUEST_TIMEOUT_MS = 1500
const PAISE_PER_RUPEE = 100

function getAiServiceUrl() {
  return (process.env.AI_SERVICE_URL || DEFAULT_AI_SERVICE_URL).replace(/\/$/, '')
}

function utcFeatures(date = new Date()) {
  return {
    hour_of_day: date.getUTCHours(),
    // Python datetime.weekday() convention used by preprocessing: Monday=0 ... Sunday=6.
    day_of_week: (date.getUTCDay() + 6) % 7,
  }
}

async function predictAnomaly({ amount, occurredAt = new Date() }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${getAiServiceUrl()}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      // Wallet amounts are integer paise. The training data contains decimal
      // amount values in the small currency-unit range, so send rupee values.
      body: JSON.stringify({ amount: amount / PAISE_PER_RUPEE, ...utcFeatures(occurredAt) }),
    })

    if (!response.ok) throw new Error(`AI service returned HTTP ${response.status}`)
    const body = await response.json()
    if (body?.is_anomaly === true && body?.prediction === 'suspicious') return 'SUSPICIOUS'
    if (body?.is_anomaly === false && body?.prediction === 'normal') return 'NORMAL'
    throw new Error('AI service returned an invalid prediction')
  } catch (error) {
    console.warn(`AI anomaly service unavailable: ${error.name === 'AbortError' ? 'request timed out' : error.message}`)
    return 'UNAVAILABLE'
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { predictAnomaly, utcFeatures, DEFAULT_AI_SERVICE_URL, AI_REQUEST_TIMEOUT_MS, PAISE_PER_RUPEE }

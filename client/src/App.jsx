import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('http://localhost:5001/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Health check failed')
        }

        return response.json()
      })
      .then((data) => {
        setHealth(data)
      })
      .catch((error) => {
        setError(error.message)
      })
  }, [])

  return (
    <main className="app-shell">
      <h1>PayWise</h1>

      {health && (
        <div>
          <p>Server: {health.server}</p>
          <p>Database: {health.database}</p>
        </div>
      )}

      {error && <p>Backend connection failed: {error}</p>}
    </main>
  )
}

export default App
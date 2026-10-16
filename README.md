# PayWise

PayWise is a full-stack peer-to-peer digital wallet built as a student project. It supports secure registration, wallet top-ups, transfers, transaction history, and real-time payment notifications. It also includes an experimental AI-based anomaly detection service that analyzes completed transfers without interfering with payment execution.

## Features

- JWT authentication and protected wallet screens
- One wallet per user, with balances stored in integer paise
- Add money and peer-to-peer transfers from the browser
- Transaction history with sent, received, and deposit activity
- Atomic MySQL transfers with row-level wallet locking
- Deterministic wallet lock order and idempotency keys
- Transaction PINs stored as bcrypt hashes
- PIN lockout after three incorrect attempts for ten minutes
- Daily transfer limit of ₹50,000
- Rule-based suspicious-transfer flagging that never blocks a valid transfer
- Socket.IO receiver notifications after a successful MySQL commit
- Experimental Isolation Forest anomaly detection using Python and FastAPI
- AI anomaly results displayed in transaction history

## Tech Stack

- **Frontend:** React, Vite, React Router, Axios, Socket.IO Client
- **Backend:** Node.js, Express, MySQL, mysql2, JWT, bcrypt, Socket.IO
- **AI service:** Python, FastAPI, scikit-learn
- **Machine learning:** Isolation Forest

## Architecture

```text
React Client
    |
    v
Express API
    |
    v
Wallet and Security Services
    |
    v
MySQL Database

Successful Transfer
    |
    v
MySQL COMMIT
    |
    +----> Socket.IO receiver notification
    |
    +----> Python FastAPI anomaly detection
                  |
                  v
             Isolation Forest
                  |
                  v
          Advisory AI result
                  |
                  v
          Transaction history
```

MySQL is the source of truth for wallet balances and transactions. The backend performs financial and security checks before committing a transfer.

After a successful transfer, the backend requests an anomaly prediction from the Python service. The AI result is advisory only: it cannot approve, reject, block, roll back, or change a payment. If the AI service is unavailable, a successful transfer remains successful.

## Database Setup

1. Create a MySQL database named `paywise`.
2. For a fresh database, run:

   ```bash
   mysql -u root -p paywise < server/database/schema.sql
   ```

3. For an existing database that predates suspicious-transfer flagging, run:

   ```bash
   mysql -u root -p paywise < server/database/add_transaction_suspicious_flags.sql
   ```

4. Apply the AI-status migration for an existing database:

   ```bash
   mysql -u root -p paywise < server/database/add_transaction_ai_anomaly_status.sql
   ```

The schema file is intended for a fresh database. The migration files are intended to add the relevant columns to existing databases without deleting existing data.

## Environment Variables

Copy `server/.env.example` to `server/.env` and configure your local values. Never commit secrets.

| Variable | Purpose |
|---|---|
| `PORT` | Backend API and Socket.IO port |
| `CLIENT_ORIGIN` | Frontend origin, normally `http://localhost:5173` |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `JWT_SECRET` | Private key used to sign authentication tokens |
| `AI_SERVICE_URL` | Python AI service URL, normally `http://127.0.0.1:8000` |

## Running Locally

### 1. Start the backend

```bash
cd server
npm install
npm run dev
```

Configure your MySQL connection and other required environment variables before starting the backend.

### 2. Start the frontend

In a separate terminal:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

### 3. Start the AI service

Create and configure the Python virtual environment as described in `ai-service/README.md`. Ensure the model artifact exists, then start the service from the project root:

```bash
ai-service/.venv/bin/python -m uvicorn main:app --app-dir ai-service --reload
```

The service health endpoint is available at `http://127.0.0.1:8000/health`.

The backend uses `AI_SERVICE_URL` to communicate with the AI service. The AI service can be unavailable without changing the outcome of a successfully committed transfer.

## Experimental AI Anomaly Detection

PayWise uses **Isolation Forest**, an unsupervised machine learning algorithm, to identify transactions that appear unusual based on their features.

The current v2 model uses:

- Transaction amount
- One-hot-encoded hour of the day
- One-hot-encoded day of the week

The model is trained separately from the wallet application. A validation split is used to select the anomaly threshold, and the held-out test set is used for final evaluation.

### Model Evaluation

The following results were measured on the held-out test set:

| Metric | Isolation Forest v1 | Isolation Forest v2 |
|---|---:|---:|
| Precision | 3.69% | 3.79% |
| Recall | 45.75% | 50.14% |
| F1-score | 6.83% | 7.05% |
| Transactions flagged | 45.24% | 48.23% |

Version 2 produced a small improvement in precision, recall, and F1-score. However, precision remains very low, and the model flags nearly half of the evaluated transactions.

**These results demonstrate an experimental prototype, not production-ready fraud detection.** Many flagged transactions are legitimate according to the dataset labels.

### Limitations and Future Improvements

- The training dataset provides only amount and time-related information.
- It lacks user history, recipient history, transaction velocity, device, location, and other potentially useful behavioral features.
- The dataset's provenance, label definition, transaction coverage, and currency units have not been independently verified.
- The model may identify unusual transactions that are legitimate, resulting in false positives.
- The amount sent to the model is converted from integer paise to a decimal rupee magnitude. This is a provisional alignment with the training data, whose units remain unverified.

Potential future improvements include validating the dataset's source and units, obtaining better fraud-relevant features, and evaluating changes using separate validation and test sets.

The AI output is advisory only and must not be used as the sole basis for rejecting or blocking payments.

For detailed AI setup, training, API, and evaluation instructions, see [`ai-service/README.md`](ai-service/README.md).

## Testing

Run the backend tests:

```bash
cd server
npm test
```

Run the AI service tests from the project root:

```bash
ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -v
```

Build the frontend:

```bash
cd client
npm run build
```

**Latest recorded verification:**

- AI service: 12 tests passed
- Backend: 28 tests passed
- Frontend: Vite production build succeeded
- FastAPI health check: Isolation Forest v2 loaded successfully

## Demo Flow

Register → Login → Set a transaction PIN → Add money → Send money → Receiver gets a real-time notification → Review transaction history and AI anomaly status.

## Rule-Based Suspicious-Transfer Checks

The existing rule-based checks are separate from the AI model. Transfers can be flagged when one or more of these rules apply:

- Amount is above ₹20,000
- The sender has five or more previous successful transfers within ten minutes
- Today's projected successful-transfer total is above ₹40,000

These flags do not override the wallet's financial and security checks or block an otherwise valid transfer.

## Project Status

PayWise combines wallet transaction processing, database-backed security controls, real-time notifications, and an experimental machine learning service. The wallet and AI integration have passed the latest recorded automated tests. The anomaly detector remains a prototype whose precision and dataset limitations require further improvement before any real-world fraud-detection use.
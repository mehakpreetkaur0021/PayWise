# PayWise

PayWise is a simple peer-to-peer digital wallet built as a full-stack student project. It supports secure registration, wallet top-ups, transfers, transaction history, and real-time payment notifications.

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
- Rule-based suspicious-transfer flagging (never blocks a valid transfer)
- Socket.IO receiver notifications after a successful MySQL commit

## Tech stack

- Frontend: React, Vite, React Router, Axios, Socket.IO Client
- Backend: Node.js, Express, MySQL, mysql2, JWT, bcrypt, Socket.IO

## Architecture

```text
React client → Express API → wallet and security services → MySQL

Successful transfer → MySQL COMMIT → Socket.IO receiver notification
```

MySQL is the source of truth. Socket.IO only informs the receiver after a committed transfer; it never changes a balance or approves a payment.

## Database setup

1. Create a MySQL database named `paywise`.
2. Run the complete fresh-clone schema:

   ```bash
   mysql -u root -p paywise < server/database/schema.sql
   ```

3. For an existing database that predates suspicious-transfer flagging, run:

   ```bash
   mysql -u root -p paywise < server/database/add_transaction_suspicious_flags.sql
   ```

`schema.sql` is for a fresh database. The small SQL files in `server/database/` are safe, focused setup/migration helpers; they do not delete existing data.

## Environment variables

Copy `server/.env.example` to `server/.env` and use your local values. Do not commit this file.

| Variable | Purpose |
| --- | --- |
| `PORT` | API and Socket.IO port |
| `CLIENT_ORIGIN` | Vite frontend origin, normally `http://localhost:5173` |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `JWT_SECRET` | Long private key used to sign login tokens |

## Running locally

Terminal 1:

```bash
cd server
npm install
npm run dev
```

Terminal 2:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the second terminal, normally `http://localhost:5173`.

## Testing

```bash
cd server
npm test
```

## Demo flow

Register → Login → Set a transaction PIN → Add money → Send money → Receiver gets a real-time notification → Review transaction history.

## Suspicious-transfer rules

Transfers still complete if all financial and PIN checks pass, but are flagged when one or more of these rules apply:

- Amount is above ₹20,000
- The sender has five or more previous successful transfers within ten minutes
- Today’s projected successful-transfer total is above ₹40,000

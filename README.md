# PayWise

PayWise is a planned simulated centralized digital wallet, inspired by services such as PhonePe and Paytm.

## Current technology stack

- Client: React with JavaScript and Vite
- Server: Node.js, Express, CORS, and dotenv

## Current development status

Milestone 1.2 adds the basic Express backend foundation and `GET /api/health` endpoint. No authentication, database, wallet, or transaction features have been added.

## Start the client

```bash
cd client
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Start the backend

```bash
cd server
npm run dev
```

For normal execution without automatic restarts, run `npm start` instead.

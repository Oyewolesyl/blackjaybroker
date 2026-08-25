# IBKR Ecosystem Study

A study build for learning how a brokerage-style ecosystem can fit together:
marketing sections, account creation, dashboard UI, and a simple backend wallet.

This is not a real broker, exchange, bank, custodian, payment processor, or
investment advisor. It is a local learning prototype.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Backend

The backend is a dependency-free Node server in `server.js`.

- `POST /api/auth/signup` creates a local study user.
- `POST /api/auth/login` returns a bearer token.
- `GET /api/wallet` returns the logged-in user's wallet.
- `POST /api/wallet/deposit` adds demo funds.
- `POST /api/wallet/withdraw` removes demo funds.
- `POST /api/wallet/transfer` moves demo funds to another local user.
- `GET /api/market` returns placeholder market data.

Wallet data is written to `data/db.json`, which is ignored by git.

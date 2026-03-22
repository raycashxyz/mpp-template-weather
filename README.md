# MPP Weather API Template

A paid weather API powered by [Raycash](https://raycash.xyz) and the [Machine Payments Protocol](https://mpp.dev).

AI agents pay per query. Payments are private — your identity is encrypted on-chain via FHE.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fraycashxyz%2Fmpp-template-weather&env=RAYCASH_API_KEY,RAYCASH_URL,PRICE_PER_CALL&envDescription=Get%20your%20API%20key%20from%20raycash.xyz)

## Setup

1. Create an app at [raycash.xyz](https://raycash.xyz) and copy your API key
2. Set environment variables (see `.env.example`)
3. Deploy to Vercel or run locally:

```bash
npm install
npm run dev
```

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /` | Free | Service info |
| `GET /cities` | Free | List available cities |
| `GET /pricing` | Free | Pricing info |
| `GET /weather?city=paris` | Paid | Weather data (0.001 USDC/query) |

## Making Paid Requests

```bash
# Using the MPP CLI
pnpm mpp-pay https://your-api.vercel.app/weather?city=paris

# Or let an AI agent pay autonomously via Claude Code
```

## How It Works

1. Client requests `/weather` → gets `402 Payment Required` with pricing
2. Client signs an EIP-712 voucher authorizing payment
3. Client retries with the voucher → gets weather data
4. Operator settles vouchers via the Raycash dashboard

All payments are private: the operator's identity is FHE-encrypted on-chain.

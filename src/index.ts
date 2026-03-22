/**
 * MPP Weather API Template — paid via Raycash.
 *
 * A standalone Hono service that charges per API call using the
 * Machine Payments Protocol (MPP) with Raycash privacy.
 *
 * Deploy to Vercel or run locally. Configure via env vars.
 *
 * Free endpoints:  GET /  GET /cities  GET /pricing
 * Paid endpoint:   GET /weather?city=<name>
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Mppx } from "mppx/hono";
import { raycash } from "@raycashxyz/mpp/server";

import { getWeather, listCities } from "./weather-data.js";

// ---------------------------------------------------------------------------
// Configuration (from env vars — set by Vercel deploy or .env)
// ---------------------------------------------------------------------------

const RAYCASH_API_KEY = process.env.RAYCASH_API_KEY ?? "";
const RAYCASH_URL = process.env.RAYCASH_URL ?? "http://localhost:3003";
const PRICE_PER_CALL = process.env.PRICE_PER_CALL ?? "1000";
const CURRENCY = (process.env.CURRENCY ?? "0xded3320124c849b05c2ebec6997644a825e44e53") as `0x${string}`;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "11155111");
const MIN_DEPOSIT = process.env.MIN_DEPOSIT ?? "100000";
const PORT = Number(process.env.PORT ?? 3004);
const SERVICE_URL = process.env.SERVICE_URL ?? `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------
// MPP middleware — one line to add Raycash payments
// ---------------------------------------------------------------------------

const mppx = Mppx.create({
  secretKey: process.env.MPP_SECRET_KEY ?? "template-secret-key",
  methods: [
    raycash({
      currency: CURRENCY,
      chainId: CHAIN_ID,
      minDeposit: MIN_DEPOSIT,
      serviceUrl: SERVICE_URL,
      raycashBaseUrl: RAYCASH_URL,
      apiKey: RAYCASH_API_KEY,
    }),
  ],
});

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.get("/", (c) =>
  c.json({
    name: "Weather API (Raycash MPP)",
    description: "Paid weather data with private payments",
    pricePerQuery: `${PRICE_PER_CALL} smallest units`,
    endpoints: {
      "/weather?city=<name>": "Get weather (paid)",
      "/cities": "List available cities (free)",
      "/pricing": "Pricing info (free)",
    },
  }),
);

app.get("/cities", (c) => c.json({ cities: listCities() }));

app.get("/pricing", (c) =>
  c.json({
    method: "raycash-channel",
    pricePerQuery: PRICE_PER_CALL,
    currency: CURRENCY,
    minDeposit: MIN_DEPOSIT,
  }),
);

// Channel state endpoint — called by the MPP client SDK
app.get("/channel-state", async (c) => {
  const payer = c.req.query("payer");
  const channel = c.req.query("channel");

  if (channel) {
    const res = await fetch(
      `${RAYCASH_URL}/api/vouchers/latest?channelAddress=${encodeURIComponent(channel)}`,
      { headers: { Authorization: `Bearer ${RAYCASH_API_KEY}` } },
    );
    if (res.ok) {
      const data = (await res.json()) as { cumulativeAmount?: string };
      return c.json({ channelAddress: channel, lastCumulative: data.cumulativeAmount ?? "0" });
    }
    return c.json({ channelAddress: channel, lastCumulative: "0" });
  }

  if (!payer) return c.json({ error: "payer or channel query param required" }, 400);

  const createRes = await fetch(`${RAYCASH_URL}/api/channels/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RAYCASH_API_KEY}` },
    body: JSON.stringify({ payerAddress: payer }),
  });

  if (!createRes.ok) return c.json({ error: "Channel creation failed" }, 500);

  const data = (await createRes.json()) as { channelAddress: string; minDeposit: string };
  return c.json({ ...data, lastCumulative: "0" });
});

// Paid weather endpoint
app.get(
  "/weather",
  mppx.channel({ amount: PRICE_PER_CALL, lastCumulative: "0" }),
  (c) => {
    const city = c.req.query("city");
    if (!city) return c.json({ error: "city query parameter required" }, 400);

    const weather = getWeather(city);
    if (!weather) return c.json({ error: `Unknown city: ${city}`, availableCities: listCities() }, 404);

    return c.json(weather);
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

console.log(`Weather API starting on port ${PORT}`);
console.log(`Raycash: ${RAYCASH_URL}`);
console.log(`Currency: ${CURRENCY} (chain ${CHAIN_ID})`);
console.log(`Price: ${PRICE_PER_CALL} per query | Min deposit: ${MIN_DEPOSIT}`);

serve({ fetch: app.fetch, port: PORT });

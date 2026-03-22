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
import { Method, Receipt, Mppx, z } from "mppx";
import type { Mppx as MppxType } from "mppx/hono";

import { getWeather, listCities } from "./weather-data.js";

// ---------------------------------------------------------------------------
// Configuration (from env vars — set by Vercel deploy or .env)
// ---------------------------------------------------------------------------

const RAYCASH_API_KEY = process.env.RAYCASH_API_KEY ?? "";
const RAYCASH_URL = process.env.RAYCASH_URL ?? "http://localhost:3003";
const PRICE_PER_CALL = process.env.PRICE_PER_CALL ?? "1000"; // 0.001 USDC
const PORT = Number(process.env.PORT ?? 3004);
const SERVICE_URL = process.env.SERVICE_URL ?? `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------
// Raycash payment method (inlined — no workspace dependency)
// ---------------------------------------------------------------------------

const raycashChannel = Method.from({
  name: "raycash",
  intent: "channel",
  schema: {
    credential: {
      payload: z.object({
        signature: z.signature(),
        channel: z.address(),
        cumulativeAmount: z.amount(),
      }),
    },
    request: z.object({
      amount: z.amount(),
      lastCumulative: z.amount(),
      channelStateUrl: z.string(),
      currency: z.address(),
      chainId: z.number(),
      minDeposit: z.amount(),
    }),
  },
});

const raycashMethod = Method.toServer(raycashChannel, {
  defaults: {
    currency: "0xded3320124c849b05c2ebec6997644a825e44e53", // MockUSDC on Sepolia
    chainId: 11155111,
    minDeposit: "100000",
    lastCumulative: "0",
    channelStateUrl: `${SERVICE_URL}/channel-state`,
  },

  async request({ credential, request }) {
    const payload = credential?.payload as { channel?: string } | undefined;
    if (!payload?.channel) return request;

    const res = await fetch(
      `${RAYCASH_URL}/api/vouchers/latest?channelAddress=${encodeURIComponent(payload.channel)}`,
      { headers: { Authorization: `Bearer ${RAYCASH_API_KEY}` } },
    );
    if (res.ok) {
      const data = (await res.json()) as { cumulativeAmount?: string };
      if (data.cumulativeAmount && data.cumulativeAmount !== "0") {
        return { ...request, lastCumulative: data.cumulativeAmount };
      }
    }
    return request;
  },

  async verify({ credential }) {
    const { payload } = credential;

    const verifyRes = await fetch(`${RAYCASH_URL}/api/vouchers/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RAYCASH_API_KEY}` },
      body: JSON.stringify({
        voucher: { channel: payload.channel, cumulativeAmount: payload.cumulativeAmount },
        signature: payload.signature,
      }),
    });

    if (!verifyRes.ok) throw new Error(`Verification failed: ${verifyRes.status}`);
    const result = (await verifyRes.json()) as { valid: boolean; reason?: string };
    if (!result.valid) throw new Error(result.reason ?? "Voucher invalid");

    await fetch(`${RAYCASH_URL}/api/vouchers/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RAYCASH_API_KEY}` },
      body: JSON.stringify({
        voucher: { channel: payload.channel, cumulativeAmount: payload.cumulativeAmount },
        signature: payload.signature,
      }),
    });

    return Receipt.from({
      method: "raycash",
      status: "success",
      timestamp: new Date().toISOString(),
      reference: `${payload.channel}:${payload.cumulativeAmount}`,
    });
  },
});

// ---------------------------------------------------------------------------
// MPP middleware
// ---------------------------------------------------------------------------

const { Mppx: HonoMppx } = await import("mppx/hono") as { Mppx: typeof MppxType };

const mppx = HonoMppx.create({
  secretKey: process.env.MPP_SECRET_KEY ?? "template-secret-key",
  methods: [raycashMethod],
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
    currency: "USDC",
    minDeposit: "100000",
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

  if (!createRes.ok) {
    return c.json({ error: `Channel creation failed` }, 500);
  }

  const data = (await createRes.json()) as { channelAddress: string; minDeposit: string };
  return c.json({ ...data, lastCumulative: "0" });
});

// Paid weather endpoint
app.get(
  "/weather",
  mppx.channel({ amount: PRICE_PER_CALL }),
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
console.log(`Price: ${PRICE_PER_CALL} per query`);

serve({ fetch: app.fetch, port: PORT });

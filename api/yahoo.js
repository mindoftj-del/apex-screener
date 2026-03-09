// ─── VERCEL EDGE FUNCTION — Yahoo Finance Proxy ───────────────────────────────
// Sits at /api/yahoo?symbols=NQ=F,ES=F,CL=F,GC=F&interval=1m&range=1d
//
// WHY THIS EXISTS:
//   Yahoo Finance blocks direct browser requests (CORS + cookie checks).
//   This function runs server-side on Vercel's edge network, fetches Yahoo,
//   and returns clean candle JSON to the React app.
//
// COST: $0 — included in Vercel free tier (100k edge invocations/day limit)
// LATENCY: ~200–400ms per poll (acceptable for 30s refresh cycle)

export const config = { runtime: 'edge' }

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

// Map our internal symbols → Yahoo Finance tickers
const YAHOO_TICKERS = {
  NQ: 'NQ=F',
  ES: 'ES=F',
  CL: 'CL=F',
  GC: 'GC=F',
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const sym      = searchParams.get('sym')      // e.g. "NQ"
  const interval = searchParams.get('interval') || '1m'
  const range    = searchParams.get('range')    || '1d'

  if (!sym || !YAHOO_TICKERS[sym]) {
    return new Response(JSON.stringify({ error: 'Unknown symbol' }), {
      status: 400,
      headers: corsHeaders('application/json'),
    })
  }

  const ticker = YAHOO_TICKERS[sym]
  const url    = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo returned ${res.status}` }), {
        status: 502,
        headers: corsHeaders('application/json'),
      })
    }

    const json   = await res.json()
    const result = json?.chart?.result?.[0]

    if (!result) {
      return new Response(JSON.stringify({ error: 'No data from Yahoo', raw: json }), {
        status: 502,
        headers: corsHeaders('application/json'),
      })
    }

    // ── Parse candles ──────────────────────────────────────────────────────
    const timestamps = result.timestamp || []
    const q          = result.indicators?.quote?.[0] || {}
    const candles    = []

    for (let i = 0; i < timestamps.length; i++) {
      const open   = q.open?.[i]
      const high   = q.high?.[i]
      const low    = q.low?.[i]
      const close  = q.close?.[i]
      const volume = q.volume?.[i]
      // Skip null candles (Yahoo fills gaps with nulls)
      if (open == null || close == null) continue
      candles.push({
        ts:     timestamps[i] * 1000,  // ms epoch
        open:   open,
        high:   high  ?? open,
        low:    low   ?? open,
        close:  close,
        volume: volume ?? 0,
      })
    }

    const meta = result.meta || {}
    const payload = {
      sym,
      ticker,
      price:         meta.regularMarketPrice   ?? candles[candles.length - 1]?.close ?? 0,
      previousClose: meta.chartPreviousClose   ?? 0,
      marketState:   meta.marketState          ?? 'UNKNOWN',
      candles,
      fetchedAt:     Date.now(),
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: corsHeaders('application/json'),
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders('application/json'),
    })
  }
}

function corsHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
  }
}

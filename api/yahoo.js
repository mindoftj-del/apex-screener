// ─── VERCEL EDGE FUNCTION — Yahoo Finance Proxy ───────────────────────────────
// Two endpoints:
//
//   GET /api/yahoo?quotes=AAPL,TSLA,NVDA,...
//     → Yahoo v7/finance/quote   — current price, bid/ask, prev close
//     → Polled every 15s by the frontend for live-ish prices
//
//   GET /api/yahoo?chart=NQ&interval=1m&range=1d
//     → Yahoo v8/finance/chart   — OHLCV candle history
//     → Polled every 90s for candle-based indicators (RSI, VWAP, etc.)
//
// WHY EDGE: Yahoo blocks browser CORS. This runs server-side on Vercel's
//           edge network, fetches Yahoo, returns clean JSON. Cost: $0.

export const config = { runtime: 'edge' }

const Y_QUOTE = 'https://query1.finance.yahoo.com/v7/finance/quote'
const Y_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'
const Y_HDRS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json,text/plain,*/*',
}

// Futures need =F suffix; stocks and ETFs use raw ticker
const TICKER_MAP = {
  // Futures
  NQ: 'NQ=F', ES: 'ES=F', CL: 'CL=F', GC: 'GC=F',
  // Stocks
  AAPL: 'AAPL', TSLA: 'TSLA', NVDA: 'NVDA', MSFT: 'MSFT',
  AMD: 'AMD', SPY: 'SPY', QQQ: 'QQQ', META: 'META',
}

// ─── CORS HEADERS ─────────────────────────────────────────────────────────────
function cors(ct = 'application/json') {
  return {
    'Content-Type': ct,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store, max-age=0',
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() })
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() })
  }

  const { searchParams } = new URL(req.url)

  // ── ROUTE 1: Quote prices (/api/yahoo?quotes=AAPL,TSLA,...)
  const quotesParam = searchParams.get('quotes')
  if (quotesParam) {
    const syms    = quotesParam.split(',').map(s => s.trim()).filter(s => TICKER_MAP[s])
    const tickers = syms.map(s => TICKER_MAP[s]).join(',')
    try {
      const res  = await fetch(`${Y_QUOTE}?symbols=${tickers}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketState`, { headers: Y_HDRS })
      const body = await res.json()
      const rows  = body?.quoteResponse?.result ?? []
      // Re-key by our internal symbol
      const out = {}
      rows.forEach(r => {
        // Reverse-map Yahoo ticker → our sym
        const sym = Object.keys(TICKER_MAP).find(k => TICKER_MAP[k] === r.symbol)
        if (!sym) return
        out[sym] = {
          price:         r.regularMarketPrice            ?? 0,
          previousClose: r.regularMarketPreviousClose    ?? 0,
          change:        r.regularMarketChange           ?? 0,
          changePct:     r.regularMarketChangePercent    ?? 0,
          volume:        r.regularMarketVolume           ?? 0,
          marketState:   r.marketState                   ?? 'UNKNOWN',
        }
      })
      return json({ quotes: out, fetchedAt: Date.now() })
    } catch (err) {
      return json({ error: err.message }, 502)
    }
  }

  // ── ROUTE 2: Chart candles (/api/yahoo?chart=NQ&interval=1m&range=1d)
  const chartSym = searchParams.get('chart') || searchParams.get('sym')
  if (chartSym) {
    const ticker   = TICKER_MAP[chartSym]
    if (!ticker) return json({ error: `Unknown symbol: ${chartSym}` }, 400)

    const interval = searchParams.get('interval') || '1m'
    const range    = searchParams.get('range')    || '1d'
    try {
      const res  = await fetch(`${Y_CHART}/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`, { headers: Y_HDRS })
      if (!res.ok) return json({ error: `Yahoo HTTP ${res.status}` }, 502)
      const body = await res.json()
      const result = body?.chart?.result?.[0]
      if (!result) return json({ error: 'No chart result' }, 502)

      const timestamps = result.timestamp ?? []
      const q = result.indicators?.quote?.[0] ?? {}
      const candles = []
      for (let i = 0; i < timestamps.length; i++) {
        const o = q.open?.[i], c = q.close?.[i]
        if (o == null || c == null) continue
        candles.push({
          ts:     timestamps[i] * 1000,
          open:   o,
          high:   q.high?.[i]   ?? o,
          low:    q.low?.[i]    ?? o,
          close:  c,
          volume: q.volume?.[i] ?? 0,
        })
      }
      const meta = result.meta ?? {}
      return json({
        sym: chartSym, ticker,
        price:         meta.regularMarketPrice  ?? candles.at(-1)?.close ?? 0,
        previousClose: meta.chartPreviousClose  ?? 0,
        marketState:   meta.marketState         ?? 'UNKNOWN',
        candles,
        fetchedAt: Date.now(),
      })
    } catch (err) {
      return json({ error: err.message }, 502)
    }
  }

  return json({ error: 'Missing required param: quotes or chart' }, 400)
}

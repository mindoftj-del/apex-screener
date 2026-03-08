// ─── MASSIVE.COM DATA HOOK ────────────────────────────────────────────────────
// Formerly Polygon.io — rebranded to Massive.com on October 30, 2025
// Handles: REST snapshot fetch + WebSocket real-time stream
// Docs: https://massive.com/docs
// Free tier: 5 REST calls/min only (no WebSocket)
// Starter plan: Unlimited REST + WebSocket streaming (REQUIRED for live alerts)
// Note: api.polygon.io endpoints still work during transition period,
//       but api.massive.com is the current canonical base.

import { useEffect, useRef, useCallback } from 'react'
import { STOCKS_CONFIG, FUTURES_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

const POLYGON_API_KEY = import.meta.env.VITE_MASSIVE_API_KEY
const POLYGON_WS_URL  = import.meta.env.VITE_MASSIVE_WS_URL || 'wss://socket.massive.com/stocks'
const POLYGON_BASE    = 'https://api.massive.com'

// Convert 1-min bars from Polygon to our candle format
function polygonBarToCandle(bar) {
  return {
    open:   bar.o,
    high:   bar.h,
    low:    bar.l,
    close:  bar.c,
    volume: bar.v,
  }
}

// Fetch last N 1-minute bars for a stock ticker (REST)
async function fetchStockHistory(ticker, limit = 20) {
  if (!POLYGON_API_KEY || POLYGON_API_KEY === 'your_polygon_api_key_here') return []
  try {
    const to   = new Date()
    const from = new Date(to.getTime() - 60 * limit * 60 * 1000) // generous window
    const url  = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/minute/${from.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=${limit}&apiKey=${POLYGON_API_KEY}`
    const res  = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).slice(-20).map(polygonBarToCandle)
  } catch { return [] }
}

// Fetch snapshot for multiple tickers at once (REST)
async function fetchSnapshots(tickers) {
  if (!POLYGON_API_KEY || POLYGON_API_KEY === 'your_polygon_api_key_here') return {}
  try {
    const tickerList = tickers.join(',')
    const url  = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerList}&apiKey=${POLYGON_API_KEY}`
    const res  = await fetch(url)
    if (!res.ok) return {}
    const data = await res.json()
    const map  = {}
    ;(data.tickers || []).forEach(t => { map[t.ticker] = t })
    return map
  } catch { return {} }
}

// Build full state object from candles + live price
function buildStateFromCandles(sym, market, candles, livePrice) {
  const price = livePrice || candles[candles.length - 1]?.close || 0
  const vwap  = calcVWAP(candles)
  const rsi   = calcRSI(candles)
  const ema8  = calcEMA(candles, 8)
  const volRatio   = calcVolRatio(candles)
  const structure  = detectMarketStructure(candles)
  const vwapDev    = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const prevClose  = candles[candles.length - 3]?.close || price
  const pct        = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return { price, vwap, rsi, ema8, volRatio, structure, vwapDev, pct, candles, market, source: 'live' }
}

export function usePolygonData(active, onUpdate) {
  const wsRef       = useRef(null)
  const historiesRef = useRef({})
  const livePrices  = useRef({})

  // ── Initial REST fetch for all stock tickers ──────────────────────────────
  const fetchInitialData = useCallback(async () => {
    const stockTickers   = STOCKS_CONFIG.map(s => s.sym)
    const futuresTickers = FUTURES_CONFIG.map(f => f.sym) // polygon futures: 'I:ES1!' format

    // Fetch histories in parallel (rate limit aware — free tier is 5/min)
    const allTickers = [...stockTickers]
    for (const ticker of allTickers) {
      const candles = await fetchStockHistory(ticker, 20)
      if (candles.length > 0) {
        historiesRef.current[ticker] = candles
        const cfg = STOCKS_CONFIG.find(s => s.sym === ticker)
        if (cfg) onUpdate(ticker, buildStateFromCandles(ticker, 'US', candles, null))
      }
      await new Promise(r => setTimeout(r, 250)) // gentle rate limiting
    }
  }, [onUpdate])

  // ── Polygon WebSocket for real-time stock quotes ──────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!POLYGON_API_KEY || POLYGON_API_KEY === 'your_polygon_api_key_here') return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(POLYGON_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      // Authenticate
      ws.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }))
    }

    ws.onmessage = (event) => {
      try {
        const messages = JSON.parse(event.data)
        messages.forEach(msg => {
          // After auth success, subscribe to all stock tickers
          if (msg.ev === 'status' && msg.status === 'auth_success') {
            const stockSubs   = STOCKS_CONFIG.map(s => `T.${s.sym}`).join(',')  // trades
            const minuteSubs  = STOCKS_CONFIG.map(s => `AM.${s.sym}`).join(',') // 1-min aggs
            ws.send(JSON.stringify({ action: 'subscribe', params: `${stockSubs},${minuteSubs}` }))
          }

          // Real-time trade (T.) — update live price
          if (msg.ev === 'T') {
            const sym = msg.sym
            livePrices.current[sym] = msg.p
            const candles = historiesRef.current[sym]
            if (candles?.length > 0) {
              onUpdate(sym, buildStateFromCandles(sym, 'US', candles, msg.p))
            }
          }

          // 1-minute aggregate (AM.) — new candle closes
          if (msg.ev === 'AM') {
            const sym = msg.sym
            const newCandle = { open: msg.o, high: msg.h, low: msg.l, close: msg.c, volume: msg.av || msg.v }
            const prev = historiesRef.current[sym] || []
            const updated = [...prev.slice(-19), newCandle]
            historiesRef.current[sym] = updated
            onUpdate(sym, buildStateFromCandles(sym, 'US', updated, livePrices.current[sym] || msg.c))
          }
        })
      } catch {}
    }

    ws.onerror = () => {}
    ws.onclose = () => {
      // Reconnect after 3s if still active
      if (active) setTimeout(connectWebSocket, 3000)
    }
  }, [active, onUpdate])

  useEffect(() => {
    if (!active) return
    fetchInitialData()
    connectWebSocket()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [active])

  return { historiesRef, livePrices }
}

// ─── POLYGON FUTURES SNAPSHOT ─────────────────────────────────────────────────
// Polygon futures use index format: I:ES1! I:NQ1! etc.
// Requires Futures add-on on Polygon ($)
// This fetches the indices as a fallback using /v2/snapshot/locale/global/markets/forex
export async function fetchFuturesSnapshot(apiKey) {
  if (!apiKey || apiKey === 'your_polygon_api_key_here') return {}
  try {
    // Polygon indices endpoint
    const symbols = ['I:ES1!', 'I:NQ1!', 'I:CL1!', 'I:GC1!']
    const results = {}
    for (const sym of symbols) {
      const res = await fetch(`${POLYGON_BASE}/v2/snapshot/locale/global/markets/indices/tickers?tickers=${encodeURIComponent(sym)}&apiKey=${apiKey}`)
      if (res.ok) {
        const data = await res.json()
        const ticker = (data.results || [])[0]
        if (ticker) {
          const shortSym = sym.replace('I:', '').replace('1!', '')
          results[shortSym] = ticker
        }
      }
      await new Promise(r => setTimeout(r, 200))
    }
    return results
  } catch { return {} }
}

// ─── MASSIVE.COM DATA HOOK ────────────────────────────────────────────────────
// Formerly Polygon.io — rebranded to Massive.com on October 30, 2025
// FIX: WebSocket auto-reconnect with exponential backoff
// FIX: REST request queue to avoid free-tier rate limits (5 req/min)
// FIX: API key never exposed to client — reads from env var only

import { useEffect, useRef, useCallback } from 'react'
import { STOCKS_CONFIG, FUTURES_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

const POLYGON_API_KEY = import.meta.env.VITE_MASSIVE_API_KEY
const POLYGON_WS_URL  = import.meta.env.VITE_MASSIVE_WS_URL || 'wss://socket.massive.com/stocks'
const POLYGON_BASE    = 'https://api.massive.com'
const MAX_BACKOFF_MS  = 30000
const RATE_LIMIT_MS   = 13000  // ~5 req/min on free tier → 1 per 13s to be safe

// ─── REQUEST QUEUE ────────────────────────────────────────────────────────────
// Serializes REST calls to stay within Massive.com free tier rate limits.
const queue = []
let queueRunning = false

function enqueueRequest(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject })
    if (!queueRunning) drainQueue()
  })
}

async function drainQueue() {
  if (queue.length === 0) { queueRunning = false; return }
  queueRunning = true
  const { fn, resolve, reject } = queue.shift()
  try { resolve(await fn()) } catch (e) { reject(e) }
  setTimeout(drainQueue, RATE_LIMIT_MS)
}

function polygonBarToCandle(bar) {
  return { open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v }
}

async function fetchStockHistory(ticker, limit = 30) {
  if (!POLYGON_API_KEY || POLYGON_API_KEY === 'your_massive_api_key_here') return []
  return enqueueRequest(async () => {
    try {
      const to   = new Date()
      const from = new Date(to.getTime() - 60 * limit * 60 * 1000)
      const url  = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/minute/${from.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=${limit}&apiKey=${POLYGON_API_KEY}`
      const res  = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return (data.results || []).slice(-30).map(polygonBarToCandle)
    } catch { return [] }
  })
}

function buildStateFromCandles(sym, market, candles, livePrice) {
  const price     = livePrice || candles[candles.length - 1]?.close || 0
  const vwap      = calcVWAP(candles)
  const rsi       = calcRSI(candles)
  const ema8      = calcEMA(candles, 8)
  const volRatio  = calcVolRatio(candles)
  const structure = detectMarketStructure(candles)
  const vwapDev   = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const prevClose = candles[candles.length - 3]?.close || price
  const pct       = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return { price, vwap, rsi, ema8, volRatio, structure, vwapDev, pct, candles, market, source: 'live' }
}

export function usePolygonData(active, onUpdate) {
  const wsRef         = useRef(null)
  const historiesRef  = useRef({})
  const livePrices    = useRef({})
  const reconnectRef  = useRef(0)
  const activeRef     = useRef(active)

  useEffect(() => { activeRef.current = active }, [active])

  const fetchInitialData = useCallback(async () => {
    for (const { sym, market } of STOCKS_CONFIG) {
      const candles = await fetchStockHistory(sym, 30)
      if (candles.length > 0) {
        historiesRef.current[sym] = candles
        onUpdate(sym, buildStateFromCandles(sym, market, candles, null))
      }
    }
  }, [onUpdate])

  const connectWebSocket = useCallback(() => {
    if (!POLYGON_API_KEY || POLYGON_API_KEY === 'your_massive_api_key_here') return
    if (!activeRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(POLYGON_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectRef.current = 0
      ws.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }))
    }

    ws.onmessage = (event) => {
      try {
        const messages = JSON.parse(event.data)
        messages.forEach(msg => {
          if (msg.ev === 'status' && msg.status === 'auth_success') {
            const stockSubs  = STOCKS_CONFIG.map(s => `T.${s.sym}`).join(',')
            const minuteSubs = STOCKS_CONFIG.map(s => `AM.${s.sym}`).join(',')
            ws.send(JSON.stringify({ action: 'subscribe', params: `${stockSubs},${minuteSubs}` }))
          }

          if (msg.ev === 'T') {
            const sym = msg.sym
            livePrices.current[sym] = msg.p
            const candles = historiesRef.current[sym]
            if (candles?.length > 0) {
              onUpdate(sym, buildStateFromCandles(sym, 'US', candles, msg.p))
            }
          }

          if (msg.ev === 'AM') {
            const sym       = msg.sym
            const newCandle = { open: msg.o, high: msg.h, low: msg.l, close: msg.c, volume: msg.av || msg.v }
            const prev      = historiesRef.current[sym] || []
            const updated   = [...prev.slice(-29), newCandle]
            historiesRef.current[sym] = updated
            onUpdate(sym, buildStateFromCandles(sym, 'US', updated, livePrices.current[sym] || msg.c))
          }
        })
      } catch {}
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      if (!activeRef.current) return
      const delay = Math.min(1000 * Math.pow(2, reconnectRef.current), MAX_BACKOFF_MS)
      reconnectRef.current++
      setTimeout(connectWebSocket, delay)
    }
  }, [onUpdate])

  useEffect(() => {
    if (!active) return
    fetchInitialData()
    connectWebSocket()
    return () => {
      activeRef.current = false
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [active])
}

export async function fetchFuturesSnapshot(apiKey) {
  if (!apiKey || apiKey === 'your_massive_api_key_here') return {}
  try {
    const symbols = ['I:ES1!', 'I:NQ1!', 'I:CL1!', 'I:GC1!']
    const results = {}
    for (const sym of symbols) {
      const res = await fetch(`${POLYGON_BASE}/v2/snapshot/locale/global/markets/indices/tickers?tickers=${encodeURIComponent(sym)}&apiKey=${apiKey}`)
      if (res.ok) {
        const data   = await res.json()
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

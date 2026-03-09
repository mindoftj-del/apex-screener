// ─── BINANCE WEBSOCKET HOOK ───────────────────────────────────────────────────
// Free, no API key needed for public market data streams
// FIX: Auto-reconnect with exponential backoff (was dropping after ~30 min)
// FIX: Heartbeat ping every 20s to prevent silent connection death

import { useEffect, useRef, useCallback } from 'react'
import { CRYPTO_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream'
const BINANCE_REST    = 'https://api.binance.com/api/v3'
const MAX_BACKOFF_MS  = 30000  // cap reconnect at 30s
const PING_INTERVAL   = 20000  // ping every 20s

async function fetchBinanceKlines(symbol, interval = '1m', limit = 30) {
  try {
    const url = `${BINANCE_REST}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) return []
    const raw = await res.json()
    return raw.map(k => ({
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
      ts:     k[0],
    }))
  } catch { return [] }
}

function buildCryptoState(sym, candles, livePrice) {
  const price     = livePrice || candles[candles.length - 1]?.close || 0
  const vwap      = calcVWAP(candles)
  const rsi       = calcRSI(candles)
  const ema8      = calcEMA(candles, 8)
  const volRatio  = calcVolRatio(candles)
  const structure = detectMarketStructure(candles)
  const vwapDev   = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const prevClose = candles[candles.length - 3]?.close || price
  const pct       = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return { price, vwap, rsi, ema8, volRatio, structure, vwapDev, pct, candles, market: 'CRYPTO', source: 'live' }
}

export function useBinanceData(active, onUpdate) {
  const wsRef         = useRef(null)
  const historiesRef  = useRef({})
  const livePrices    = useRef({})
  const reconnectRef  = useRef(0)      // backoff attempt count
  const pingTimerRef  = useRef(null)
  const activeRef     = useRef(active) // stable ref for callbacks

  useEffect(() => { activeRef.current = active }, [active])

  const fetchInitial = useCallback(async () => {
    for (const cfg of CRYPTO_CONFIG) {
      try {
        const pair    = cfg.binancePair.toUpperCase()
        const candles = await fetchBinanceKlines(pair, '1m', 30)
        if (candles.length > 0) {
          historiesRef.current[cfg.sym] = candles
          onUpdate(cfg.sym, buildCryptoState(cfg.sym, candles, null))
        }
      } catch {}
      await new Promise(r => setTimeout(r, 150))
    }
  }, [onUpdate])

  const clearPing = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
  }, [])

  const connectWS = useCallback(() => {
    if (!activeRef.current) return

    const streams = CRYPTO_CONFIG.flatMap(cfg => [
      `${cfg.binancePair}@kline_1m`,
      `${cfg.binancePair}@trade`,
    ]).join('/')

    const url = `${BINANCE_WS_BASE}?streams=${streams}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectRef.current = 0 // reset backoff on successful connect

      // Heartbeat — Binance silently closes idle connections after ~30 min
      clearPing()
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: 'ping' }))
        }
      }, PING_INTERVAL)
    }

    ws.onmessage = (event) => {
      try {
        const msg  = JSON.parse(event.data)
        const data = msg.data
        if (!data) return

        const cfg = CRYPTO_CONFIG.find(c =>
          data.s?.toLowerCase() === c.binancePair.toLowerCase()
        )
        if (!cfg) return

        if (data.e === 'trade') {
          livePrices.current[cfg.sym] = parseFloat(data.p)
          const candles = historiesRef.current[cfg.sym]
          if (candles?.length > 0) {
            onUpdate(cfg.sym, buildCryptoState(cfg.sym, candles, parseFloat(data.p)))
          }
        }

        if (data.e === 'kline') {
          const k = data.k
          const newCandle = {
            open:   parseFloat(k.o),
            high:   parseFloat(k.h),
            low:    parseFloat(k.l),
            close:  parseFloat(k.c),
            volume: parseFloat(k.v),
            ts:     k.t,
          }
          const prev = historiesRef.current[cfg.sym] || []
          let updated

          if (prev.length > 0 && prev[prev.length - 1].ts === k.t) {
            updated = [...prev.slice(0, -1), newCandle]
          } else if (k.x) {
            updated = [...prev.slice(-29), newCandle]
          } else {
            updated = prev
          }

          historiesRef.current[cfg.sym] = updated
          onUpdate(cfg.sym, buildCryptoState(cfg.sym, updated, parseFloat(k.c)))
        }
      } catch {}
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      clearPing()
      if (!activeRef.current) return

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap)
      const delay = Math.min(1000 * Math.pow(2, reconnectRef.current), MAX_BACKOFF_MS)
      reconnectRef.current++
      setTimeout(connectWS, delay)
    }
  }, [onUpdate, clearPing])

  useEffect(() => {
    if (!active) return
    fetchInitial().then(() => connectWS())

    return () => {
      activeRef.current = false
      clearPing()
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on intentional teardown
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [active])
}

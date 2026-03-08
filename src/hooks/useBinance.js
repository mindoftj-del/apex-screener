// ─── BINANCE WEBSOCKET HOOK ───────────────────────────────────────────────────
// Free, no API key needed for public market data streams
// Docs: https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams
// Streams used:
//   <symbol>@kline_1m  — 1-minute candlestick updates
//   <symbol>@trade     — real-time trade price

import { useEffect, useRef, useCallback } from 'react'
import { CRYPTO_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream'
const BINANCE_REST    = 'https://api.binance.com/api/v3'

// ─── REST: Fetch initial kline (candle) history ───────────────────────────────
async function fetchBinanceKlines(symbol, interval = '1m', limit = 22) {
  try {
    const url = `${BINANCE_REST}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) return []
    const raw = await res.json()
    // Binance kline format: [openTime, open, high, low, close, volume, ...]
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
  const wsRef        = useRef(null)
  const historiesRef = useRef({})
  const livePrices   = useRef({})

  // ── Fetch initial history for all crypto pairs ────────────────────────────
  const fetchInitial = useCallback(async () => {
    for (const cfg of CRYPTO_CONFIG) {
      const pair    = cfg.binancePair.toUpperCase() // e.g. BTCUSDT
      const candles = await fetchBinanceKlines(pair, '1m', 22)
      if (candles.length > 0) {
        historiesRef.current[cfg.sym] = candles
        onUpdate(cfg.sym, buildCryptoState(cfg.sym, candles, null))
      }
      await new Promise(r => setTimeout(r, 150)) // avoid rate limit
    }
  }, [onUpdate])

  // ── WebSocket combined stream ─────────────────────────────────────────────
  // Subscribes to: btcusdt@kline_1m, ethusdt@kline_1m, etc.
  const connectWS = useCallback(() => {
    const streams = CRYPTO_CONFIG.flatMap(cfg => [
      `${cfg.binancePair}@kline_1m`,
      `${cfg.binancePair}@trade`,
    ]).join('/')

    const url = `${BINANCE_WS_BASE}?streams=${streams}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg  = JSON.parse(event.data)
        const data = msg.data
        if (!data) return

        // Find the symbol config for this stream
        const cfg = CRYPTO_CONFIG.find(c =>
          data.s?.toLowerCase() === c.binancePair ||
          data.s?.toLowerCase() === c.binancePair.toUpperCase().toLowerCase()
        )
        if (!cfg) return

        // ── Real-time trade ── updates live price only
        if (data.e === 'trade') {
          livePrices.current[cfg.sym] = parseFloat(data.p)
          const candles = historiesRef.current[cfg.sym]
          if (candles?.length > 0) {
            onUpdate(cfg.sym, buildCryptoState(cfg.sym, candles, parseFloat(data.p)))
          }
        }

        // ── 1-min kline update ── updates candle history
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
          const prev    = historiesRef.current[cfg.sym] || []
          let updated

          // If same candle (not yet closed), update last candle
          if (prev.length > 0 && prev[prev.length - 1].ts === k.t) {
            updated = [...prev.slice(0, -1), newCandle]
          } else if (k.x) {
            // Candle closed — append new candle
            updated = [...prev.slice(-19), newCandle]
          } else {
            updated = prev
          }

          historiesRef.current[cfg.sym] = updated
          onUpdate(cfg.sym, buildCryptoState(cfg.sym, updated, parseFloat(k.c)))
        }
      } catch {}
    }

    ws.onerror  = () => {}
    ws.onclose  = () => {
      if (active) setTimeout(connectWS, 3000)
    }
  }, [active, onUpdate])

  useEffect(() => {
    if (!active) return
    fetchInitial().then(() => connectWS())
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [active])
}

// ─── MASTER DATA HOOK ─────────────────────────────────────────────────────────
// Routes data to the right source per market type:
//
//   FUTURES  (NQ/ES/CL/GC)
//     With Massive key → usePolygonData   (real-time WebSocket)
//     Without key      → useYahooData     (Yahoo chart, ~15 min delay)
//
//   STOCKS   (AAPL/TSLA/NVDA/MSFT/AMD/SPY/QQQ/META)
//     With Massive key → usePolygonData   (real-time WebSocket)
//     Without key      → useYahooStocks   (Yahoo quote+chart, real prices)
//                        • Price updates every 15s via v7/quote
//                        • Candles refresh every 90s via v8/chart
//                        • NO simulation — actual market prices
//
//   CRYPTO   (BTC/ETH/SOL/BNB)
//     Always           → useBinanceData   (real-time WebSocket, always free)
//
// UI badge:
//   LIVE    = Massive.com real-time
//   DELAYED = Yahoo Finance (~15 min delay) + Binance live crypto

import { useState, useCallback, useRef } from 'react'
import { usePolygonData } from './usePolygon.js'
import { useBinanceData } from './useBinance.js'
import { useYahooData }   from './useYahoo.js'
import { useYahooStocks } from './useYahooStocks.js'

const HAS_MASSIVE_KEY = !!(
  import.meta.env.VITE_MASSIVE_API_KEY &&
  import.meta.env.VITE_MASSIVE_API_KEY !== 'your_massive_api_key_here'
)

export function useMarketData(active) {
  const [marketData, setMarketData] = useState({})
  const dataRef = useRef({})

  const onUpdate = useCallback((sym, state) => {
    dataRef.current[sym] = state
    setMarketData(prev => ({ ...prev, [sym]: state }))
  }, [])

  // Real-time (Massive.com) — stocks + futures when API key is set
  usePolygonData(active && HAS_MASSIVE_KEY, onUpdate)

  // Crypto — always live via Binance WebSocket (free, no key needed)
  useBinanceData(active, onUpdate)

  // Futures via Yahoo when no Massive key (NQ/ES/CL/GC, chart only)
  useYahooData(active && !HAS_MASSIVE_KEY, onUpdate)

  // Stocks via Yahoo when no Massive key (quote prices + chart candles)
  useYahooStocks(active && !HAS_MASSIVE_KEY, onUpdate)

  return {
    marketData,
    isLive:   HAS_MASSIVE_KEY,
    dataMode: HAS_MASSIVE_KEY ? 'LIVE' : 'DELAYED',
  }
}

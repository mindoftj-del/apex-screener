// ─── MASTER DATA HOOK ─────────────────────────────────────────────────────────
// Routes data to the right source automatically:
//
//   FUTURES (NQ/ES/CL/GC):
//     • Massive.com key set  → usePolygonData (real-time WebSocket)
//     • No key               → useYahooData   (15-min delayed, free, via Edge Fn)
//
//   STOCKS (AAPL/TSLA/NVDA etc.):
//     • Massive.com key set  → usePolygonData
//     • No key               → useSimulation  (sim data)
//
//   CRYPTO (BTC/ETH/SOL/BNB):
//     • Always               → useBinanceData (free, real-time WebSocket)
//
// DATA MODE labels shown in the UI header badge:
//   LIVE     — Massive.com WebSocket streaming
//   YAHOO    — Yahoo Finance 15-min delayed (futures only)
//   SIM      — Full simulation fallback

import { useState, useCallback, useRef } from 'react'
import { usePolygonData }  from './usePolygon.js'
import { useBinanceData }  from './useBinance.js'
import { useSimulation }   from './useSimulation.js'
import { useYahooData }    from './useYahoo.js'

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

  // ── Massive.com (stocks + futures when key is set) ─────────────────────────
  usePolygonData(active && HAS_MASSIVE_KEY, onUpdate)

  // ── Binance (crypto — always free, always live) ────────────────────────────
  useBinanceData(active, onUpdate)

  // ── Yahoo Finance (futures — when NO Massive key) ─────────────────────────
  // Gives real candle data for NQ/ES/CL/GC at 15-min delay, for free.
  // Much better than simulation: real price levels, real structure, real signals.
  useYahooData(active && !HAS_MASSIVE_KEY, onUpdate)

  // ── Simulation (stocks — when NO Massive key) ─────────────────────────────
  // Stocks stay on simulation until Massive.com is wired up.
  // Crypto is live via Binance regardless.
  useSimulation(active && !HAS_MASSIVE_KEY, onUpdate)

  // Determine what label to show in the UI
  const dataMode = HAS_MASSIVE_KEY
    ? 'LIVE'
    : 'YAHOO+SIM'

  return {
    marketData,
    isLive:   HAS_MASSIVE_KEY,
    dataMode,
  }
}

// ─── MASTER DATA HOOK ─────────────────────────────────────────────────────────
// Automatically routes to:
//   • Polygon (stocks/futures) + Binance (crypto) when API key is set
//   • Simulation fallback when no API key

import { useState, useCallback, useRef } from 'react'
import { usePolygonData } from './usePolygon.js'
import { useBinanceData } from './useBinance.js'
import { useSimulation }  from './useSimulation.js'

const HAS_POLYGON_KEY = !!(
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

  // ── Live data feeds ────────────────────────────────────────────────────────
  usePolygonData(active && HAS_POLYGON_KEY, onUpdate)
  useBinanceData(active && HAS_POLYGON_KEY, onUpdate) // Binance always free

  // ── Simulation fallback ───────────────────────────────────────────────────
  // Runs for all symbols when no Polygon key, or for futures (Polygon futures requires add-on)
  useSimulation(active && !HAS_POLYGON_KEY, onUpdate)

  return {
    marketData,
    isLive: HAS_POLYGON_KEY,
    dataMode: HAS_POLYGON_KEY ? 'LIVE' : 'SIMULATION',
  }
}

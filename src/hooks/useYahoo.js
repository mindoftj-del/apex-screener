// ─── YAHOO FINANCE FUTURES HOOK ───────────────────────────────────────────────
// Polls /api/yahoo every 30 seconds for NQ, ES, CL, GC candle data.
// Routes through the Vercel edge function proxy (CORS workaround).
//
// Data is ~15 min delayed for futures on Yahoo's free feed.
// Good enough for ICT/SMC pattern detection — signals are structure-based,
// not tick-by-tick. Upgrade to Databento ($179/mo) when going live commercial.
//
// POLL INTERVAL: 30s  (Yahoo rate-limits aggressive polling; 30s is safe)
// CANDLES RETURNED: last full trading day, 1-min bars (~390 candles)
// We slice to last 50 for signal engine (more than enough for all patterns)

import { useEffect, useRef, useCallback } from 'react'
import { FUTURES_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

const POLL_INTERVAL = 30_000   // 30 seconds
const CANDLE_WINDOW = 50       // candles fed to signal engine
const API_STAGGER   = 4_000    // stagger per-symbol polls by 4s to be gentle

function buildFuturesState(sym, candles, livePrice, prevClose) {
  const price     = livePrice || candles[candles.length - 1]?.close || 0
  const vwap      = calcVWAP(candles)
  const rsi       = calcRSI(candles)
  const ema8      = calcEMA(candles, 8)
  const volRatio  = calcVolRatio(candles)
  const structure = detectMarketStructure(candles)
  const vwapDev   = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const pct       = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return {
    price, vwap, rsi, ema8, volRatio, structure,
    vwapDev, pct, candles,
    market: 'FUT',
    source: 'yahoo',       // shows as "YAHOO" badge in UI instead of SIM
  }
}

async function fetchYahooCandles(sym) {
  // In dev (localhost), hit Yahoo directly via the edge function path.
  // In production (Vercel), same path works as a serverless function.
  const url = `/api/yahoo?sym=${sym}&interval=1m&range=1d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Yahoo proxy ${res.status} for ${sym}`)
  return res.json()
}

export function useYahooData(active, onUpdate) {
  const timerRefs  = useRef({})   // per-symbol interval handles
  const activeRef  = useRef(active)

  useEffect(() => { activeRef.current = active }, [active])

  const pollSymbol = useCallback(async (sym, cfg) => {
    if (!activeRef.current) return
    try {
      const data = await fetchYahooCandles(sym)
      if (!data?.candles?.length) return

      // Slice to last CANDLE_WINDOW candles for the engine
      const candles = data.candles.slice(-CANDLE_WINDOW)
      const state   = buildFuturesState(sym, candles, data.price, data.previousClose)
      onUpdate(sym, state)
    } catch {
      // Silently fail — simulation keeps running as fallback
    }
  }, [onUpdate])

  useEffect(() => {
    if (!active) return

    // Stagger initial polls so we don't hit Yahoo 4 times simultaneously
    FUTURES_CONFIG.forEach((cfg, idx) => {
      const { sym } = cfg

      // First poll after stagger delay
      const initDelay = setTimeout(() => {
        pollSymbol(sym, cfg)

        // Then poll every 30s
        timerRefs.current[sym] = setInterval(() => {
          pollSymbol(sym, cfg)
        }, POLL_INTERVAL)
      }, idx * API_STAGGER)

      // Store init timeout so we can clear it on unmount
      timerRefs.current[`${sym}_init`] = initDelay
    })

    return () => {
      Object.values(timerRefs.current).forEach(handle => {
        clearTimeout(handle)
        clearInterval(handle)
      })
      timerRefs.current = {}
    }
  }, [active])
}

// ─── YAHOO FINANCE FUTURES HOOK ───────────────────────────────────────────────
// Polls for NQ, ES, CL, GC via the /api/yahoo Vercel edge function.
//
//   Price quotes  (every 20s) — /api/yahoo?quotes=NQ,ES,CL,GC
//   Candle charts (every 60s) — /api/yahoo?chart=NQ&interval=1m&range=1d
//
// Data is ~15 min delayed. Upgrade to Databento ($125 free credits on signup)
// for real-time CME data when going live.

import { useEffect, useRef, useCallback } from 'react'
import { FUTURES_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

const QUOTE_MS   = 20_000   // 20s price quote refresh
const CHART_MS   = 60_000   // 60s candle refresh
const STAGGER_MS = 5_000    // 5s between individual chart fetches
const KEEP       = 50

const FUT_SYMS = FUTURES_CONFIG.map(c => c.sym)

function buildState(candles, price, prevClose) {
  const p       = price || candles.at(-1)?.close || 0
  const vwap    = calcVWAP(candles)
  const rsi     = calcRSI(candles)
  const ema8    = calcEMA(candles, 8)
  const volRatio= calcVolRatio(candles)
  const structure = detectMarketStructure(candles)
  return {
    price: p, vwap, rsi, ema8, volRatio, structure,
    vwapDev: vwap > 0 ? ((p - vwap) / vwap) * 100 : 0,
    pct:     prevClose > 0 ? ((p - prevClose) / prevClose) * 100 : 0,
    candles, market: 'FUT', source: 'yahoo',
  }
}

export function useYahooData(active, onUpdate) {
  const candlesRef   = useRef({})
  const prevCloseRef = useRef({})
  const priceRef     = useRef({})
  const activeRef    = useRef(active)
  activeRef.current  = active
  const qTimer = useRef(null)
  const cTimer = useRef(null)

  const fetchQuotes = useCallback(async () => {
    if (!activeRef.current) return
    try {
      const res  = await fetch(`/api/yahoo?quotes=${FUT_SYMS.join(',')}`)
      if (!res.ok) return
      const body = await res.json()
      const qs   = body?.quotes ?? {}
      FUTURES_CONFIG.forEach(({ sym }) => {
        const q = qs[sym]
        if (!q?.price) return
        priceRef.current[sym]     = q.price
        prevCloseRef.current[sym] = q.previousClose || prevCloseRef.current[sym] || q.price
        const candles = candlesRef.current[sym]
        if (!candles?.length) return
        onUpdate(sym, buildState(candles, q.price, prevCloseRef.current[sym]))
      })
    } catch {}
  }, [onUpdate])

  const fetchChart = useCallback(async (sym) => {
    if (!activeRef.current) return
    try {
      const res  = await fetch(`/api/yahoo?chart=${sym}&interval=1m&range=1d`)
      if (!res.ok) return
      const data = await res.json()
      if (!data?.candles?.length) return
      const candles = data.candles.slice(-KEEP)
      candlesRef.current[sym]   = candles
      prevCloseRef.current[sym] = data.previousClose || prevCloseRef.current[sym] || 0
      const price = priceRef.current[sym] || data.price || candles.at(-1)?.close || 0
      onUpdate(sym, buildState(candles, price, prevCloseRef.current[sym]))
    } catch {}
  }, [onUpdate])

  const fetchAllCharts = useCallback(() => {
    FUTURES_CONFIG.forEach(({ sym }, idx) => {
      setTimeout(() => fetchChart(sym), idx * STAGGER_MS)
    })
  }, [fetchChart])

  useEffect(() => {
    if (!active) {
      clearInterval(qTimer.current)
      clearInterval(cTimer.current)
      return
    }
    fetchQuotes()
    fetchAllCharts()
    qTimer.current = setInterval(fetchQuotes,    QUOTE_MS)
    cTimer.current = setInterval(fetchAllCharts, CHART_MS)
    return () => {
      clearInterval(qTimer.current)
      clearInterval(cTimer.current)
    }
  }, [active, fetchQuotes, fetchAllCharts])
}

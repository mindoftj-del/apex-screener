// ─── YAHOO FINANCE STOCK DATA HOOK ────────────────────────────────────────────
// Two-tier real data for AAPL, TSLA, NVDA, MSFT, AMD, SPY, QQQ, META:
//
//   Tier 1 — Price quotes  (every 15s)
//     /api/yahoo?quotes=AAPL,TSLA,...
//     Yahoo v7/quote → regularMarketPrice (current, 15-min delay max)
//     Updates the price, pct, change displayed in the screener table.
//
//   Tier 2 — Candle history  (every 90s)
//     /api/yahoo?chart=AAPL&interval=1m&range=1d
//     Yahoo v8/chart → OHLCV 1-min bars for RSI / VWAP / structure engine.
//     Fetched individually with 3s stagger to avoid Yahoo rate-limit.
//
// Replaces useSimulation entirely — no more random walk prices.

import { useEffect, useRef, useCallback } from 'react'
import { STOCKS_CONFIG } from '../engine/symbols.js'
import {
  calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure,
} from '../engine/technicals.js'

const SYMS         = STOCKS_CONFIG.map(s => s.sym)   // ['AAPL','TSLA',...]
const QUOTE_MS     = 15_000   // 15s — price updates
const CHART_MS     = 90_000   // 90s — candle rebuild
const STAGGER_MS   = 3_000    // 3s between individual chart fetches
const CANDLE_KEEP  = 60       // how many 1-min candles to keep

function buildState(market, candles, price, previousClose) {
  const vwap      = calcVWAP(candles)
  const rsi       = calcRSI(candles)
  const ema8      = calcEMA(candles, 8)
  const volRatio  = calcVolRatio(candles)
  const structure = detectMarketStructure(candles)
  const vwapDev   = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const pct       = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0
  return { price, vwap, rsi, ema8, volRatio, structure, vwapDev, pct, candles, market, source: 'yahoo' }
}

export function useYahooStocks(active, onUpdate) {
  const candlesRef      = useRef({})   // sym → candle[]
  const prevCloseRef    = useRef({})   // sym → number
  const latestPriceRef  = useRef({})   // sym → number (from quote tier)
  const quoteTimer      = useRef(null)
  const chartTimer      = useRef(null)
  const activeRef       = useRef(active)
  activeRef.current     = active

  // ── Tier 1: Fast price quotes ───────────────────────────────────────────────
  const fetchQuotes = useCallback(async () => {
    if (!activeRef.current) return
    try {
      const res = await fetch(`/api/yahoo?quotes=${SYMS.join(',')}`)
      if (!res.ok) return
      const body = await res.json()
      const quotes = body?.quotes ?? {}

      STOCKS_CONFIG.forEach(({ sym, market }) => {
        const q = quotes[sym]
        if (!q || !q.price) return

        latestPriceRef.current[sym]  = q.price
        prevCloseRef.current[sym]    = q.previousClose || prevCloseRef.current[sym] || q.price

        const candles = candlesRef.current[sym]
        if (!candles || candles.length === 0) {
          // No candles yet — emit a minimal state just with price so UI shows something real
          const fakeCandle = { open: q.price, high: q.price, low: q.price, close: q.price, volume: q.volume ?? 0, ts: Date.now() }
          candlesRef.current[sym] = [fakeCandle]
          onUpdate(sym, buildState(market, [fakeCandle], q.price, q.previousClose))
          return
        }

        // Update last candle's close to match live quote price (fills the 15-min gap)
        const updated = [...candles]
        updated[updated.length - 1] = { ...updated[updated.length - 1], close: q.price }
        candlesRef.current[sym] = updated

        onUpdate(sym, buildState(market, updated, q.price, prevCloseRef.current[sym]))
      })
    } catch (err) {
      console.warn('[useYahooStocks quotes]', err.message)
    }
  }, [onUpdate])

  // ── Tier 2: Candle chart history ────────────────────────────────────────────
  const fetchChart = useCallback(async (sym, market) => {
    if (!activeRef.current) return
    try {
      const res = await fetch(`/api/yahoo?chart=${sym}&interval=1m&range=1d`)
      if (!res.ok) return
      const data = await res.json()
      if (!data?.candles?.length) return

      // Merge with any candles we already have (deduplicate by timestamp)
      const existing   = candlesRef.current[sym] ?? []
      const existingTs = new Set(existing.map(c => c.ts))
      const fresh      = data.candles.filter(c => !existingTs.has(c.ts))
      const merged     = [...existing, ...fresh]
        .sort((a, b) => a.ts - b.ts)
        .slice(-CANDLE_KEEP)

      candlesRef.current[sym]   = merged
      prevCloseRef.current[sym] = data.previousClose || prevCloseRef.current[sym] || 0

      // Use live quote price if we have one, otherwise fall back to Yahoo chart price
      const price = latestPriceRef.current[sym] || data.price || merged.at(-1)?.close || 0
      if (!price) return

      onUpdate(sym, buildState(market, merged, price, prevCloseRef.current[sym]))
    } catch (err) {
      console.warn(`[useYahooStocks chart:${sym}]`, err.message)
    }
  }, [onUpdate])

  const fetchAllCharts = useCallback(() => {
    STOCKS_CONFIG.forEach(({ sym, market }, idx) => {
      // Stagger each symbol by 3s to avoid Yahoo rate limiting
      setTimeout(() => fetchChart(sym, market), idx * STAGGER_MS)
    })
  }, [fetchChart])

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      clearInterval(quoteTimer.current)
      clearInterval(chartTimer.current)
      return
    }

    // Kick off immediately
    fetchQuotes()
    fetchAllCharts()

    quoteTimer.current = setInterval(fetchQuotes,    QUOTE_MS)
    chartTimer.current = setInterval(fetchAllCharts, CHART_MS)

    return () => {
      clearInterval(quoteTimer.current)
      clearInterval(chartTimer.current)
    }
  }, [active, fetchQuotes, fetchAllCharts])
}

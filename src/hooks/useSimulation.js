// ─── SIMULATION FALLBACK ──────────────────────────────────────────────────────
// Runs for STOCKS only when no Massive.com key is set.
// Futures (NQ/ES/CL/GC) are now handled by useYahoo — real data, free.
// Crypto is handled by useBinance — always live.

import { useEffect, useRef } from 'react'
import { ALL_SYMBOLS, FUTURES_CONFIG, CRYPTO_CONFIG } from '../engine/symbols.js'
import { calcRSI, calcVWAP, calcEMA, calcVolRatio, detectMarketStructure } from '../engine/technicals.js'

// Symbols to skip in sim — these have real data sources
const SKIP_MARKETS = new Set(['FUT', 'CRYPTO'])

const SIM_SYMBOLS = ALL_SYMBOLS.filter(s => !SKIP_MARKETS.has(s.market))

const rand  = (a, b) => Math.random() * (b - a) + a
const randN = (mean, sd) => {
  let u = 0, v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function simCandle(prevClose, baseVol, trend = 0) {
  const vol        = Math.abs(randN(0, 0.007)) + 0.001
  const biasedMove = randN(trend * 0.002, vol)
  const open       = prevClose
  const close      = prevClose * (1 + biasedMove)
  const wickRange  = Math.abs(randN(0, vol * 0.4))
  const high       = Math.max(open, close) * (1 + wickRange)
  const low        = Math.min(open, close) * (1 - wickRange)
  return {
    open, high, low, close,
    volume: Math.floor(baseVol * rand(0.4, 2.8)),
  }
}

function buildHistory(base, count = 30) {
  const candles = []
  let price = base * rand(0.97, 1.03)
  const trend = randN(0, 0.4)
  for (let i = 0; i < count; i++) {
    const c = simCandle(price, 350000, trend)
    candles.push(c)
    price = c.close
  }
  return candles
}

function buildState(sym, market, candles) {
  const price     = candles[candles.length - 1].close
  const vwap      = calcVWAP(candles)
  const rsi       = calcRSI(candles)
  const ema8      = calcEMA(candles, 8)
  const volRatio  = calcVolRatio(candles)
  const structure = detectMarketStructure(candles)
  const vwapDev   = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const prevClose = candles[candles.length - 3]?.close || price
  const pct       = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return { price, vwap, rsi, ema8, volRatio, structure, vwapDev, pct, candles, market, source: 'sim' }
}

export function useSimulation(active, onUpdate) {
  const historiesRef = useRef({})
  const intervalRef  = useRef(null)

  useEffect(() => {
    // Init stock histories only
    SIM_SYMBOLS.forEach(({ sym, base, market }) => {
      const candles = buildHistory(base, 30)
      historiesRef.current[sym] = candles
      onUpdate(sym, buildState(sym, market, candles))
    })
  }, [])

  useEffect(() => {
    if (!active) {
      clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      SIM_SYMBOLS.forEach(({ sym, base, market }) => {
        const prev    = historiesRef.current[sym] || []
        const lastPx  = prev[prev.length - 1]?.close || base
        const newC    = simCandle(lastPx, 350000)
        const updated = [...prev.slice(-29), newC]
        historiesRef.current[sym] = updated
        onUpdate(sym, buildState(sym, market, updated))
      })
    }, 3000)

    return () => clearInterval(intervalRef.current)
  }, [active])
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNICAL ENGINE — All 5 Books
// Candlestick Trading Bible · MTF Analysis · Ultimate Day Trading Playbook
// Trading in the Zone · Best Loser Wins · The Disciplined Trader
// ═══════════════════════════════════════════════════════════════════════════════

// ─── UTILITIES ────────────────────────────────────────────────────────────────
export const fmt    = (n, d = 2) => n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : Number(n).toFixed(d)
export const fmtPct = (n) => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
export const fmtVol = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(Math.floor(n))

// ─── CANDLESTICK PATTERN DETECTION (Ravenshaw) ────────────────────────────────
export function detectCandlePatterns(candles) {
  if (!candles || candles.length < 3) return []
  const patterns = []
  const [c3, c2, c1] = candles.slice(-3)

  const body1       = Math.abs(c1.close - c1.open)
  const body2       = Math.abs(c2.close - c2.open)
  const range1      = c1.high - c1.low
  const upperWick1  = c1.high - Math.max(c1.open, c1.close)
  const lowerWick1  = Math.min(c1.open, c1.close) - c1.low
  const isBull1     = c1.close >= c1.open
  const isBull2     = c2.close >= c2.open

  // Bullish Engulfing — highest priority (A+)
  if (isBull1 && !isBull2 && c1.open <= c2.close && c1.close >= c2.open && body1 > body2)
    patterns.push({ name: 'Bull Engulf', dir: 'LONG', strength: 'A+', desc: 'Full bullish engulfing — institutional buying pressure' })

  // Bearish Engulfing — highest priority (A+)
  if (!isBull1 && isBull2 && c1.open >= c2.close && c1.close <= c2.open && body1 > body2)
    patterns.push({ name: 'Bear Engulf', dir: 'SHORT', strength: 'A+', desc: 'Full bearish engulfing — institutional selling pressure' })

  // Morning Star (3-candle bullish reversal)
  if (c3) {
    const body3 = Math.abs(c3.close - c3.open)
    const isBull3 = c3.close >= c3.open
    if (!isBull3 && body2 < body3 * 0.35 && isBull1 && c1.close > (c3.open + c3.close) / 2)
      patterns.push({ name: 'Morning Star', dir: 'LONG', strength: 'A+', desc: '3-candle reversal — complete sentiment shift from bearish to bullish' })

    // Evening Star (3-candle bearish reversal)
    if (isBull3 && body2 < body3 * 0.35 && !isBull1 && c1.close < (c3.open + c3.close) / 2)
      patterns.push({ name: 'Evening Star', dir: 'SHORT', strength: 'A+', desc: '3-candle reversal — complete sentiment shift from bullish to bearish' })

    // Three White Soldiers
    const isBull3b = c3.close >= c3.open
    if (isBull1 && isBull2 && isBull3b && c1.close > c2.close && c2.close > c3.close)
      patterns.push({ name: '3 White Soldiers', dir: 'LONG', strength: 'A', desc: 'Three consecutive bullish candles — strong continuation signal' })

    // Three Black Crows
    if (!isBull1 && !isBull2 && !isBull3b && c1.close < c2.close && c2.close < c3.close)
      patterns.push({ name: '3 Black Crows', dir: 'SHORT', strength: 'A', desc: 'Three consecutive bearish candles — strong continuation signal' })
  }

  // Hammer (bullish reversal)
  if (!isBull1 && lowerWick1 >= body1 * 2 && upperWick1 <= body1 * 0.5 && body1 > 0)
    patterns.push({ name: 'Hammer', dir: 'LONG', strength: 'A', desc: 'Long lower wick — buyers overwhelmed sellers at this level' })

  // Inverted Hammer
  if (isBull1 && upperWick1 >= body1 * 2 && lowerWick1 <= body1 * 0.5)
    patterns.push({ name: 'Inv. Hammer', dir: 'LONG', strength: 'B', desc: 'Potential bullish reversal — needs next candle confirmation' })

  // Shooting Star (bearish reversal)
  if (!isBull1 && upperWick1 >= body1 * 2 && lowerWick1 <= body1 * 0.3)
    patterns.push({ name: 'Shooting Star', dir: 'SHORT', strength: 'A', desc: 'Long upper wick — sellers overwhelmed buyers at this level' })

  // Hanging Man
  if (!isBull1 && lowerWick1 >= body1 * 2 && upperWick1 <= body1 * 0.3)
    patterns.push({ name: 'Hanging Man', dir: 'SHORT', strength: 'B', desc: 'Bearish warning at top — confirm with next candle close' })

  // Dragonfly Doji (bullish)
  if (body1 < range1 * 0.08 && lowerWick1 > range1 * 0.7 && range1 > 0)
    patterns.push({ name: 'Dragonfly', dir: 'LONG', strength: 'A', desc: 'Dragonfly Doji — strong bullish rejection at the low' })

  // Gravestone Doji (bearish)
  if (body1 < range1 * 0.08 && upperWick1 > range1 * 0.7 && range1 > 0)
    patterns.push({ name: 'Gravestone', dir: 'SHORT', strength: 'A', desc: 'Gravestone Doji — strong bearish rejection at the high' })

  // Standard Doji (neutral — watch for break)
  if (body1 < range1 * 0.1 && range1 > 0 && upperWick1 < range1 * 0.6 && lowerWick1 < range1 * 0.6)
    patterns.push({ name: 'Doji', dir: 'NEUTRAL', strength: 'B', desc: 'Indecision — wait for breakout candle close before entering' })

  // Bullish Marubozu (full momentum candle)
  if (isBull1 && body1 >= range1 * 0.88 && range1 > 0)
    patterns.push({ name: 'Bull Marubozu', dir: 'LONG', strength: 'A', desc: 'Pure momentum — buyers in full control with zero wick rejection' })

  // Bearish Marubozu
  if (!isBull1 && body1 >= range1 * 0.88 && range1 > 0)
    patterns.push({ name: 'Bear Marubozu', dir: 'SHORT', strength: 'A', desc: 'Pure momentum — sellers in full control with zero wick rejection' })

  // Tweezer Bottom
  if (!isBull2 && isBull1 && Math.abs(c1.low - c2.low) / (c1.low || 1) < 0.0012)
    patterns.push({ name: 'Tweezer Bot', dir: 'LONG', strength: 'A', desc: 'Equal lows — institutional support level defended twice' })

  // Tweezer Top
  if (isBull2 && !isBull1 && Math.abs(c1.high - c2.high) / (c1.high || 1) < 0.0012)
    patterns.push({ name: 'Tweezer Top', dir: 'SHORT', strength: 'A', desc: 'Equal highs — institutional resistance level rejected twice' })

  return patterns
}

// ─── MARKET STRUCTURE (Shannon MTF) ───────────────────────────────────────────
export function detectMarketStructure(candles) {
  if (!candles || candles.length < 6) return { trend: 'RANGING', bos: false, mtfScore: 1, prevSwingHigh: 0, prevSwingLow: 0 }

  const highs = candles.map(c => c.high)
  const lows  = candles.map(c => c.low)

  const recentHH = highs.slice(-4).every((h, i, a) => i === 0 || h >= a[i - 1] * 0.999)
  const recentHL = lows.slice(-4).every((l, i, a)  => i === 0 || l >= a[i - 1] * 0.999)
  const recentLH = highs.slice(-4).every((h, i, a) => i === 0 || h <= a[i - 1] * 1.001)
  const recentLL = lows.slice(-4).every((l, i, a)  => i === 0 || l <= a[i - 1] * 1.001)

  let trend = 'RANGING'
  if (recentHH && recentHL) trend = 'UPTREND'
  if (recentLH && recentLL) trend = 'DOWNTREND'

  const prevSwingHigh = Math.max(...highs.slice(-8, -2))
  const prevSwingLow  = Math.min(...lows.slice(-8, -2))
  const lastClose     = candles[candles.length - 1].close

  let bos = false
  if (lastClose > prevSwingHigh * 1.001) bos = 'BULLISH_BOS'
  if (lastClose < prevSwingLow  * 0.999) bos = 'BEARISH_BOS'

  // MTF confluence score based on trend consistency (0-3)
  let mtfScore = 0
  if (trend !== 'RANGING') mtfScore++
  const mid = candles.slice(-8, -4)
  const midHH = Math.max(...mid.map(c => c.high))
  const midLL = Math.min(...mid.map(c => c.low))
  if (trend === 'UPTREND'   && lastClose > midHH) mtfScore++
  if (trend === 'DOWNTREND' && lastClose < midLL) mtfScore++
  if (bos) mtfScore = Math.min(3, mtfScore + 1)

  return { trend, bos, mtfScore, prevSwingHigh, prevSwingLow }
}

// ─── INDICATORS ───────────────────────────────────────────────────────────────
export function calcRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    const prev  = candles[i - 1]?.close ?? candles[i].open
    const delta = candles[i].close - prev
    if (delta > 0) gains += delta
    else losses += Math.abs(delta)
  }
  const avgG = gains / period
  const avgL = losses / period || 0.0001
  return 100 - 100 / (1 + avgG / avgL)
}

export function calcVWAP(candles) {
  if (!candles || candles.length === 0) return 0
  let cumTPV = 0, cumVol = 0
  candles.forEach(c => {
    const tp = (c.high + c.low + c.close) / 3
    cumTPV += tp * (c.volume || 1)
    cumVol += (c.volume || 1)
  })
  return cumVol > 0 ? cumTPV / cumVol : candles[candles.length - 1].close
}

export function calcEMA(candles, period = 8) {
  if (!candles || candles.length < period) return candles?.[candles.length - 1]?.close ?? 0
  const k = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = period; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k)
  return ema
}

export function calcVolRatio(candles) {
  if (!candles || candles.length < 5) return 1
  const avgVol = candles.slice(-11, -1).reduce((s, c) => s + (c.volume || 0), 0) / 10
  return avgVol > 0 ? (candles[candles.length - 1].volume || 0) / avgVol : 1
}

// ─── THORNTON ENTRY TYPE ──────────────────────────────────────────────────────
export function classifyEntryType(structure, rsi, vwapDev, volRatio, patterns) {
  const hasBOS     = !!structure.bos
  const atLevel    = Math.abs(vwapDev) > 0.8
  const hasPattern = patterns.length > 0
  const volOk      = volRatio > 1.5

  if (hasBOS && volOk && structure.mtfScore >= 2)
    return { type: 1, label: 'T1 · BREAKOUT', color: '#ffd700' }
  if (hasPattern && atLevel && (rsi < 35 || rsi > 65))
    return { type: 2, label: 'T2 · REVERSAL', color: '#ff8c42' }
  if (structure.trend !== 'RANGING' && Math.abs(vwapDev) < 0.5 && structure.mtfScore >= 1)
    return { type: 3, label: 'T3 · PULLBACK', color: '#4af0c4' }
  return null
}

// ─── MASTER SIGNAL ENGINE ─────────────────────────────────────────────────────
export function detectSignals({ sym, market, candles, price, vwap, rsi, volRatio, ema8, structure, riskPct, accountSize }) {
  if (!candles || candles.length < 3 || !price) return { signals: [], patterns: [], entryType: null }

  const patterns   = detectCandlePatterns(candles)
  const vwapDev    = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const lastCandle = candles[candles.length - 1]
  const entryType  = classifyEntryType(structure, rsi, vwapDev, volRatio, patterns)
  const isFutures  = market === 'FUT'
  const signals    = []

  const addSig = (sig) => {
    // Risk calculations (Best Loser Wins — always know your dollar risk)
    if (accountSize && riskPct && sig.stop && price) {
      const riskDollar = accountSize * (riskPct / 100)
      const stopDist   = Math.abs(price - sig.stop)
      if (stopDist > 0) {
        sig.positionSize = (riskDollar / stopDist).toFixed(2)
        sig.riskDollar   = riskDollar.toFixed(0)
        sig.stopPctLabel = ((stopDist / price) * 100).toFixed(2) + '%'
      }
    }
    const reward = Math.abs(sig.target - price)
    const risk   = Math.abs(price - sig.stop)
    sig.rr = risk > 0 ? (reward / risk).toFixed(1) : '—'
    signals.push(sig)
  }

  // ── A+ SETUPS ────────────────────────────────────────────────────────────────

  // 1. Bullish Engulf @ VWAP + MTF aligned (Ravenshaw + Shannon + Thornton)
  if (patterns.find(p => p.name === 'Bull Engulf') && vwapDev > -1.8 && vwapDev < 0.6 && volRatio > 1.8 && structure.trend !== 'DOWNTREND' && structure.mtfScore >= 2) {
    addSig({ dir: 'LONG', grade: 'A+', reason: 'Bull Engulf @ VWAP · MTF Confirmed', pattern: 'Bull Engulf',
      entryLabel: 'T1/T2 · BREAKOUT+REVERSAL',
      stop: lastCandle.low * 0.9992, target: price * (isFutures ? 1.022 : 1.018),
      stopNote: 'Below engulf candle low', targetNote: '50% at 1.5R · runner to 3R',
      rule: 'Ravenshaw: Engulf at VWAP = institutional entry point. Shannon: MTF≥2 mandatory. Thornton: Volume must confirm.' })
  }

  // 2. Bearish Engulf @ VWAP + MTF aligned
  if (patterns.find(p => p.name === 'Bear Engulf') && vwapDev < 1.8 && vwapDev > -0.6 && volRatio > 1.8 && structure.trend !== 'UPTREND' && structure.mtfScore >= 2) {
    addSig({ dir: 'SHORT', grade: 'A+', reason: 'Bear Engulf @ VWAP · MTF Confirmed', pattern: 'Bear Engulf',
      entryLabel: 'T1/T2 · BREAKOUT+REVERSAL',
      stop: lastCandle.high * 1.0008, target: price * (isFutures ? 0.978 : 0.982),
      stopNote: 'Above engulf candle high', targetNote: '50% at 1.5R · runner to 3R',
      rule: 'Ravenshaw: Bearish engulf is #1 short signal. Shannon: Only take short when MTF≥2 bearish.' })
  }

  // 3. Bullish Break of Structure + volume (Shannon + Thornton Type 1)
  if (structure.bos === 'BULLISH_BOS' && volRatio > 2.0 && structure.mtfScore >= 2 && rsi > 52 && rsi < 78) {
    addSig({ dir: 'LONG', grade: 'A+', reason: 'Bullish BOS · Volume Breakout', pattern: 'Break of Structure',
      entryLabel: 'T1 · BREAKOUT',
      stop: structure.prevSwingHigh * 0.9985, target: price * (isFutures ? 1.025 : 1.02),
      stopNote: 'Below broken level — now support', targetNote: 'Enter on retest · 50% at 1.5R · trail rest',
      rule: 'Shannon: BOS = new participants entering the market. Thornton Type 1: Always wait for the retest of the broken level.' })
  }

  // 4. Bearish Break of Structure + volume
  if (structure.bos === 'BEARISH_BOS' && volRatio > 2.0 && structure.mtfScore >= 2 && rsi < 48 && rsi > 22) {
    addSig({ dir: 'SHORT', grade: 'A+', reason: 'Bearish BOS · Volume Breakdown', pattern: 'Break of Structure',
      entryLabel: 'T1 · BREAKOUT',
      stop: structure.prevSwingLow * 1.0015, target: price * (isFutures ? 0.975 : 0.98),
      stopNote: 'Above broken level — now resistance', targetNote: 'Enter on retest · 50% at 1.5R · trail rest',
      rule: 'Shannon: Price breaking structure with volume = distribution. Thornton: Wait for retest confirmation.' })
  }

  // 5. Morning Star at support (Ravenshaw + Thornton Type 2)
  if (patterns.find(p => p.name === 'Morning Star') && rsi < 42 && structure.mtfScore >= 1) {
    const patternLow = Math.min(...candles.slice(-3).map(c => c.low))
    addSig({ dir: 'LONG', grade: 'A+', reason: 'Morning Star · RSI Oversold', pattern: 'Morning Star',
      entryLabel: 'T2 · REVERSAL',
      stop: patternLow * 0.999, target: price * 1.02,
      stopNote: 'Below 3-candle pattern low', targetNote: 'Full target or VWAP retest',
      rule: 'Ravenshaw: 3-candle pattern = highest-conviction reversal. Must be at identifiable support. Thornton: Enter on 3rd candle close.' })
  }

  // 6. Evening Star at resistance
  if (patterns.find(p => p.name === 'Evening Star') && rsi > 58 && structure.mtfScore >= 1) {
    const patternHigh = Math.max(...candles.slice(-3).map(c => c.high))
    addSig({ dir: 'SHORT', grade: 'A+', reason: 'Evening Star · RSI Overbought', pattern: 'Evening Star',
      entryLabel: 'T2 · REVERSAL',
      stop: patternHigh * 1.001, target: price * 0.98,
      stopNote: 'Above 3-candle pattern high', targetNote: 'Full target or VWAP retest',
      rule: 'Ravenshaw: Evening Star = exhaustion top. Shannon: Only valid at MTF resistance.' })
  }

  // ── A SETUPS ─────────────────────────────────────────────────────────────────

  // 7. Hammer / Dragonfly at support
  const hammer = patterns.find(p => ['Hammer', 'Dragonfly'].includes(p.name))
  if (hammer && rsi < 40 && volRatio > 1.3 && vwapDev > -2.5) {
    addSig({ dir: 'LONG', grade: 'A', reason: `${hammer.name} · Oversold Support`, pattern: hammer.name,
      entryLabel: 'T2 · REVERSAL',
      stop: lastCandle.low * 0.9988, target: vwap > price ? vwap : price * 1.015,
      stopNote: 'Below wick low (the rejection point)', targetNote: 'VWAP retest or +1.5%',
      rule: 'Ravenshaw: The wick IS the signal — buyers entered and overwhelmed sellers. Stop below the wick low.' })
  }

  // 8. Shooting Star / Gravestone at resistance
  const shootStar = patterns.find(p => ['Shooting Star', 'Gravestone'].includes(p.name))
  if (shootStar && rsi > 60 && volRatio > 1.3 && vwapDev < 2.5) {
    addSig({ dir: 'SHORT', grade: 'A', reason: `${shootStar.name} · Overbought Resistance`, pattern: shootStar.name,
      entryLabel: 'T2 · REVERSAL',
      stop: lastCandle.high * 1.0012, target: vwap < price ? vwap : price * 0.985,
      stopNote: 'Above wick high (the rejection point)', targetNote: 'VWAP retest or -1.5%',
      rule: 'Ravenshaw: Upper wick rejection = sellers entering aggressively. Must be at identifiable resistance.' })
  }

  // 9. VWAP 2SD Extreme — Mean Reversion (Shannon bands)
  if (vwapDev < -2.2 && volRatio > 1.4 && rsi < 35 && structure.mtfScore >= 1) {
    addSig({ dir: 'LONG', grade: 'A', reason: 'VWAP 2SD Extreme · Long Mean Reversion', pattern: 'VWAP Band',
      entryLabel: 'T2 · REVERSAL',
      stop: price * 0.994, target: vwap,
      stopNote: '-0.6% emergency stop', targetNote: 'Full mean reversion to VWAP',
      rule: 'Shannon: At 2SD extremes the rubber band is maximally stretched. Statistically reverts. Best setup on ES/NQ.' })
  }
  if (vwapDev > 2.2 && volRatio > 1.4 && rsi > 65 && structure.mtfScore >= 1) {
    addSig({ dir: 'SHORT', grade: 'A', reason: 'VWAP 2SD Extreme · Short Mean Reversion', pattern: 'VWAP Band',
      entryLabel: 'T2 · REVERSAL',
      stop: price * 1.006, target: vwap,
      stopNote: '+0.6% emergency stop', targetNote: 'Full mean reversion to VWAP',
      rule: 'Shannon: Price rarely sustains at 2SD. Enter short, target VWAP. Cut quickly if it pushes further.' })
  }

  // 10. Tweezer Bottom
  if (patterns.find(p => p.name === 'Tweezer Bot') && rsi < 48 && structure.trend !== 'DOWNTREND') {
    addSig({ dir: 'LONG', grade: 'A', reason: 'Tweezer Bottom · Double Defense', pattern: 'Tweezer Bot',
      entryLabel: 'T2 · REVERSAL',
      stop: lastCandle.low * 0.999, target: price * 1.014,
      stopNote: 'Below the double bottom low', targetNote: 'Trail after 1R',
      rule: 'Ravenshaw: Tweezers show price was tested twice and rejected — institutions are defending this level.' })
  }

  // 11. Marubozu momentum (continuation)
  const bullMaru = patterns.find(p => p.name === 'Bull Marubozu')
  if (bullMaru && rsi > 50 && rsi < 72 && volRatio > 1.6 && structure.trend === 'UPTREND') {
    addSig({ dir: 'LONG', grade: 'A', reason: 'Bull Marubozu · Momentum Continuation', pattern: 'Bull Marubozu',
      entryLabel: 'T1 · BREAKOUT',
      stop: lastCandle.low * 0.9985, target: price * 1.016,
      stopNote: 'Below marubozu low', targetNote: 'Ride momentum — trail 8 EMA',
      rule: 'Ravenshaw: No wicks = zero rejection. Pure buying pressure. Only ride in established uptrend.' })
  }

  // ── B SETUPS ─────────────────────────────────────────────────────────────────

  // 12. Thornton Type 3 — 8 EMA pullback in trend
  const nearEMA = ema8 > 0 && Math.abs((price - ema8) / ema8) < 0.003
  if (structure.trend === 'UPTREND' && nearEMA && rsi > 42 && rsi < 62 && volRatio > 1.1) {
    addSig({ dir: 'LONG', grade: 'B', reason: '8 EMA Pullback · Uptrend Continuation', pattern: 'EMA Pullback',
      entryLabel: 'T3 · PULLBACK',
      stop: ema8 * 0.997, target: price * 1.012,
      stopNote: 'Below 8 EMA (3 ticks futures)', targetNote: 'Trail stop behind 8 EMA',
      rule: 'Thornton Type 3: Lowest-risk entry. Trend established. EMA = dynamic support. Limit order AT the EMA for best fill.' })
  }
  if (structure.trend === 'DOWNTREND' && nearEMA && rsi < 58 && rsi > 38 && volRatio > 1.1) {
    addSig({ dir: 'SHORT', grade: 'B', reason: '8 EMA Pullback · Downtrend Continuation', pattern: 'EMA Pullback',
      entryLabel: 'T3 · PULLBACK',
      stop: ema8 * 1.003, target: price * 0.988,
      stopNote: 'Above 8 EMA (3 ticks futures)', targetNote: 'Trail stop behind 8 EMA',
      rule: 'Thornton Type 3: Short at EMA retest in downtrend. You are NOT predicting — you are joining an established move.' })
  }

  // 13. Doji at VWAP — watch signal
  const doji = patterns.find(p => ['Doji', 'Gravestone', 'Dragonfly'].includes(p.name))
  if (doji && Math.abs(vwapDev) < 0.35 && volRatio > 1.2) {
    addSig({
      dir: doji.name === 'Gravestone' ? 'SHORT' : doji.name === 'Dragonfly' ? 'LONG' : 'NEUTRAL',
      grade: 'B', reason: `${doji.name} @ VWAP — Watch Breakout Direction`, pattern: doji.name,
      entryLabel: 'T2 · REVERSAL',
      stop: price * 0.995, target: price * 1.01,
      stopNote: 'Below/above doji range', targetNote: 'Wait for break candle CLOSE then enter',
      rule: 'Ravenshaw: Doji = indecision. Never anticipate direction. Enter ONLY after the break candle fully closes.' })
  }

  return { signals, patterns, entryType }
}

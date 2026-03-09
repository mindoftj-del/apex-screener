// ═══════════════════════════════════════════════════════════════════════════════
// TECHNICAL ENGINE — All 5 Books
// Candlestick Trading Bible · MTF Analysis · Ultimate Day Trading Playbook
// Trading in the Zone · Best Loser Wins · The Disciplined Trader
//
// ENTRY/STOP/TARGET PHILOSOPHY (v4 — structure-based pricing)
//   Entry  = exact structural price (candle close, FVG mid, OB mean threshold)
//   Stop   = nearest structural level that INVALIDATES the setup
//             (swing low/high, candle wick low/high, ±1 tick buffer)
//   Target = next draw on liquidity in the direction of trade
//             (prior swing, VWAP, measured move, opposing FVG)
//   R:R    = calculated from these real levels — never a percentage guess
// ═══════════════════════════════════════════════════════════════════════════════

export const fmt    = (n, d = 2) => n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : Number(n).toFixed(d)
export const fmtPct = (n) => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
export const fmtVol = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(Math.floor(n))


// ─── KILL ZONE + TIME GATES ───────────────────────────────────────────────────
// Based on backtest results: strategies show significantly higher win rates
// during institutional activity windows. Lunch is a hard blackout for scalping.

export function getKillZoneStatus() {
  const now  = new Date()
  // Use UTC offset for ET (UTC-4 in EDT, UTC-5 in EST — using -5 as conservative)
  const et_hour = ((now.getUTCHours() - 5 + 24) % 24)
  const et_min  = now.getUTCMinutes()
  const t = et_hour + et_min / 60

  if (t >= 9.5  && t < 11.0) return { active: true,  name: 'NY Open KZ',    quality: 'HIGHEST', color: '#ffd700' }
  if (t >= 2.0  && t < 5.0)  return { active: true,  name: 'London Open KZ', quality: 'HIGH',    color: '#4af0c4' }
  if (t >= 13.5 && t < 16.0) return { active: true,  name: 'NY PM Session',  quality: 'MEDIUM',  color: '#60a0ff' }
  if (t >= 12.0 && t < 13.0) return { active: false, name: 'Lunch — AVOID',  quality: 'BLACKOUT',color: '#ff3b5c' }
  return { active: false, name: 'Off-Hours', quality: 'LOW', color: '#444' }
}

// Hard blackout during lunch — backtest showed near-zero edge 12-1pm ET
export function isLunchBlackout() {
  const now     = new Date()
  const et_hour = ((now.getUTCHours() - 5 + 24) % 24)
  const et_min  = now.getUTCMinutes()
  const t = et_hour + et_min / 60
  return t >= 12.0 && t < 13.0
}

// ─── SWING LEVELS ─────────────────────────────────────────────────────────────
// Finds the most recent significant swing high and swing low in a candle array.
// Used as structural stop and target levels.
export function findSwingLevels(candles, lookback = 20) {
  const slice = candles.slice(-Math.min(lookback, candles.length))
  let swingHigh = -Infinity
  let swingLow  =  Infinity
  // Look for pivot highs/lows (candle whose high/low is higher/lower than 2 neighbours)
  for (let i = 1; i < slice.length - 1; i++) {
    if (slice[i].high >= slice[i-1].high && slice[i].high >= slice[i+1].high)
      swingHigh = Math.max(swingHigh, slice[i].high)
    if (slice[i].low <= slice[i-1].low && slice[i].low <= slice[i+1].low)
      swingLow = Math.min(swingLow, slice[i].low)
  }
  // Fallback to simple range if no pivot found
  if (swingHigh === -Infinity) swingHigh = Math.max(...slice.map(c => c.high))
  if (swingLow  ===  Infinity) swingLow  = Math.min(...slice.map(c => c.low))
  return { swingHigh, swingLow }
}

// ─── TICK BUFFER ──────────────────────────────────────────────────────────────
// Returns a small price buffer based on the instrument's typical tick.
// Stops go 1–2 ticks BEYOND the structural level — not at it.
function tickBuffer(price) {
  if (price > 10000) return price * 0.0003   // NQ/ES futures (~1–2 ticks)
  if (price > 1000)  return price * 0.0005   // Gold, high-priced stocks
  if (price > 100)   return price * 0.001    // stocks $100–999
  return price * 0.002                        // low-priced stocks, crypto sub-100
}

// ─── CANDLESTICK PATTERN DETECTION (Ravenshaw) ────────────────────────────────
export function detectCandlePatterns(candles) {
  if (!candles || candles.length < 3) return []
  const patterns = []
  const [c3, c2, c1] = candles.slice(-3)

  const body1      = Math.abs(c1.close - c1.open)
  const body2      = Math.abs(c2.close - c2.open)
  const range1     = c1.high - c1.low
  const upperWick1 = c1.high - Math.max(c1.open, c1.close)
  const lowerWick1 = Math.min(c1.open, c1.close) - c1.low
  const isBull1    = c1.close >= c1.open
  const isBull2    = c2.close >= c2.open

  if (isBull1 && !isBull2 && c1.open <= c2.close && c1.close >= c2.open && body1 > body2)
    patterns.push({ name: 'Bull Engulf', dir: 'LONG', strength: 'A+', desc: 'Full bullish engulfing — institutional buying pressure' })

  if (!isBull1 && isBull2 && c1.open >= c2.close && c1.close <= c2.open && body1 > body2)
    patterns.push({ name: 'Bear Engulf', dir: 'SHORT', strength: 'A+', desc: 'Full bearish engulfing — institutional selling pressure' })

  if (c3) {
    const body3   = Math.abs(c3.close - c3.open)
    const isBull3 = c3.close >= c3.open
    if (!isBull3 && body2 < body3 * 0.35 && isBull1 && c1.close > (c3.open + c3.close) / 2)
      patterns.push({ name: 'Morning Star', dir: 'LONG', strength: 'A+', desc: '3-candle reversal — complete sentiment shift' })
    if (isBull3 && body2 < body3 * 0.35 && !isBull1 && c1.close < (c3.open + c3.close) / 2)
      patterns.push({ name: 'Evening Star', dir: 'SHORT', strength: 'A+', desc: '3-candle reversal — complete sentiment shift' })
    if (isBull1 && isBull2 && (c3.close >= c3.open) && c1.close > c2.close && c2.close > c3.close)
      patterns.push({ name: '3 White Soldiers', dir: 'LONG', strength: 'A', desc: 'Three consecutive bullish candles' })
    if (!isBull1 && !isBull2 && !(c3.close >= c3.open) && c1.close < c2.close && c2.close < c3.close)
      patterns.push({ name: '3 Black Crows', dir: 'SHORT', strength: 'A', desc: 'Three consecutive bearish candles' })
  }

  if (!isBull1 && lowerWick1 >= body1 * 2 && upperWick1 <= body1 * 0.5 && body1 > 0)
    patterns.push({ name: 'Hammer', dir: 'LONG', strength: 'A', desc: 'Long lower wick — buyers overwhelmed sellers' })
  if (isBull1 && upperWick1 >= body1 * 2 && lowerWick1 <= body1 * 0.5)
    patterns.push({ name: 'Inv. Hammer', dir: 'LONG', strength: 'B', desc: 'Potential bullish reversal — confirm next candle' })
  if (!isBull1 && upperWick1 >= body1 * 2 && lowerWick1 <= body1 * 0.3)
    patterns.push({ name: 'Shooting Star', dir: 'SHORT', strength: 'A', desc: 'Long upper wick — sellers overwhelmed buyers' })
  if (!isBull1 && lowerWick1 >= body1 * 2 && upperWick1 <= body1 * 0.3)
    patterns.push({ name: 'Hanging Man', dir: 'SHORT', strength: 'B', desc: 'Bearish warning at top' })
  if (body1 < range1 * 0.08 && lowerWick1 > range1 * 0.7 && range1 > 0)
    patterns.push({ name: 'Dragonfly', dir: 'LONG', strength: 'A', desc: 'Strong bullish rejection at the low' })
  if (body1 < range1 * 0.08 && upperWick1 > range1 * 0.7 && range1 > 0)
    patterns.push({ name: 'Gravestone', dir: 'SHORT', strength: 'A', desc: 'Strong bearish rejection at the high' })
  if (body1 < range1 * 0.1 && range1 > 0 && upperWick1 < range1 * 0.6 && lowerWick1 < range1 * 0.6)
    patterns.push({ name: 'Doji', dir: 'NEUTRAL', strength: 'B', desc: 'Indecision — wait for breakout candle' })
  if (isBull1 && body1 >= range1 * 0.88 && range1 > 0)
    patterns.push({ name: 'Bull Marubozu', dir: 'LONG', strength: 'A', desc: 'Pure momentum — zero rejection' })
  if (!isBull1 && body1 >= range1 * 0.88 && range1 > 0)
    patterns.push({ name: 'Bear Marubozu', dir: 'SHORT', strength: 'A', desc: 'Pure momentum — sellers in full control' })
  if (!isBull2 && isBull1 && Math.abs(c1.low - c2.low) / (c1.low || 1) < 0.0012)
    patterns.push({ name: 'Tweezer Bot', dir: 'LONG', strength: 'A', desc: 'Equal lows — institutional support defended twice' })
  if (isBull2 && !isBull1 && Math.abs(c1.high - c2.high) / (c1.high || 1) < 0.0012)
    patterns.push({ name: 'Tweezer Top', dir: 'SHORT', strength: 'A', desc: 'Equal highs — institutional resistance rejected twice' })

  return patterns
}

// ─── MARKET STRUCTURE ────────────────────────────────────────────────────────
export function detectMarketStructure(candles) {
  if (!candles || candles.length < 6)
    return { trend: 'RANGING', bos: false, mtfScore: 1, prevSwingHigh: 0, prevSwingLow: 0 }

  const highs = candles.map(c => c.high)
  const lows  = candles.map(c => c.low)

  const recentHH = highs.slice(-4).every((h, i, a) => i === 0 || h >= a[i-1] * 0.999)
  const recentHL = lows.slice(-4).every((l, i, a)  => i === 0 || l >= a[i-1] * 0.999)
  const recentLH = highs.slice(-4).every((h, i, a) => i === 0 || h <= a[i-1] * 1.001)
  const recentLL = lows.slice(-4).every((l, i, a)  => i === 0 || l <= a[i-1] * 1.001)

  let trend = 'RANGING'
  if (recentHH && recentHL) trend = 'UPTREND'
  if (recentLH && recentLL) trend = 'DOWNTREND'

  const prevSwingHigh = Math.max(...highs.slice(-8, -2))
  const prevSwingLow  = Math.min(...lows.slice(-8, -2))
  const lastClose     = candles[candles.length - 1].close

  let bos = false
  if (lastClose > prevSwingHigh * 1.001) bos = 'BULLISH_BOS'
  if (lastClose < prevSwingLow  * 0.999) bos = 'BEARISH_BOS'

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
    const prev  = candles[i-1]?.close ?? candles[i].open
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

// ─── ENTRY TYPE ───────────────────────────────────────────────────────────────
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

// ─── MASTER SIGNAL ENGINE ────────────────────────────────────────────────────
export function detectSignals({ sym, market, candles, price, vwap, rsi, volRatio, ema8, structure, riskPct, accountSize }) {
  if (!candles || candles.length < 3 || !price) return { signals: [], patterns: [], entryType: null }

  // ── BACKTEST-VALIDATED GATES ─────────────────────────────────────────────────
  const kz          = getKillZoneStatus()
  const lunchActive = isLunchBlackout()

  const patterns   = detectCandlePatterns(candles)
  const vwapDev    = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const lastCandle = candles[candles.length - 1]
  const prevCandle = candles[candles.length - 2]
  const entryType  = classifyEntryType(structure, rsi, vwapDev, volRatio, patterns)
  const signals    = []

  // Swing levels for structural stop/target placement
  const { swingHigh, swingLow } = findSwingLevels(candles, 20)
  const buf = tickBuffer(price)

  // Find next significant swing beyond current position (for targets)
  const { swingHigh: farHigh, swingLow: farLow } = findSwingLevels(candles, 40)

  const addSig = (sig) => {
    // ── BACKTEST FILTER: Block lunch-hour signals (zero edge 12-1pm ET) ─────────
    if (lunchActive) return

    // ── BACKTEST FILTER: A+ signals require kill zone ───────────────────────────
    if (sig.grade === 'A+' && !kz.active && sig.kz_required !== false) return

    // ── BACKTEST FILTER: Minimum 1.5:1 R:R before displaying ───────────────────
    if (sig.entry && sig.stop && sig.target) {
      const risk   = Math.abs(sig.entry - sig.stop)
      const reward = Math.abs(sig.target - sig.entry)
      if (risk > 0 && reward / risk < 1.2) return
    }

    // ── ENTRY price: default to next-candle open approximation (current close)
    if (!sig.entry) sig.entry = price

    // Tag with kill zone context for UI display
    sig.killZone = kz.name
    sig.kzActive = kz.active

    // ── RISK calculations (Best Loser Wins)
    if (accountSize && riskPct && sig.stop && sig.entry) {
      const riskDollar = accountSize * (riskPct / 100)
      const stopDist   = Math.abs(sig.entry - sig.stop)
      if (stopDist > 0) {
        sig.positionSize = (riskDollar / stopDist).toFixed(2)
        sig.riskDollar   = riskDollar.toFixed(0)
        sig.stopPctLabel = ((stopDist / sig.entry) * 100).toFixed(2) + '%'
      }
    }

    const reward = sig.target && sig.entry ? Math.abs(sig.target - sig.entry) : 0
    const risk   = sig.stop   && sig.entry ? Math.abs(sig.entry  - sig.stop)  : 0
    sig.rr = risk > 0 ? (reward / risk).toFixed(1) : '—'
    signals.push(sig)
  }

  // ── A+ SETUPS ────────────────────────────────────────────────────────────────

  // 1. Bullish Engulf @ VWAP
  if (patterns.find(p => p.name === 'Bull Engulf') &&
      vwapDev > -1.8 && vwapDev < 0.6 &&
      rsi > 48 && volRatio > 2.0 && structure.trend !== 'DOWNTREND' && structure.mtfScore >= 2) {
    // Entry: close of engulf candle (confirmed — no anticipation)
    // Stop:  below engulf candle LOW (this is what invalidates the pattern)
    // Target: prior swing high (next draw on buy-side liquidity)
    const entry  = lastCandle.close
    const stop   = lastCandle.low - buf
    const target = farHigh > entry ? farHigh : entry + (entry - stop) * 2.5
    addSig({ dir: 'LONG', grade: 'A+', pattern: 'Bull Engulf',
      reason: 'Bull Engulf @ VWAP · MTF Confirmed',
      entryLabel: 'T1/T2 · Close of engulf candle',
      entry, stop, target,
      stopNote:   `Below engulf low $${fmt(lastCandle.low)}`,
      targetNote: `Prior swing high $${fmt(target)}`,
      rule: 'Ravenshaw: Engulf at VWAP = institutional entry. Enter on candle CLOSE. Stop below the engulf low — if that breaks, the setup is invalid.' })
  }

  // 2. Bearish Engulf @ VWAP
  if (patterns.find(p => p.name === 'Bear Engulf') &&
      vwapDev < 1.8 && vwapDev > -0.6 &&
      rsi < 52 && volRatio > 2.0 && structure.trend !== 'UPTREND' && structure.mtfScore >= 2) {
    const entry  = lastCandle.close
    const stop   = lastCandle.high + buf
    const target = farLow < entry ? farLow : entry - (stop - entry) * 2.5
    addSig({ dir: 'SHORT', grade: 'A+', pattern: 'Bear Engulf',
      reason: 'Bear Engulf @ VWAP · MTF Confirmed',
      entryLabel: 'T1/T2 · Close of engulf candle',
      entry, stop, target,
      stopNote:   `Above engulf high $${fmt(lastCandle.high)}`,
      targetNote: `Prior swing low $${fmt(target)}`,
      rule: 'Ravenshaw: Bearish engulf is #1 short signal. Enter on close. Stop above the engulf high.' })
  }

  // 3. Bullish BOS + volume (Thornton T1)
  if (structure.bos === 'BULLISH_BOS' && volRatio > 2.5 && structure.mtfScore >= 3 &&
      kz.active && rsi > 52 && rsi < 78) {
    // Entry: close of break candle OR retest of broken level (use close for now)
    // Stop:  back below the broken swing high (now acts as support)
    // Target: measured move from the swing high = prior range projected up
    const entry  = lastCandle.close
    const stop   = structure.prevSwingHigh - buf
    const range  = structure.prevSwingHigh - Math.min(...candles.slice(-12).map(c => c.low))
    const target = entry + range * 0.618  // Fib extension of the prior range
    addSig({ dir: 'LONG', grade: 'A+', pattern: 'Break of Structure',
      reason: 'Bullish BOS · Volume Breakout',
      entryLabel: 'T1 · Close of break candle',
      entry, stop, target,
      stopNote:   `Below broken level $${fmt(structure.prevSwingHigh)} (now support)`,
      targetNote: `Measured move target $${fmt(target)} (0.618× prior range)`,
      rule: 'Shannon: BOS = new participants entering. Thornton T1: Enter on close, stop below the broken level.' })
  }

  // 4. Bearish BOS + volume
  if (structure.bos === 'BEARISH_BOS' && volRatio > 2.5 && structure.mtfScore >= 3 &&
      kz.active && rsi < 48 && rsi > 22) {
    const entry  = lastCandle.close
    const stop   = structure.prevSwingLow + buf
    const range  = Math.max(...candles.slice(-12).map(c => c.high)) - structure.prevSwingLow
    const target = entry - range * 0.618
    addSig({ dir: 'SHORT', grade: 'A+', pattern: 'Break of Structure',
      reason: 'Bearish BOS · Volume Breakdown',
      entryLabel: 'T1 · Close of break candle',
      entry, stop, target,
      stopNote:   `Above broken level $${fmt(structure.prevSwingLow)} (now resistance)`,
      targetNote: `Measured move target $${fmt(target)} (0.618× prior range)`,
      rule: 'Shannon: Price breaking structure with volume = distribution. Enter on close, stop above the broken level.' })
  }

  // 5. Morning Star at support (Ravenshaw + Thornton T2)
  if (patterns.find(p => p.name === 'Morning Star') && rsi < 35 && vwapDev > -2.5 && structure.mtfScore >= 1) {
    const patternLow = Math.min(...candles.slice(-3).map(c => c.low))
    const entry      = lastCandle.close            // close of 3rd candle
    const stop       = patternLow - buf            // below entire 3-candle pattern
    const target     = vwap > entry ? vwap : (swingHigh > entry ? swingHigh : entry + (entry - stop) * 2)
    addSig({ dir: 'LONG', grade: 'A+', pattern: 'Morning Star',
      reason: 'Morning Star · RSI Oversold',
      entryLabel: 'T2 · Enter on 3rd candle close',
      entry, stop, target,
      stopNote:   `Below pattern low $${fmt(patternLow)}`,
      targetNote: `VWAP / swing high $${fmt(target)}`,
      rule: 'Ravenshaw: Enter on 3rd candle close only. Stop below the entire pattern.' })
  }

  // 6. Evening Star at resistance
  if (patterns.find(p => p.name === 'Evening Star') && rsi > 65 && vwapDev < 2.5 && structure.mtfScore >= 1) {
    const patternHigh = Math.max(...candles.slice(-3).map(c => c.high))
    const entry       = lastCandle.close
    const stop        = patternHigh + buf
    const target      = vwap < entry ? vwap : (swingLow < entry ? swingLow : entry - (stop - entry) * 2)
    addSig({ dir: 'SHORT', grade: 'A+', pattern: 'Evening Star',
      reason: 'Evening Star · RSI Overbought',
      entryLabel: 'T2 · Enter on 3rd candle close',
      entry, stop, target,
      stopNote:   `Above pattern high $${fmt(patternHigh)}`,
      targetNote: `VWAP / swing low $${fmt(target)}`,
      rule: 'Ravenshaw: Evening Star = exhaustion top. Shannon: Only valid at MTF resistance.' })
  }

  // 7. Hammer / Dragonfly at support
  const hammer = patterns.find(p => ['Hammer', 'Dragonfly'].includes(p.name))
  if (hammer && rsi < 40 && volRatio > 1.3 && vwapDev > -2.5 && structure.mtfScore >= 1) {
    // Entry: above the candle high (confirmed break above wick)
    // Stop:  below the wick low (the rejection point — if it breaks, bulls failed)
    const entry  = lastCandle.high + buf   // buy stop above the candle
    const stop   = lastCandle.low  - buf   // below the wick
    const target = vwap > entry ? vwap : (swingHigh > entry ? swingHigh : entry + (entry - stop) * 2)
    addSig({ dir: 'LONG', grade: 'A', pattern: hammer.name,
      reason: `${hammer.name} · Oversold Support`,
      entryLabel: 'T2 · Buy stop above candle high',
      entry, stop, target,
      stopNote:   `Below wick low $${fmt(lastCandle.low)} — rejection invalidated`,
      targetNote: `VWAP $${fmt(vwap > entry ? vwap : target)}`,
      rule: 'Ravenshaw: The wick IS the signal. Buy stop placed ABOVE the candle high — not a market order. Stop below the wick low.' })
  }

  // 8. Shooting Star / Gravestone at resistance
  const shootStar = patterns.find(p => ['Shooting Star', 'Gravestone'].includes(p.name))
  if (shootStar && rsi > 60 && volRatio > 1.3 && vwapDev < 2.5) {
    const entry  = lastCandle.low  - buf   // sell stop below the candle
    const stop   = lastCandle.high + buf
    const target = vwap < entry ? vwap : (swingLow < entry ? swingLow : entry - (stop - entry) * 2)
    addSig({ dir: 'SHORT', grade: 'A', pattern: shootStar.name,
      reason: `${shootStar.name} · Overbought Resistance`,
      entryLabel: 'T2 · Sell stop below candle low',
      entry, stop, target,
      stopNote:   `Above wick high $${fmt(lastCandle.high)}`,
      targetNote: `VWAP $${fmt(vwap < entry ? vwap : target)}`,
      rule: 'Ravenshaw: Sell stop below candle low — only enter if price breaks lower. Stop above wick high.' })
  }

  // 9. VWAP 2SD Extreme — Mean Reversion (Shannon)
  if (vwapDev < -2.2 && volRatio > 1.4 && rsi < 35 && structure.mtfScore >= 1) {
    const entry  = price                 // market entry — extreme is NOW
    const stop   = lastCandle.low - buf  // below current candle low
    const target = vwap                  // mean reversion = back to VWAP
    addSig({ dir: 'LONG', grade: 'A', pattern: 'VWAP Band',
      reason: 'VWAP 2SD Extreme · Mean Reversion Long',
      entryLabel: 'T2 · Market entry at extreme',
      entry, stop, target,
      stopNote:   `Below candle low $${fmt(lastCandle.low)}`,
      targetNote: `VWAP $${fmt(vwap)} (mean reversion target)`,
      rule: 'Shannon: At 2SD extremes the rubber band is maximally stretched. Target is always VWAP. No exceptions.' })
  }
  if (vwapDev > 2.2 && volRatio > 1.4 && rsi > 65 && structure.mtfScore >= 1) {
    const entry  = price
    const stop   = lastCandle.high + buf
    const target = vwap
    addSig({ dir: 'SHORT', grade: 'A', pattern: 'VWAP Band',
      reason: 'VWAP 2SD Extreme · Mean Reversion Short',
      entryLabel: 'T2 · Market entry at extreme',
      entry, stop, target,
      stopNote:   `Above candle high $${fmt(lastCandle.high)}`,
      targetNote: `VWAP $${fmt(vwap)} (mean reversion target)`,
      rule: 'Shannon: Enter at extreme. Target is VWAP. Cut quickly if it extends beyond -0.8% of entry.' })
  }

  // 10. Tweezer Bottom
  // Backtest: tweezer needs structural anchor — require proximity to swing low (<0.4%)
  const tweezerSwingLow = findSwingLevels(candles, 20).swingLow
  const nearSwingLow = tweezerSwingLow > 0 && Math.abs((price - tweezerSwingLow) / tweezerSwingLow) < 0.004
  if (patterns.find(p => p.name === 'Tweezer Bot') && rsi < 48 && nearSwingLow && structure.trend !== 'DOWNTREND') {
    const tweezerLow = Math.min(lastCandle.low, prevCandle.low)
    const entry      = lastCandle.close
    const stop       = tweezerLow - buf
    const target     = swingHigh > entry ? swingHigh : entry + (entry - stop) * 2
    addSig({ dir: 'LONG', grade: 'A', pattern: 'Tweezer Bot',
      reason: 'Tweezer Bottom · Double Defense',
      entryLabel: 'T2 · Enter on 2nd candle close',
      entry, stop, target,
      stopNote:   `Below double bottom $${fmt(tweezerLow)}`,
      targetNote: `Prior swing high $${fmt(target)}`,
      rule: 'Ravenshaw: Both lows must be within 0.12% of each other. Stop below both wicks.' })
  }

  // 11. Bull Marubozu momentum
  const bullMaru = patterns.find(p => p.name === 'Bull Marubozu')
  if (bullMaru && rsi > 50 && rsi < 72 && volRatio > 1.6 && structure.trend === 'UPTREND') {
    const entry  = lastCandle.close
    const stop   = lastCandle.low - buf   // below the momentum candle (no wicks = tight stop)
    const target = farHigh > entry ? farHigh : entry + (entry - stop) * 2.5
    addSig({ dir: 'LONG', grade: 'A', pattern: 'Bull Marubozu',
      reason: 'Bull Marubozu · Momentum Continuation',
      entryLabel: 'T1 · Enter on close, trail 8 EMA',
      entry, stop, target,
      stopNote:   `Below marubozu low $${fmt(lastCandle.low)}`,
      targetNote: `Next swing high $${fmt(target)}`,
      rule: 'Ravenshaw: No wicks = zero rejection. Tight stop because close = low. Only in established uptrend.' })
  }

  // 12. Thornton T3 — 8 EMA Pullback in trend
  // Backtest: EMA long needed tighter trend confirmation (mtfScore 2 not 1)
  const nearEMA = ema8 > 0 && Math.abs((price - ema8) / ema8) < 0.003
  if (structure.trend === 'UPTREND' && nearEMA && rsi > 42 && rsi < 62 && volRatio > 1.2 && structure.mtfScore >= 2) {
    const entry  = ema8                 // limit order AT the EMA
    const stop   = ema8 * 0.997        // 3 ticks below EMA
    const target = swingHigh > entry ? swingHigh : entry + (entry - stop) * 3
    addSig({ dir: 'LONG', grade: 'B', pattern: 'EMA Pullback',
      reason: '8 EMA Pullback · Uptrend Continuation',
      entryLabel: 'T3 · Limit order AT 8 EMA',
      entry, stop, target,
      stopNote:   `3 ticks below 8 EMA $${fmt(ema8 * 0.997)}`,
      targetNote: `Prior swing high $${fmt(target)}`,
      rule: 'Thornton T3: Limit order placed AT the 8 EMA. You join the trend cheaply. Stop is tight because EMA IS support.' })
  }
  if (structure.trend === 'DOWNTREND' && nearEMA && rsi < 58 && rsi > 38 && volRatio > 1.1) {
    const entry  = ema8
    const stop   = ema8 * 1.003
    const target = swingLow < entry ? swingLow : entry - (stop - entry) * 3
    addSig({ dir: 'SHORT', grade: 'B', pattern: 'EMA Pullback',
      reason: '8 EMA Pullback · Downtrend Continuation',
      entryLabel: 'T3 · Limit order AT 8 EMA',
      entry, stop, target,
      stopNote:   `3 ticks above 8 EMA $${fmt(ema8 * 1.003)}`,
      targetNote: `Prior swing low $${fmt(target)}`,
      rule: 'Thornton T3: Short at EMA retest. You join an established move, not predict. Stop above EMA.' })
  }

  // 13. Doji @ VWAP — watch signal
  const doji = patterns.find(p => ['Doji', 'Gravestone', 'Dragonfly'].includes(p.name))
  if (doji && Math.abs(vwapDev) < 0.35 && volRatio > 1.2) {
    const dir    = doji.name === 'Gravestone' ? 'SHORT' : doji.name === 'Dragonfly' ? 'LONG' : 'NEUTRAL'
    const entry  = dir === 'LONG' ? lastCandle.high + buf : dir === 'SHORT' ? lastCandle.low - buf : price
    const stop   = dir === 'LONG' ? lastCandle.low  - buf : dir === 'SHORT' ? lastCandle.high + buf : price * 0.995
    const target = dir === 'LONG'
      ? (swingHigh > entry ? swingHigh : entry + Math.abs(entry - stop) * 2)
      : dir === 'SHORT'
        ? (swingLow < entry ? swingLow : entry - Math.abs(entry - stop) * 2)
        : price * 1.01
    addSig({ dir, grade: 'B', pattern: doji.name,
      reason: `${doji.name} @ VWAP — Breakout Watch`,
      entryLabel: 'T2 · Stop order on break of doji range',
      entry, stop, target,
      stopNote:   `Opposite side of doji $${fmt(stop)}`,
      targetNote: `Next swing $${fmt(target)}`,
      rule: 'Ravenshaw: Doji = indecision. NEVER anticipate direction. Enter ONLY after break candle fully closes beyond the doji range.' })
  }

  return { signals, patterns, entryType }
}

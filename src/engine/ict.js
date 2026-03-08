// ═══════════════════════════════════════════════════════════════════════════════
// ICT ENGINE — Smart Money Concepts for ES & NQ Scalping
// Fair Value Gaps · Order Blocks · Liquidity Sweeps · Volume Profile / POC
// ═══════════════════════════════════════════════════════════════════════════════

// ─── FAIR VALUE GAP DETECTION ─────────────────────────────────────────────────
// FVG = 3-candle imbalance where candle[0].high does NOT overlap candle[2].low (bull)
// or candle[0].low does NOT overlap candle[2].high (bear)
// Entry: wait for price to RETRACE into the FVG, enter at midpoint (consequent encroachment)
// Stop: beyond far edge of FVG
// Target: next liquidity level / swing high or low
export function detectFVGs(candles) {
  if (!candles || candles.length < 3) return []
  const fvgs = []

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2]
    const c1 = candles[i - 1] // the impulse candle
    const c2 = candles[i]

    // Bullish FVG: gap between high of c0 and low of c2 (price moved up so fast it left space)
    if (c0.high < c2.low) {
      const gapLow  = c0.high
      const gapHigh = c2.low
      const mid     = (gapLow + gapHigh) / 2
      const size    = ((gapHigh - gapLow) / c1.close) * 100
      if (size > 0.03) { // min 0.03% gap — filters noise
        fvgs.push({ dir: 'BULL', gapLow, gapHigh, mid, size, candleIdx: i - 1, filled: false,
          inverted: false, label: 'Bullish FVG',
          rule: 'ICT: Bullish FVG = institutional buying imbalance. Price left this zone too fast — it will return to rebalance. Entry at midpoint (CE), stop below gapLow.' })
      }
    }

    // Bearish FVG: gap between low of c0 and high of c2 (price moved down so fast it left space)
    if (c0.low > c2.high) {
      const gapLow  = c2.high
      const gapHigh = c0.low
      const mid     = (gapLow + gapHigh) / 2
      const size    = ((gapHigh - gapLow) / c1.close) * 100
      if (size > 0.03) {
        fvgs.push({ dir: 'BEAR', gapLow, gapHigh, mid, size, candleIdx: i - 1, filled: false,
          inverted: false, label: 'Bearish FVG',
          rule: 'ICT: Bearish FVG = institutional selling imbalance. Short at CE (midpoint) on retest. Stop above gapHigh.' })
      }
    }
  }

  const recent = fvgs.slice(-6) // keep last 6 FVGs
  const price  = candles[candles.length - 1].close

  // Check if price is currently IN an FVG (active retest — fire signal)
  recent.forEach(fvg => {
    if (price >= fvg.gapLow && price <= fvg.gapHigh) fvg.active = true

    // Check for IFVG (inversion) — price closed THROUGH the FVG (flips polarity)
    const lastClose = candles[candles.length - 1].close
    if (fvg.dir === 'BULL' && lastClose < fvg.gapLow) {
      fvg.inverted = true
      fvg.label    = 'Inv. Bearish FVG (IFVG)'
      fvg.rule     = 'ICT: Bullish FVG breached bearishly = IFVG. Now acts as resistance on retest. Short at top of old gap. Stop above gapHigh.'
    }
    if (fvg.dir === 'BEAR' && lastClose > fvg.gapHigh) {
      fvg.inverted = true
      fvg.label    = 'Inv. Bullish FVG (IFVG)'
      fvg.rule     = 'ICT: Bearish FVG breached bullishly = IFVG. Now acts as support on retest. Long at bottom of old gap. Stop below gapLow.'
    }
  })

  return recent
}

// ─── ORDER BLOCK DETECTION ────────────────────────────────────────────────────
// Bullish OB: last DOWN-close candle BEFORE a strong bullish impulse
// Bearish OB: last UP-close candle BEFORE a strong bearish impulse
// Valid OB: must have caused a displacement move (next candle covers ≥1.5× OB range)
// Entry: limit order back INTO the OB zone (top 50% = mean threshold)
export function detectOrderBlocks(candles) {
  if (!candles || candles.length < 5) return []
  const obs  = []
  const price = candles[candles.length - 1].close

  for (let i = 1; i < candles.length - 2; i++) {
    const c    = candles[i]
    const next = candles[i + 1]
    const body = Math.abs(c.close - c.open)
    const nextBody = Math.abs(next.close - next.open)

    // Bullish OB: bearish candle followed by a strong bullish displacement
    if (c.close < c.open && next.close > next.open && nextBody >= body * 1.5) {
      const obHigh = c.high
      const obLow  = c.low
      const mid    = (obHigh + obLow) / 2 // mean threshold — institutions reprice here
      // Only keep if price hasn't run through it bearishly yet
      if (price > obLow) {
        obs.push({ dir: 'BULL', obHigh, obLow, mid, candleIdx: i,
          active: price >= obLow && price <= obHigh,
          label: 'Bullish Order Block',
          rule: 'ICT: Bullish OB = last bearish candle before institutional buying. Enter limit at OB midpoint (mean threshold). Stop below OB low.' })
      }
    }

    // Bearish OB: bullish candle followed by a strong bearish displacement
    if (c.close > c.open && next.close < next.open && nextBody >= body * 1.5) {
      const obHigh = c.high
      const obLow  = c.low
      const mid    = (obHigh + obLow) / 2
      if (price < obHigh) {
        obs.push({ dir: 'BEAR', obHigh, obLow, mid, candleIdx: i,
          active: price >= obLow && price <= obHigh,
          label: 'Bearish Order Block',
          rule: 'ICT: Bearish OB = last bullish candle before institutional selling. Enter limit at OB midpoint. Stop above OB high.' })
      }
    }
  }

  return obs.slice(-4) // last 4 OBs
}

// ─── LIQUIDITY SWEEP DETECTION ────────────────────────────────────────────────
// Sweep = price spikes through a prior swing high/low then CLOSES BACK inside
// This triggers stops, fills institutional orders, then reverses
// Classic ICT setup: sweep low → close back above → LONG
//                   sweep high → close back below → SHORT
export function detectLiquiditySweep(candles) {
  if (!candles || candles.length < 8) return null

  const recent  = candles.slice(-8)
  const last    = recent[recent.length - 1]
  const prev    = recent.slice(0, -1)

  const swingHigh = Math.max(...prev.map(c => c.high))
  const swingLow  = Math.min(...prev.map(c => c.low))

  // Bullish sweep: last candle wick went BELOW swing low but CLOSED back above it
  // = smart money ran sell stops, absorbed selling, now reversing up
  if (last.low < swingLow && last.close > swingLow) {
    const sweepDepth = ((swingLow - last.low) / swingLow) * 100
    if (sweepDepth > 0.04) { // meaningful sweep, not just noise
      return {
        dir: 'BULL', type: 'Sell-Side Liquidity Sweep',
        sweptLevel: swingLow, sweepLow: last.low, sweepDepth,
        rule: 'ICT: Price swept sell-side liquidity (stop hunt below lows), closed back above. Smart money absorbed sells. Enter LONG above sweep candle high. Stop below sweep wick.',
        grade: 'A+',
      }
    }
  }

  // Bearish sweep: last candle wick went ABOVE swing high but CLOSED back below it
  if (last.high > swingHigh && last.close < swingHigh) {
    const sweepDepth = ((last.high - swingHigh) / swingHigh) * 100
    if (sweepDepth > 0.04) {
      return {
        dir: 'BEAR', type: 'Buy-Side Liquidity Sweep',
        sweptLevel: swingHigh, sweepHigh: last.high, sweepDepth,
        rule: 'ICT: Price swept buy-side liquidity (stop hunt above highs), closed back below. Smart money absorbed buys. Enter SHORT below sweep candle low. Stop above sweep wick.',
        grade: 'A+',
      }
    }
  }

  return null
}

// ─── BREAKER BLOCK DETECTION ──────────────────────────────────────────────────
// Breaker = a FAILED order block after a liquidity sweep + structure shift
// Bullish Breaker: failed bearish OB — price swept below, came back up through it
// Bearish Breaker: failed bullish OB — price swept above, came back down through it
export function detectBreakerBlock(candles, orderBlocks) {
  if (!candles || !orderBlocks || orderBlocks.length === 0) return null
  const price = candles[candles.length - 1].close

  for (const ob of orderBlocks) {
    // Bullish OB that was violated bearishly = now a Bearish Breaker (resistance)
    if (ob.dir === 'BULL' && price < ob.obLow) {
      return { dir: 'BEAR', type: 'Bearish Breaker Block', level: ob.obLow, high: ob.obHigh,
        rule: 'ICT: Bullish OB invalidated = Bearish Breaker. Price will revisit from below as resistance. Enter SHORT on retest of ob.obLow. Stop above ob.obHigh.' }
    }
    // Bearish OB that was violated bullishly = now a Bullish Breaker (support)
    if (ob.dir === 'BEAR' && price > ob.obHigh) {
      return { dir: 'BULL', type: 'Bullish Breaker Block', level: ob.obHigh, low: ob.obLow,
        rule: 'ICT: Bearish OB invalidated = Bullish Breaker. Price will revisit from above as support. Enter LONG on retest of ob.obHigh. Stop below ob.obLow.' }
    }
  }
  return null
}

// ─── VOLUME PROFILE APPROXIMATION ────────────────────────────────────────────
// Without tick data, we approximate VP using candle OHLC + volume weights
// Splits each candle's price range into buckets, distributes volume across them
// Then finds POC (most volume bucket), VAH/VAL (70% of volume boundary)
export function calcVolumeProfile(candles, buckets = 20) {
  if (!candles || candles.length < 5) return null

  const maxPrice = Math.max(...candles.map(c => c.high))
  const minPrice = Math.min(...candles.map(c => c.low))
  const range    = maxPrice - minPrice
  if (range === 0) return null

  const bucketSize = range / buckets
  const volMap     = new Array(buckets).fill(0)

  candles.forEach(c => {
    const vol = c.volume || 1
    // Distribute volume across the price range this candle covered
    const lowBucket  = Math.floor((c.low  - minPrice) / bucketSize)
    const highBucket = Math.floor((c.high - minPrice) / bucketSize)
    const span       = Math.max(1, highBucket - lowBucket)
    const volPerBucket = vol / span
    for (let b = Math.max(0, lowBucket); b <= Math.min(buckets - 1, highBucket); b++) {
      volMap[b] += volPerBucket
    }
  })

  // POC = bucket with most volume
  const pocBucket = volMap.indexOf(Math.max(...volMap))
  const poc       = minPrice + (pocBucket + 0.5) * bucketSize

  // Value Area = 70% of total volume around POC
  const totalVol   = volMap.reduce((a, b) => a + b, 0)
  const target70   = totalVol * 0.70
  let   vaVol      = volMap[pocBucket]
  let   vaLow      = pocBucket
  let   vaHigh     = pocBucket

  // Expand outward from POC until we capture 70% of volume
  while (vaVol < target70 && (vaLow > 0 || vaHigh < buckets - 1)) {
    const volAbove = vaHigh < buckets - 1 ? volMap[vaHigh + 1] : 0
    const volBelow = vaLow > 0 ? volMap[vaLow - 1] : 0
    if (volAbove >= volBelow && vaHigh < buckets - 1) { vaHigh++; vaVol += volAbove }
    else if (vaLow > 0)                                { vaLow--;  vaVol += volBelow }
    else                                               { vaHigh++; vaVol += volAbove }
  }

  const vah = minPrice + (vaHigh + 1) * bucketSize
  const val = minPrice + vaLow * bucketSize

  const price = candles[candles.length - 1].close
  const pocDev = ((price - poc) / poc) * 100

  // High Volume Nodes (HVN) and Low Volume Nodes (LVN)
  const avgVol = totalVol / buckets
  const hvns   = []
  const lvns   = []
  volMap.forEach((v, i) => {
    const level = minPrice + (i + 0.5) * bucketSize
    if (v > avgVol * 1.5) hvns.push(level)
    if (v < avgVol * 0.4) lvns.push(level)
  })

  return {
    poc, vah, val, pocDev, hvns, lvns,
    atPOC:  Math.abs(pocDev) < 0.15,
    atVAH:  Math.abs((price - vah) / vah * 100) < 0.2,
    atVAL:  Math.abs((price - val) / val * 100) < 0.2,
    aboveVA: price > vah,
    belowVA: price < val,
    insideVA: price >= val && price <= vah,
  }
}

// ─── MARKET PROFILE / TPO APPROXIMATION ──────────────────────────────────────
// TPO = Time Price Opportunity — each 30-min period price "ticked" at a level gets a letter
// We approximate using session structure: initial balance, range extension, poor highs/lows
// Key levels for NQ/ES scalping:
//   • Initial Balance High/Low (first 1hr of NY session)
//   • Single prints = low-volume areas = price moves fast through here
//   • Poor highs/lows = likely to be revisited (no strong rejection wick)
export function calcMarketProfile(candles) {
  if (!candles || candles.length < 10) return null

  // Approximate "session" as last 20 candles
  const session   = candles.slice(-20)
  const ib        = session.slice(0, 4) // Initial Balance = first ~4 candles (1hr on 15min)
  const ibHigh    = Math.max(...ib.map(c => c.high))
  const ibLow     = Math.min(...ib.map(c => c.low))
  const ibRange   = ibHigh - ibLow
  const sessionH  = Math.max(...session.map(c => c.high))
  const sessionL  = Math.min(...session.map(c => c.low))

  // Range extension: did price break out of initial balance?
  const extendedUp   = sessionH > ibHigh
  const extendedDown = sessionL < ibLow
  const extendCount  = (extendedUp ? 1 : 0) + (extendedDown ? 1 : 0)

  // Poor high: session high candle has a small upper wick (not strongly rejected)
  const highCandle = session.find(c => c.high === sessionH)
  const poorHigh   = highCandle ? (highCandle.high - Math.max(highCandle.open, highCandle.close)) < ibRange * 0.1 : false

  // Poor low: session low candle has a small lower wick
  const lowCandle = session.find(c => c.low === sessionL)
  const poorLow   = lowCandle ? (Math.min(lowCandle.open, lowCandle.close) - lowCandle.low) < ibRange * 0.1 : false

  const price = candles[candles.length - 1].close

  return {
    ibHigh, ibLow, ibRange,
    sessionHigh: sessionH, sessionLow: sessionL,
    extendedUp, extendedDown, extendCount,
    poorHigh, poorLow,
    atIBHigh: Math.abs((price - ibHigh) / ibHigh * 100) < 0.15,
    atIBLow:  Math.abs((price - ibLow)  / ibLow  * 100) < 0.15,
  }
}

// ─── ICT KILL ZONE FILTER ─────────────────────────────────────────────────────
// ICT Kill Zones = highest probability time windows for NQ/ES scalping
// London Open: 2:00–5:00 AM ET  |  NY Open (AM KZ): 9:30–11:00 AM ET
// NY Lunch: 12:00–1:00 PM ET (avoid)  |  NY PM (PM KZ): 1:30–4:00 PM ET
export function getKillZone() {
  const now  = new Date()
  const hour = now.getUTCHours() - 5 // ET = UTC-5 (rough, ignores DST)
  const min  = now.getUTCMinutes()
  const t    = hour + min / 60

  if (t >= 2   && t < 5)   return { name: 'London Open KZ',  color: '#4af0c4', active: true, quality: 'HIGH' }
  if (t >= 9.5 && t < 11)  return { name: 'NY Open KZ',      color: '#ffd700', active: true, quality: 'HIGHEST' }
  if (t >= 12  && t < 13)  return { name: 'NY Lunch',        color: '#ff3b5c', active: false, quality: 'AVOID' }
  if (t >= 13.5 && t < 16) return { name: 'NY PM Session',   color: '#60a0ff', active: true, quality: 'MEDIUM' }
  return { name: 'Off-Hours', color: '#333', active: false, quality: 'LOW' }
}

// ─── SMT DIVERGENCE (NQ vs ES) ───────────────────────────────────────────────
// SMT = Smart Money Tool — when NQ and ES diverge at the same level
// If NQ makes a new low but ES does NOT (or vice versa), one is being manipulated
// This is the highest-probability ICT confirmation for a reversal
export function detectSMT(nqCandles, esCandles) {
  if (!nqCandles || !esCandles || nqCandles.length < 3 || esCandles.length < 3) return null

  const nqLow  = Math.min(...nqCandles.slice(-3).map(c => c.low))
  const esLow  = Math.min(...esCandles.slice(-3).map(c => c.low))
  const nqHigh = Math.max(...nqCandles.slice(-3).map(c => c.high))
  const esHigh = Math.max(...esCandles.slice(-3).map(c => c.high))

  const nqPrevLow  = Math.min(...nqCandles.slice(-6, -3).map(c => c.low))
  const esPrevLow  = Math.min(...esCandles.slice(-6, -3).map(c => c.low))
  const nqPrevHigh = Math.max(...nqCandles.slice(-6, -3).map(c => c.high))
  const esPrevHigh = Math.max(...esCandles.slice(-6, -3).map(c => c.high))

  // Bullish SMT: NQ makes new low but ES holds above its prior low (or vice versa)
  if (nqLow < nqPrevLow * 0.9995 && esLow > esPrevLow * 0.9998) {
    return { dir: 'BULL', type: 'Bullish SMT Divergence',
      rule: 'ICT SMT: NQ made new low but ES did NOT — ES is being protected by institutions. Strong buy signal on both. NY Open KZ only.',
      grade: 'A+' }
  }
  if (esLow < esPrevLow * 0.9995 && nqLow > nqPrevLow * 0.9998) {
    return { dir: 'BULL', type: 'Bullish SMT Divergence',
      rule: 'ICT SMT: ES made new low but NQ did NOT — NQ protected. Strong buy signal.',
      grade: 'A+' }
  }

  // Bearish SMT: NQ makes new high but ES doesn't (or vice versa)
  if (nqHigh > nqPrevHigh * 1.0005 && esHigh < esPrevHigh * 1.0002) {
    return { dir: 'BEAR', type: 'Bearish SMT Divergence',
      rule: 'ICT SMT: NQ made new high but ES did NOT — divergence signals distribution. Strong sell signal on both.',
      grade: 'A+' }
  }
  if (esHigh > esPrevHigh * 1.0005 && nqHigh < nqPrevHigh * 1.0002) {
    return { dir: 'BEAR', type: 'Bearish SMT Divergence',
      rule: 'ICT SMT: ES made new high but NQ did NOT — divergence signals distribution.',
      grade: 'A+' }
  }

  return null
}

// ─── MASTER ICT SIGNAL GENERATOR ─────────────────────────────────────────────
// Combines all ICT concepts into graded signals specifically tuned for NQ/ES scalping
export function detectICTSignals({ sym, market, candles, price, vwap, rsi, volRatio, structure, riskPct, accountSize, peerCandles }) {
  if (!candles || candles.length < 8 || !price) return { ictSignals: [], fvgs: [], orderBlocks: [], sweep: null, vpLevels: null, mpLevels: null, killZone: null }

  const fvgs        = detectFVGs(candles)
  const orderBlocks = detectOrderBlocks(candles)
  const sweep       = detectLiquiditySweep(candles)
  const breaker     = detectBreakerBlock(candles, orderBlocks)
  const vpLevels    = calcVolumeProfile(candles)
  const mpLevels    = calcMarketProfile(candles)
  const killZone    = getKillZone()
  const smt         = peerCandles ? detectSMT(
    sym === 'NQ' ? candles : peerCandles,
    sym === 'ES' ? candles : peerCandles
  ) : null

  const isFutures  = market === 'FUT'
  const isNQorES   = sym === 'NQ' || sym === 'ES'
  const kzBonus    = killZone.active && killZone.quality !== 'AVOID' ? 1 : 0
  const ictSignals = []

  const addSig = (sig) => {
    if (accountSize && riskPct && sig.stop) {
      const riskDollar = accountSize * (riskPct / 100)
      const stopDist   = Math.abs(price - sig.stop)
      if (stopDist > 0) {
        sig.positionSize = (riskDollar / stopDist).toFixed(2)
        sig.riskDollar   = riskDollar.toFixed(0)
        sig.stopPctLabel = ((stopDist / price) * 100).toFixed(2) + '%'
      }
    }
    const reward = Math.abs((sig.target || price) - price)
    const risk   = Math.abs(price - (sig.stop || price))
    sig.rr = risk > 0 ? (reward / risk).toFixed(1) : '—'
    ictSignals.push(sig)
  }

  // ── A+ ICT SETUPS ────────────────────────────────────────────────────────────

  // 1. LIQUIDITY SWEEP + FVG CONFLUENCE (the core ICT setup for NQ/ES)
  if (sweep) {
    const sweepFVG = fvgs.find(f =>
      sweep.dir === 'BULL' ? (f.dir === 'BULL' && price >= f.gapLow && price <= f.gapHigh) :
                              (f.dir === 'BEAR' && price >= f.gapLow && price <= f.gapHigh)
    )
    if (sweepFVG || (sweep && volRatio > 1.5)) {
      const isBull = sweep.dir === 'BULL'
      addSig({
        dir: isBull ? 'LONG' : 'SHORT',
        grade: 'A+',
        reason: `${sweep.type} + ${sweepFVG ? 'FVG Confluence' : 'Volume Spike'}`,
        pattern: 'Liq Sweep',
        entryLabel: 'T1 · ICT SWEEP',
        stop:   isBull ? sweep.sweepLow  * 0.9992 : sweep.sweepHigh * 1.0008,
        target: isBull ? price * 1.022          : price * 0.978,
        stopNote:   isBull ? 'Below sweep wick (stop hunt low)' : 'Above sweep wick (stop hunt high)',
        targetNote: '50% at 1.5R · trail to prior swing · ICT draw on liquidity',
        rule: sweep.rule,
        source: 'ICT',
        killZone: killZone.name,
      })
    }
  }

  // 2. ORDER BLOCK RETEST (active OB + price inside + volume)
  const activeOB = orderBlocks.find(ob => ob.active)
  if (activeOB && volRatio > 1.2 && structure.mtfScore >= 1) {
    const isBull = activeOB.dir === 'BULL'
    addSig({
      dir: isBull ? 'LONG' : 'SHORT',
      grade: 'A+',
      reason: `${activeOB.label} Retest${kzBonus ? ' · Kill Zone' : ''}`,
      pattern: 'Order Block',
      entryLabel: 'T2 · ICT ORDER BLOCK',
      stop:   isBull ? activeOB.obLow  * 0.9988 : activeOB.obHigh * 1.0012,
      target: isBull ? price * 1.018           : price * 0.982,
      stopNote:   isBull ? 'Below OB low — if hit, OB is invalidated' : 'Above OB high',
      targetNote: 'Target: next FVG or swing high/low. 50% at midpoint.',
      rule: activeOB.rule,
      source: 'ICT',
      killZone: killZone.name,
    })
  }

  // 3. FVG RETEST (price in active FVG)
  const activeFVG = fvgs.find(f => f.active && !f.inverted)
  if (activeFVG && volRatio > 1.1 && rsi > 30 && rsi < 70) {
    const isBull = activeFVG.dir === 'BULL'
    addSig({
      dir: isBull ? 'LONG' : 'SHORT',
      grade: 'A',
      reason: `${activeFVG.label} Retest @ CE`,
      pattern: 'FVG',
      entryLabel: 'T2 · ICT FVG',
      stop:   isBull ? activeFVG.gapLow  * 0.9992 : activeFVG.gapHigh * 1.0008,
      target: isBull ? activeFVG.gapHigh * 1.008  : activeFVG.gapLow  * 0.992,
      stopNote:   'Beyond FVG boundary — gap is fully filled',
      targetNote: 'CE (midpoint) then beyond gap for continuation',
      rule: activeFVG.rule,
      source: 'ICT',
      killZone: killZone.name,
    })
  }

  // 4. IFVG RETEST (inverted FVG — highest conviction reversal)
  const activeIFVG = fvgs.find(f => f.inverted)
  if (activeIFVG && Math.abs((price - activeIFVG.mid) / activeIFVG.mid) < 0.002) {
    const isBull = activeIFVG.dir === 'BEAR' // BEAR FVG inverted = now BULLISH
    addSig({
      dir: isBull ? 'LONG' : 'SHORT',
      grade: 'A+',
      reason: `IFVG Retest — ${activeIFVG.label}`,
      pattern: 'IFVG',
      entryLabel: 'T2 · ICT IFVG',
      stop:   isBull ? activeIFVG.gapLow  * 0.9990 : activeIFVG.gapHigh * 1.0010,
      target: isBull ? price * 1.02               : price * 0.98,
      stopNote:   'Beyond inverted gap — if broken, the flip has failed',
      targetNote: 'Next draw on liquidity. IFVGs have high follow-through.',
      rule: activeIFVG.rule,
      source: 'ICT',
      killZone: killZone.name,
    })
  }

  // 5. BREAKER BLOCK RETEST
  if (breaker && Math.abs((price - breaker.level) / breaker.level) < 0.003) {
    const isBull = breaker.dir === 'BULL'
    addSig({
      dir: isBull ? 'LONG' : 'SHORT',
      grade: 'A',
      reason: `${breaker.type} Retest`,
      pattern: 'Breaker',
      entryLabel: 'T2 · ICT BREAKER',
      stop:   isBull ? breaker.low  * 0.9990 : breaker.high * 1.0010,
      target: isBull ? price * 1.016         : price * 0.984,
      stopNote:   'Beyond breaker candle extreme',
      targetNote: 'First liquidity target beyond breaker',
      rule: breaker.rule,
      source: 'ICT',
      killZone: killZone.name,
    })
  }

  // 6. VOLUME PROFILE — POC MEAN REVERSION
  if (vpLevels && Math.abs(vpLevels.pocDev) > 0.8 && volRatio > 1.2) {
    const isBull = price < vpLevels.poc
    addSig({
      dir: isBull ? 'LONG' : 'SHORT',
      grade: 'A',
      reason: `POC Mean Reversion (${vpLevels.pocDev.toFixed(1)}% from POC)`,
      pattern: 'POC Reversion',
      entryLabel: 'T2 · VOL PROFILE',
      stop:   isBull ? price * 0.994 : price * 1.006,
      target: vpLevels.poc,
      stopNote:   '0.6% emergency stop — price refuses to revert',
      targetNote: 'Full mean reversion to POC (highest volume node)',
      rule: 'VP: Price is statistically drawn to the POC — the highest volume price level. At >0.8% deviation, mean reversion probability is high. Exit AT the POC.',
      source: 'VOLUME_PROFILE',
      killZone: killZone.name,
    })
  }

  // 7. VALUE AREA HIGH/LOW REJECTION (VAH/VAL as S/R)
  if (vpLevels?.atVAH && rsi > 60 && volRatio > 1.1) {
    addSig({
      dir: 'SHORT',
      grade: 'A',
      reason: 'VAH Rejection — Value Area Boundary',
      pattern: 'VAH Reject',
      entryLabel: 'T2 · VAH SHORT',
      stop:   vpLevels.vah * 1.003,
      target: vpLevels.poc,
      stopNote:   'Above VAH — value area accepted higher',
      targetNote: 'POC (first target) then VAL',
      rule: 'VP: VAH = top of 70% volume zone. In ranging market, price rejects here 80% of time. Short on VAH touch with volume confirmation.',
      source: 'VOLUME_PROFILE',
      killZone: killZone.name,
    })
  }
  if (vpLevels?.atVAL && rsi < 40 && volRatio > 1.1) {
    addSig({
      dir: 'LONG',
      grade: 'A',
      reason: 'VAL Support — Value Area Boundary',
      pattern: 'VAL Support',
      entryLabel: 'T2 · VAL LONG',
      stop:   vpLevels.val * 0.997,
      target: vpLevels.poc,
      stopNote:   'Below VAL — value area accepted lower',
      targetNote: 'POC (first target) then VAH',
      rule: 'VP 80% Rule: If price enters value area from below, 80% chance it fills to VAH. Long at VAL, target POC then VAH.',
      source: 'VOLUME_PROFILE',
      killZone: killZone.name,
    })
  }

  // 8. INITIAL BALANCE BREAKOUT (Market Profile)
  if (mpLevels && isNQorES) {
    if (mpLevels.atIBHigh && volRatio > 1.5 && !mpLevels.extendedUp) {
      addSig({
        dir: 'LONG',
        grade: 'A',
        reason: 'IB High Breakout — Market Profile',
        pattern: 'IB Break',
        entryLabel: 'T1 · MARKET PROFILE',
        stop:   mpLevels.ibHigh * 0.998,
        target: mpLevels.ibHigh + mpLevels.ibRange,
        stopNote:   'Below IB High — failed breakout',
        targetNote: 'Target: IB High + IB Range (range extension)',
        rule: 'Market Profile: IB High breakout with volume = range extension likely. NQ/ES specific — strong NY open signal. Stop just below broken IB High.',
        source: 'MARKET_PROFILE',
        killZone: killZone.name,
      })
    }
    if (mpLevels.atIBLow && volRatio > 1.5 && !mpLevels.extendedDown) {
      addSig({
        dir: 'SHORT',
        grade: 'A',
        reason: 'IB Low Breakdown — Market Profile',
        pattern: 'IB Break',
        entryLabel: 'T1 · MARKET PROFILE',
        stop:   mpLevels.ibLow * 1.002,
        target: mpLevels.ibLow - mpLevels.ibRange,
        stopNote:   'Above IB Low — failed breakdown',
        targetNote: 'Target: IB Low − IB Range (downside extension)',
        rule: 'Market Profile: IB Low breakdown = bearish range extension. Especially powerful on NQ. Trail stop above each new lower high.',
        source: 'MARKET_PROFILE',
        killZone: killZone.name,
      })
    }
  }

  // 9. SMT DIVERGENCE (NQ vs ES — highest conviction)
  if (smt && killZone.active) {
    const isBull = smt.dir === 'BULL'
    addSig({
      dir: isBull ? 'LONG' : 'SHORT',
      grade: 'A+',
      reason: `${smt.type} · NY Kill Zone`,
      pattern: 'SMT',
      entryLabel: 'T1 · SMT DIVERGENCE',
      stop:   isBull ? price * 0.993 : price * 1.007,
      target: isBull ? price * 1.025 : price * 0.975,
      stopNote:   'Beyond the sweep wick of the diverging instrument',
      targetNote: 'Opposite liquidity pool — prior swing high or low',
      rule: smt.rule,
      source: 'ICT',
      killZone: killZone.name,
    })
  }

  // 10. LVN FAST MOVE (Low Volume Node — price passes through quickly)
  if (vpLevels?.lvns?.length > 0) {
    const nearLVN = vpLevels.lvns.find(lvn => Math.abs((price - lvn) / lvn) < 0.001)
    if (nearLVN && volRatio > 1.3 && structure.trend !== 'RANGING') {
      const isBull = structure.trend === 'UPTREND'
      addSig({
        dir: isBull ? 'LONG' : 'SHORT',
        grade: 'B',
        reason: 'LVN Fast-Pass Zone — Low Volume Node',
        pattern: 'LVN',
        entryLabel: 'T1 · LVN PASS',
        stop:   isBull ? nearLVN * 0.997 : nearLVN * 1.003,
        target: isBull ? (vpLevels.hvns.find(h => h > price) || price * 1.012) : (vpLevels.hvns.reverse().find(h => h < price) || price * 0.988),
        stopNote:   'Back through LVN — pass-through failed',
        targetNote: 'Next HVN (high volume node) — price decelerates there',
        rule: 'VP: Low Volume Nodes have thin order books — price passes through quickly. In trending conditions, enter in trend direction at LVN for momentum. Target next HVN.',
        source: 'VOLUME_PROFILE',
        killZone: killZone.name,
      })
    }
  }

  return { ictSignals, fvgs, orderBlocks, sweep, breaker, vpLevels, mpLevels, killZone, smt }
}

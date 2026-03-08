import { useState, useEffect, useRef, useCallback } from 'react'
import { useMarketData } from './hooks/useMarketData.js'
import { detectSignals, fmt, fmtPct, fmtVol } from './engine/technicals.js'
import { ALL_SYMBOLS, FUTURES_CONFIG, MARKET_COLORS, TREND_COLORS } from './engine/symbols.js'
import { MiniChart, RSIBar, GradeBadge, SignalPill, MTFBadge, AlertCard, DataBadge } from './components/UI.jsx'

// ─── PLAYBOOK DATA ────────────────────────────────────────────────────────────
const PLAYBOOK = [
  { grade: 'A+', color: '#ffd700', title: 'Bullish/Bearish Engulfing @ VWAP',
    books: ['Candlestick Bible', 'MTF Analysis', 'Day Trading Playbook'],
    long: 'Bull engulf body > prior candle · At/near VWAP (±0.5%) · Vol >1.8× · MTF ≥2',
    short: 'Bear engulf body > prior candle · At/near VWAP (±0.5%) · Vol >1.8× · MTF ≥2',
    entry: 'Wait for candle CLOSE (Thornton). Enter next candle open. Limit at body midpoint for precision.',
    stop: 'LONG: Below engulf low · SHORT: Above engulf high',
    target: '50% off at 1.5R · Runner to 3R · Hard exit: price closes back through VWAP',
    rr: '2.7–3.5R',
    mind: 'Trading in the Zone: When all conditions check, execute without hesitation or second-guessing.' },
  { grade: 'A+', color: '#ffd700', title: 'Break of Structure + Volume',
    books: ['MTF Analysis', 'Day Trading Playbook'],
    long: 'Prior swing high broken on close · Vol >2.0× · MTF ≥2 · RSI 52–78',
    short: 'Prior swing low broken on close · Vol >2.0× · MTF ≥2 · RSI 22–48',
    entry: 'Thornton Type 1: Wait for retest of broken level. Enter on retest candle close or limit at level.',
    stop: 'LONG: Below broken level (now support) · SHORT: Above broken level (now resistance)',
    target: '50% at 1.5R · Trail structure behind 50%',
    rr: '2.5–4R',
    mind: 'Shannon: BOS = new market participants entering. Retail enters too early. Wait for the retest.' },
  { grade: 'A+', color: '#ffd700', title: 'Morning Star / Evening Star',
    books: ['Candlestick Bible', 'Day Trading Playbook'],
    long: '3 candles: big bear · small body · bull closes above bear midpoint · at support · RSI <42',
    short: '3 candles: big bull · small body · bear closes below bull midpoint · at resistance · RSI >58',
    entry: 'Thornton Type 2: Enter on close of 3rd candle only. Must be at identifiable level.',
    stop: 'Below/above the lowest/highest candle in the 3-candle pattern',
    target: 'VWAP retest or prior structure level',
    rr: '2.2–3R',
    mind: 'Ravenshaw: 3-candle patterns show COMPLETE sentiment shift. Never trade in isolation — must be at a level.' },
  { grade: 'A', color: '#00e5a0', title: 'Hammer / Dragonfly at Support',
    books: ['Candlestick Bible', 'Day Trading Playbook'],
    long: 'Lower wick ≥2× body · Close near high · At support · RSI <40 · Vol >1.3×',
    short: 'N/A — hammer/dragonfly are exclusively bullish signals',
    entry: 'Next candle open OR limit order at body close level for tighter entry.',
    stop: 'Below the wick low — this is the EXACT rejection point',
    target: 'VWAP retest then next resistance',
    rr: '2.0–2.8R',
    mind: 'Ravenshaw: The wick IS the signal. Buyers overwhelmed sellers and reclaimed. The low is defended.' },
  { grade: 'A', color: '#00e5a0', title: 'VWAP 2SD Extreme Mean Reversion',
    books: ['MTF Analysis'],
    long: 'Price >2.2% below VWAP · RSI <35 · Vol >1.4× · MTF ≥1',
    short: 'Price >2.2% above VWAP · RSI >65 · Vol >1.4× · MTF ≥1',
    entry: 'Market order on next candle open. Most effective on ES/NQ futures.',
    stop: '±0.6% from entry — emergency stop regardless of structure',
    target: 'Full mean reversion to VWAP',
    rr: '2.0–3.5R',
    mind: 'Shannon: At 2SD extremes, the rubber band is stretched maximally. Statistically it snaps back.' },
  { grade: 'B', color: '#60a0ff', title: '8 EMA Pullback Continuation',
    books: ['MTF Analysis', 'Day Trading Playbook'],
    long: 'Uptrend (HH+HL confirmed) · Price pulls to 8 EMA ±0.3% · RSI 42–62 · Vol >1.1×',
    short: 'Downtrend (LH+LL confirmed) · Price pulls to 8 EMA ±0.3% · RSI 38–58 · Vol >1.1×',
    entry: 'Thornton Type 3: Limit order AT the 8 EMA for lowest risk entry.',
    stop: '3 ticks below EMA (futures) / 0.3% below EMA (stocks/crypto)',
    target: 'Trail stop behind 8 EMA — exit when EMA broken on close',
    rr: '1.5–2.5R',
    mind: 'Thornton: Type 3 is lowest-risk. You are NOT predicting — you are joining an established trend cheaply.' },
]

// ─── AUDIO ALERTS ─────────────────────────────────────────────────────────────
function playBeep(dir, grade) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    const freq = dir === 'LONG'
      ? (grade === 'A+' ? 1046 : 880)
      : (grade === 'A+' ?  523 : 440)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.22, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start()
    osc.stop(ctx.currentTime + 0.45)
  } catch {}
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [scanActive, setScanActive]   = useState(true)
  const [tab, setTab]                 = useState('SCREENER')
  const [markets, setMarkets]         = useState(['FUT', 'US', 'CRYPTO'])
  const [dirFilter, setDirFilter]     = useState('ALL')
  const [gradeFilter, setGradeFilter] = useState('ALL')
  const [soundOn, setSoundOn]         = useState(true)
  const [alerts, setAlerts]           = useState([])
  const [riskPct, setRiskPct]         = useState(1)
  const [accountSize, setAccountSize] = useState(50000)
  const [expandedSym, setExpandedSym] = useState(null)
  const [tick, setTick]               = useState(0)
  const alertIdRef    = useRef(0)
  const lastFiredRef  = useRef({})

  const { marketData, isLive, dataMode } = useMarketData(scanActive)

  // Tick for signal scanning
  useEffect(() => {
    if (!scanActive) return
    const id = setInterval(() => setTick(t => t + 1), 2500)
    return () => clearInterval(id)
  }, [scanActive])

  // Signal → Alert pipeline
  useEffect(() => {
    if (!scanActive || Object.keys(marketData).length === 0) return
    const newAlerts = []

    ALL_SYMBOLS.forEach(({ sym, market }) => {
      if (!markets.includes(market)) return
      const d = marketData[sym]
      if (!d?.candles || d.candles.length < 3) return

      const { signals } = detectSignals({
        sym, market, candles: d.candles, price: d.price,
        vwap: d.vwap, rsi: d.rsi, volRatio: d.volRatio,
        ema8: d.ema8, structure: d.structure,
        riskPct, accountSize,
      })

      signals.forEach(sig => {
        const key      = `${sym}-${sig.dir}-${sig.grade}-${sig.pattern}`
        const last     = lastFiredRef.current[key] || 0
        const cooldown = sig.grade === 'A+' ? 20000 : sig.grade === 'A' ? 14000 : 10000
        if (Date.now() - last < cooldown) return
        // Probabilistic gate — not every scan fires
        const fireChance = sig.grade === 'A+' ? 0.28 : sig.grade === 'A' ? 0.20 : 0.14
        if (Math.random() > fireChance) return

        lastFiredRef.current[key] = Date.now()
        alertIdRef.current++
        newAlerts.push({ id: alertIdRef.current, sym, market, ts: Date.now(), ...sig })
        if (soundOn) playBeep(sig.dir, sig.grade)
      })
    })

    if (newAlerts.length > 0)
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 100))
  }, [tick, soundOn, riskPct, accountSize, markets, scanActive])

  const toggleMarket = m => setMarkets(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])

  // Compute screener rows
  const screenerRows = ALL_SYMBOLS
    .filter(({ market }) => markets.includes(market))
    .map(({ sym, market }) => {
      const d = marketData[sym]
      if (!d?.candles) return null
      const result = detectSignals({
        sym, market, candles: d.candles, price: d.price,
        vwap: d.vwap, rsi: d.rsi, volRatio: d.volRatio,
        ema8: d.ema8, structure: d.structure,
        riskPct, accountSize,
      })
      return { sym, market, d, ...result }
    })
    .filter(Boolean)

  const displayRows = screenerRows.filter(r => {
    if (dirFilter === 'LONG')    return r.signals.some(s => s.dir === 'LONG')
    if (dirFilter === 'SHORT')   return r.signals.some(s => s.dir === 'SHORT')
    if (dirFilter === 'SIGNALS') return r.signals.length > 0
    return true
  })

  const filteredAlerts = alerts.filter(a => {
    const mOk = markets.includes(a.market)
    const dOk = dirFilter === 'ALL' || a.dir === dirFilter
    const gOk = gradeFilter === 'ALL' || a.grade === gradeFilter
    return mOk && dOk && gOk
  })

  const recentAlerts = alerts.filter(a => Date.now() - a.ts < 60000)
  const longCount    = recentAlerts.filter(a => a.dir === 'LONG').length
  const shortCount   = recentAlerts.filter(a => a.dir === 'SHORT').length

  // Futures risk calc
  const futuresRiskCalc = FUTURES_CONFIG.map(f => {
    const stopTicks  = { ES: 4, NQ: 8, CL: 20, GC: 10 }[f.sym] || 5
    const stopDollar = stopTicks * f.pointVal * f.tickSize
    const riskDollar = accountSize * riskPct / 100
    return { ...f, stopTicks, stopDollar, maxContracts: Math.max(0, Math.floor(riskDollar / stopDollar)) }
  })

  return (
    <div style={{ minHeight: '100vh', background: '#060610', color: '#b0b0cc',
      fontFamily: "'Share Tech Mono','Courier New',monospace", display: 'flex', flexDirection: 'column' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Exo+2:wght@400;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #060610; }
        ::-webkit-scrollbar-thumb { background: #1e1e38; border-radius: 2px; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        .row:hover { background: rgba(255,255,255,0.02) !important; cursor: pointer; }
        .btn { cursor: pointer; border: none; font-family: inherit; transition: all 0.13s; }
        .btn:hover { filter: brightness(1.2); }
        input { font-family: 'Share Tech Mono', monospace; outline: none; }
        input:focus { border-color: #4af0c4 !important; }
      `}</style>

      {/* ══ HEADER ══ */}
      <div style={{ background: '#07070f', borderBottom: '1px solid #12122a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 18px', height: 54, flexShrink: 0 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 18,
              background: 'linear-gradient(135deg,#4af0c4,#0066ff)',
              boxShadow: '0 0 18px #4af0c433' }}>⚡</div>
            <div>
              <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 15, fontWeight: 800,
                color: '#eeeeff', letterSpacing: 3 }}>
                APEX <span style={{ color: '#4af0c4' }}>PRO</span>
              </div>
              <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2 }}>5-BOOK ENGINE · 1–5M SCALP</div>
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: '#12122a' }} />
          {Object.entries(MARKET_COLORS).map(([m, c]) => (
            <button key={m} className="btn" onClick={() => toggleMarket(m)} style={{
              padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3,
              background: markets.includes(m) ? `${c}18` : 'transparent',
              border: `1px solid ${markets.includes(m) ? c : '#1e1e32'}`,
              color: markets.includes(m) ? c : '#2a2a3e' }}>{m}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DataBadge isLive={isLive} dataMode={dataMode} />
          <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
            <span style={{ color: '#00e5a0' }}>▲ {longCount}</span>
            <span style={{ color: '#ff3b5c' }}>▼ {shortCount}</span>
            <span style={{ color: '#2a2a3e' }}>{displayRows.length} sym</span>
          </div>
          <button className="btn" onClick={() => setScanActive(p => !p)} style={{
            padding: '5px 14px', fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3,
            background: scanActive ? 'rgba(74,240,196,0.08)' : 'rgba(255,59,92,0.08)',
            border: `1px solid ${scanActive ? '#4af0c4' : '#ff3b5c'}`,
            color: scanActive ? '#4af0c4' : '#ff3b5c' }}>
            <span style={{ animation: scanActive ? 'pulse 1.4s infinite' : 'none',
              display: 'inline-block', marginRight: 5 }}>●</span>
            {scanActive ? 'LIVE' : 'PAUSED'}
          </button>
          <button className="btn" onClick={() => setSoundOn(p => !p)} style={{
            width: 32, height: 32, fontSize: 14, borderRadius: 3,
            background: '#0e0e1a', border: '1px solid #1e1e32',
            color: soundOn ? '#aaa' : '#2a2a3e' }}>{soundOn ? '🔔' : '🔕'}</button>
        </div>
      </div>

      {/* ══ TAB BAR ══ */}
      <div style={{ background: '#07070f', borderBottom: '1px solid #0e0e1e',
        display: 'flex', alignItems: 'center', padding: '0 18px', flexShrink: 0 }}>
        {[['SCREENER', '📊'], ['ALERTS', '🔔'], ['RISK', '⚖️'], ['PLAYBOOK', '📖']].map(([t, icon]) => (
          <button key={t} className="btn" onClick={() => setTab(t)} style={{
            padding: '11px 17px', fontSize: 10, fontWeight: 600, letterSpacing: 1, background: 'transparent',
            color: tab === t ? '#eeeeff' : '#2a2a3e',
            borderBottom: `2px solid ${tab === t ? '#4af0c4' : 'transparent'}`, marginBottom: -1 }}>
            {icon} {t}
            {t === 'ALERTS' && alerts.length > 0 && (
              <span style={{ marginLeft: 5, background: '#ff3b5c', color: '#fff',
                fontSize: 8, padding: '1px 5px', borderRadius: 8, fontWeight: 800 }}>
                {Math.min(alerts.length, 99)}
              </span>
            )}
          </button>
        ))}

        {/* Filters — right side */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
          {['ALL', 'LONG', 'SHORT', 'SIGNALS'].map(f => (
            <button key={f} className="btn" onClick={() => setDirFilter(f)} style={{
              padding: '3px 8px', fontSize: 9, fontWeight: 700, borderRadius: 2,
              background: dirFilter === f ? '#ffffff0d' : 'transparent',
              border: `1px solid ${dirFilter === f
                ? (f === 'LONG' ? '#00e5a066' : f === 'SHORT' ? '#ff3b5c66' : '#2a2a3e')
                : '#12122a'}`,
              color: dirFilter === f
                ? (f === 'LONG' ? '#00e5a0' : f === 'SHORT' ? '#ff3b5c' : '#999')
                : '#2a2a3e' }}>{f}</button>
          ))}
          <div style={{ width: 1, height: 14, background: '#12122a', margin: '0 2px' }} />
          {['ALL', 'A+', 'A', 'B'].map(g => (
            <button key={g} className="btn" onClick={() => setGradeFilter(g)} style={{
              padding: '3px 7px', fontSize: 9, fontWeight: 800, borderRadius: 2,
              background: gradeFilter === g ? '#ffffff0d' : 'transparent',
              border: `1px solid ${gradeFilter === g ? '#2a2a3e' : '#12122a'}`,
              color: gradeFilter === g
                ? (g === 'A+' ? '#ffd700' : g === 'A' ? '#4af0c4' : g === 'B' ? '#60a0ff' : '#999')
                : '#2a2a3e' }}>{g}</button>
          ))}
        </div>
      </div>

      {/* ══ MAIN CONTENT ══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── SCREENER TAB ── */}
        {tab === 'SCREENER' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Column headers */}
            <div style={{ display: 'grid',
              gridTemplateColumns: '116px 46px 78px 80px 68px 58px 68px 78px 68px 68px 1fr',
              padding: '7px 14px', background: '#07070f',
              borderBottom: '1px solid #0d0d1e',
              fontSize: 8, color: '#1e1e3a', fontWeight: 700, letterSpacing: 1,
              position: 'sticky', top: 0, zIndex: 2 }}>
              {['SYMBOL','MKT','CHART','PRICE','CHG%','VOL×','RSI','TREND','MTF','ENTRY','SIGNALS'].map(h => (
                <span key={h}>{h}</span>
              ))}
            </div>

            {displayRows.map(({ sym, market, d, signals, patterns, entryType }) => {
              const cfg      = ALL_SYMBOLS.find(s => s.sym === sym)
              const isUp     = d.pct >= 0
              const topSig   = [...signals].sort((a, b) =>
                (a.grade === 'A+' ? 0 : a.grade === 'A' ? 1 : 2) -
                (b.grade === 'A+' ? 0 : b.grade === 'A' ? 1 : 2))[0]
              const isExpanded = expandedSym === sym
              const borderCol  = topSig?.dir === 'LONG' ? '#00e5a0'
                : topSig?.dir === 'SHORT' ? '#ff3b5c' : 'transparent'

              return (
                <div key={sym}>
                  <div className="row"
                    onClick={() => setExpandedSym(isExpanded ? null : sym)}
                    style={{ display: 'grid',
                      gridTemplateColumns: '116px 46px 78px 80px 68px 58px 68px 78px 68px 68px 1fr',
                      padding: '8px 14px', borderBottom: '1px solid #09091a', alignItems: 'center',
                      background: signals.length > 0 ? 'rgba(255,255,255,0.014)' : 'transparent',
                      borderLeft: `2px solid ${signals.length > 0 ? borderCol + '55' : 'transparent'}` }}>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: cfg?.color || '#ccd' }}>{sym}</div>
                      {cfg?.name && <div style={{ fontSize: 8, color: '#1e1e3a' }}>{cfg.name}</div>}
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 700, color: MARKET_COLORS[market] || '#555' }}>{market}</span>
                    <MiniChart candles={d.candles} width={72} height={24} />
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ccd' }}>
                      ${fmt(d.price, d.price > 100 ? 2 : 4)}
                    </span>
                    <span style={{ fontSize: 11, color: isUp ? '#00e5a0' : '#ff3b5c', fontWeight: 600 }}>
                      {fmtPct(d.pct)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: d.volRatio > 1.5 ? 700 : 400,
                      color: d.volRatio > 2 ? '#ffd700' : d.volRatio > 1.5 ? '#ffaa44' : '#333' }}>
                      {d.volRatio.toFixed(1)}×
                    </span>
                    <RSIBar value={d.rsi} />
                    <span style={{ fontSize: 9, fontWeight: 700,
                      color: TREND_COLORS[d.structure?.trend] || '#444' }}>
                      {d.structure?.trend === 'UPTREND' ? '▲ UP'
                        : d.structure?.trend === 'DOWNTREND' ? '▼ DOWN' : '— RNG'}
                    </span>
                    <MTFBadge score={d.structure?.mtfScore ?? 0} />
                    <span style={{ fontSize: 9, color: entryType?.color || '#2a2a3e' }}>
                      {entryType?.label || '—'}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {signals.slice(0, 2).map((s, i) => <SignalPill key={i} sig={s} />)}
                      {signals.length === 0 && <span style={{ fontSize: 9, color: '#1a1a2e' }}>watching</span>}
                    </div>
                  </div>

                  {/* ── EXPANDED TRADE DETAIL ── */}
                  {isExpanded && (
                    <div style={{ background: '#08081a', borderBottom: '1px solid #10102a',
                      padding: '14px 18px', animation: 'slideIn 0.2s ease' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                        {/* Patterns */}
                        <div>
                          <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2, marginBottom: 8 }}>
                            CANDLESTICK PATTERNS (RAVENSHAW)
                          </div>
                          {patterns.length === 0
                            ? <span style={{ fontSize: 10, color: '#1e1e3a' }}>No patterns detected — stand aside</span>
                            : patterns.map((p, i) => {
                              const c = p.dir === 'LONG' ? '#00e5a0' : p.dir === 'SHORT' ? '#ff3b5c' : '#777'
                              return (
                                <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 2,
                                    background: `${c}14`, border: `1px solid ${c}28`, color: c }}>{p.name}</span>
                                  <span style={{ fontSize: 9, color: '#444', flex: 1 }}>{p.desc}</span>
                                  <GradeBadge grade={p.strength} />
                                </div>
                              )
                            })
                          }
                        </div>

                        {/* Trade plans */}
                        <div>
                          <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2, marginBottom: 8 }}>
                            TRADE PLANS (THORNTON)
                          </div>
                          {signals.length === 0
                            ? <span style={{ fontSize: 10, color: '#1e1e3a' }}>No active setups</span>
                            : signals.map((s, i) => {
                              const c = s.dir === 'LONG' ? '#00e5a0' : s.dir === 'SHORT' ? '#ff3b5c' : '#aaa'
                              return (
                                <div key={i} style={{ marginBottom: 10, padding: '10px 12px',
                                  background: '#0c0c1e', borderRadius: 4, borderLeft: `3px solid ${c}` }}>
                                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 7 }}>
                                    <span style={{ color: c, fontWeight: 800, fontSize: 11 }}>
                                      {s.dir === 'LONG' ? '▲' : s.dir === 'SHORT' ? '▼' : '◆'} {s.dir}
                                    </span>
                                    <GradeBadge grade={s.grade} />
                                    <span style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>{s.entryLabel}</span>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 6 }}>
                                    {[['STOP', `$${fmt(s.stop)}`, '#ff3b5c'],
                                      ['TARGET', `$${fmt(s.target)}`, '#00e5a0'],
                                      ['R:R', `${s.rr}R`, '#ffd700'],
                                      ['SIZE', s.positionSize || '—', '#aaa']
                                    ].map(([l, v, col]) => (
                                      <div key={l} style={{ background: '#080816', borderRadius: 3, padding: '4px 6px' }}>
                                        <div style={{ fontSize: 7, color: '#1e1e3a', letterSpacing: 1, marginBottom: 2 }}>{l}</div>
                                        <div style={{ fontSize: 10, color: col, fontFamily: 'monospace', fontWeight: 600 }}>{v}</div>
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ fontSize: 8, color: '#333' }}>{s.stopNote} · {s.targetNote}</div>
                                </div>
                              )
                            })
                          }
                        </div>
                      </div>

                      {/* BOS alert */}
                      {d.structure?.bos && (
                        <div style={{ marginTop: 10, padding: '7px 12px',
                          background: '#ffd70010', border: '1px solid #ffd70030',
                          borderRadius: 3, fontSize: 9, color: '#ffd700' }}>
                          ⚡ BREAK OF STRUCTURE: {d.structure.bos.replace('_', ' ')} —
                          Shannon: New participants entering. Wait for retest of broken level before entry.
                        </div>
                      )}

                      {/* Indicators summary */}
                      <div style={{ marginTop: 10, display: 'flex', gap: 20, fontSize: 9, color: '#333' }}>
                        <span>VWAP <span style={{ color: '#aaa', fontFamily: 'monospace' }}>${fmt(d.vwap)}</span></span>
                        <span>VWAP DEV <span style={{ color: d.vwapDev > 0 ? '#4af' : '#fa4', fontFamily: 'monospace' }}>{fmtPct(d.vwapDev)}</span></span>
                        <span>8 EMA <span style={{ color: '#aaa', fontFamily: 'monospace' }}>${fmt(d.ema8)}</span></span>
                        <span>DATA <span style={{ color: d.source === 'live' ? '#4af0c4' : '#ffaa44' }}>{d.source?.toUpperCase()}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {displayRows.length === 0 && (
              <div style={{ padding: 60, textAlign: 'center', color: '#1a1a2e' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🎯</div>
                <div style={{ fontSize: 12 }}>No setups match current filters.</div>
                <div style={{ fontSize: 10, marginTop: 6 }}>
                  Disciplined Trader: The market owes you nothing. Wait for the edge.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS TAB ── */}
        {tab === 'ALERTS' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '9px 16px', borderBottom: '1px solid #0d0d1e',
              background: '#07070f', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#4af0c4' }}>{filteredAlerts.length} alerts</span>
              <button className="btn" onClick={() => setAlerts([])} style={{
                padding: '3px 10px', fontSize: 9, background: 'transparent',
                border: '1px solid #1e1e2e', color: '#333', borderRadius: 2 }}>CLEAR</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {filteredAlerts.length === 0 && (
                <div style={{ padding: 60, textAlign: 'center', color: '#1a1a2e' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
                  <div style={{ fontSize: 12 }}>Scanning {ALL_SYMBOLS.filter(s => markets.includes(s.market)).length} instruments...</div>
                  <div style={{ fontSize: 10, marginTop: 6, color: '#111' }}>
                    Only high-confluence setups trigger alerts.<br />Best Loser Wins: Fewer, better alerts.
                  </div>
                </div>
              )}
              {filteredAlerts.map((a, i) => (
                <AlertCard key={a.id} alert={a} isNew={i === 0 && Date.now() - a.ts < 3000} />
              ))}
            </div>
          </div>
        )}

        {/* ── RISK TAB ── */}
        {tab === 'RISK' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Controls */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #0e0e1e', background: '#07070f' }}>
              <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2, marginBottom: 14 }}>
                RISK MANAGEMENT — BEST LOSER WINS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
                <div>
                  <div style={{ fontSize: 8, color: '#333', marginBottom: 6, letterSpacing: 1 }}>ACCOUNT SIZE ($)</div>
                  <input
                    value={accountSize}
                    onChange={e => setAccountSize(Number(e.target.value.replace(/\D/g, '')))}
                    style={{ width: '100%', background: '#0e0e1a', border: '1px solid #1e1e32', color: '#dde',
                      padding: '8px 10px', fontSize: 13, borderRadius: 3 }}
                    placeholder="50000" />
                </div>
                <div>
                  <div style={{ fontSize: 8, color: '#333', marginBottom: 6, letterSpacing: 1 }}>RISK PER TRADE</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0.5, 1, 1.5, 2].map(p => (
                      <button key={p} className="btn" onClick={() => setRiskPct(p)} style={{
                        flex: 1, padding: '8px 4px', fontSize: 11, fontFamily: 'monospace',
                        background: riskPct === p ? '#00e5a018' : '#0e0e1a',
                        border: `1px solid ${riskPct === p ? '#00e5a0' : '#1e1e32'}`,
                        color: riskPct === p ? '#00e5a0' : '#444', borderRadius: 3 }}>{p}%</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: '#333', marginBottom: 6, letterSpacing: 1 }}>MAX RISK / TRADE</div>
                  <div style={{ background: '#0e0e1a', border: '1px solid #1e1e32', padding: '8px 12px', borderRadius: 3 }}>
                    <span style={{ fontSize: 15, color: '#ff3b5c', fontFamily: 'monospace', fontWeight: 700 }}>
                      ${(accountSize * riskPct / 100).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 9, color: '#1e1e2e', fontStyle: 'italic', lineHeight: 1.7 }}>
                📖 Best Loser Wins: Know your maximum dollar loss BEFORE you enter.
                If you cannot mentally accept losing this amount on this trade, reduce size or skip. No exceptions.
              </div>
            </div>

            {/* Futures contract specs */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2, marginBottom: 14 }}>
                LEVERAGED FUTURES SPECS — THORNTON POSITION SIZING
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {futuresRiskCalc.map(f => (
                  <div key={f.sym} style={{ background: '#09091a', border: '1px solid #14142a',
                    borderTop: `2px solid ${f.color}`, borderRadius: 4, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: f.color, marginBottom: 2 }}>{f.sym}</div>
                    <div style={{ fontSize: 9, color: '#2a2a3e', marginBottom: 10 }}>{f.name}</div>
                    {[['Tick Size', `$${f.tickSize}`],
                      ['Point Value', `$${f.pointVal}`],
                      ['Suggested Stop', `${f.stopTicks} ticks`],
                      ['Stop Cost', `$${f.stopDollar}`],
                      ['Max Contracts', `${f.maxContracts}`],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                        borderBottom: '1px solid #0c0c1a', padding: '4px 0', fontSize: 9 }}>
                        <span style={{ color: '#2a2a3e' }}>{l}</span>
                        <span style={{ color: '#999', fontFamily: 'monospace' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, fontSize: 12, color: f.color, fontWeight: 700 }}>
                      MAX: {f.maxContracts} × {f.sym}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#08081a',
                border: '1px solid #1a1a2a', borderRadius: 3, fontSize: 9, color: '#2a2a3e', lineHeight: 1.9 }}>
                <span style={{ color: '#ffd700' }}>⚡ THORNTON LEVERAGE RULES: </span>
                (1) Size by DOLLAR RISK, never intuition.
                (2) Never hold futures through FOMC · CPI · NFP · EIA.
                (3) Reduce to 50% size on B-grade setups.
                (4) First trade of the day: 1 contract only until +1R confirmed.
              </div>
            </div>
          </div>
        )}

        {/* ── PLAYBOOK TAB ── */}
        {tab === 'PLAYBOOK' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px', maxWidth: 840 }}>
            <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2, marginBottom: 20 }}>
              MASTER PLAYBOOK — 5 BOOKS · ALL SETUPS · FULL ENTRY TO EXIT
            </div>
            {PLAYBOOK.map((p, i) => (
              <div key={i} style={{ marginBottom: 16, border: `1px solid ${p.color}18`,
                borderLeft: `3px solid ${p.color}`, background: `${p.color}05`,
                borderRadius: 4, padding: '16px 18px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <GradeBadge grade={p.grade} />
                  <span style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 13, fontWeight: 700, color: '#dde' }}>
                    {p.title}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {p.books.map(b => (
                      <span key={b} style={{ fontSize: 7, padding: '1px 6px', background: '#ffffff07',
                        border: '1px solid #1a1a2a', color: '#2a2a3e', borderRadius: 2 }}>{b}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 7, color: '#1a1a2e', letterSpacing: 1, marginBottom: 4 }}>▲ LONG CONDITIONS</div>
                    <div style={{ fontSize: 9, color: '#00e5a0', lineHeight: 1.8, opacity: 0.85 }}>{p.long}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 7, color: '#1a1a2e', letterSpacing: 1, marginBottom: 4 }}>▼ SHORT CONDITIONS</div>
                    <div style={{ fontSize: 9, color: '#ff3b5c', lineHeight: 1.8, opacity: 0.85 }}>{p.short}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {[['ENTRY METHOD', p.entry, '#60a0ff'],
                    ['STOP', p.stop, '#ff3b5c'],
                    ['TARGET', p.target, '#00e5a0'],
                    ['R:R', p.rr, '#ffd700']
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ background: '#08081a', borderRadius: 3, padding: '7px 9px' }}>
                      <div style={{ fontSize: 7, color: '#1a1a2a', letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 9, color: c, lineHeight: 1.5 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic',
                  borderTop: '1px solid #0d0d1a', paddingTop: 9, lineHeight: 1.7 }}>
                  💬 {p.mind}
                </div>
              </div>
            ))}

            {/* The 5 Laws */}
            <div style={{ padding: '16px 18px', background: '#07070f',
              border: '1px solid #12122a', borderRadius: 4, marginTop: 6 }}>
              <div style={{ fontSize: 8, color: '#1e1e3a', letterSpacing: 2, marginBottom: 12 }}>
                THE 5 LAWS — NON-NEGOTIABLE
              </div>
              {[['Best Loser Wins',       'Define max loss before entry. Accept it fully or do not take the trade.'],
                ['Trading in the Zone',   'Every trade is independent. One loss is statistically meaningless. Execute the process.'],
                ['The Disciplined Trader','Rules are absolute. Discretion destroys edge. Follow the system.'],
                ['Candlestick Bible',     'Never trade a pattern alone. Confluence with level + volume is mandatory.'],
                ['MTF Analysis',          'Never fight the higher timeframe trend. Your scalp lives inside that environment.'],
              ].map(([book, law], i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0',
                  borderBottom: i < 4 ? '1px solid #0d0d1a' : 'none' }}>
                  <span style={{ color: '#4af0c4', fontSize: 11, minWidth: 14, marginTop: 1 }}>{i + 1}.</span>
                  <div>
                    <div style={{ fontSize: 7, color: '#1e1e3a', letterSpacing: 1, marginBottom: 2 }}>
                      {book.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10, color: '#888', lineHeight: 1.5 }}>{law}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══ STATUS BAR ══ */}
      <div style={{ height: 24, background: '#04040b', borderTop: '1px solid #0c0c18',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        gap: 20, fontSize: 8, color: '#141424', letterSpacing: 1, flexShrink: 0 }}>
        <span style={{ color: scanActive ? '#4af0c422' : '#ff3b5c22' }}>
          ● {scanActive ? 'SCANNING 2.5S' : 'PAUSED'} · {dataMode}
        </span>
        <span>ES · NQ · CL · GC · STOCKS · CRYPTO</span>
        <span>PATTERNS: ENGULF · BOS · STARS · HAMMER · MARUBOZU · EMA PULLBACK · VWAP 2SD</span>
        <span style={{ marginLeft: 'auto' }}>APEX PRO v2 · NOT FINANCIAL ADVICE</span>
      </div>
    </div>
  )
}

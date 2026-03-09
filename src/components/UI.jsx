import { fmt } from '../engine/technicals.js'
import { MTF_COLORS, MTF_LABELS } from '../engine/symbols.js'

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
export const C = {
  bg:      '#070711',
  surface: '#0d0d1f',
  card:    '#111126',
  border:  '#1e1e38',
  borderL: '#252545',
  text:    '#d4d4f0',
  textDim: '#6b6b9a',
  textFaint:'#2e2e50',
  long:    '#00e5a0',
  short:   '#ff3b5c',
  gold:    '#ffd700',
  blue:    '#60a0ff',
  teal:    '#4af0c4',
  orange:  '#ff8c42',
  purple:  '#b07fff',
}

// ─── MINI CANDLESTICK CHART ───────────────────────────────────────────────────
export function MiniChart({ candles, width = 80, height = 28 }) {
  if (!candles || candles.length < 2) return <div style={{ width, height }} />
  const recent = candles.slice(-12)
  const maxH   = Math.max(...recent.map(c => c.high))
  const minL   = Math.min(...recent.map(c => c.low))
  const range  = maxH - minL || 1
  const cw     = width / recent.length
  const scaleY = v => height - ((v - minL) / range) * (height - 2) - 1

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {recent.map((c, i) => {
        const x      = i * cw + cw * 0.12
        const bw     = Math.max(1, cw * 0.76)
        const yHigh  = scaleY(c.high)
        const yLow   = scaleY(c.low)
        const yOpen  = scaleY(c.open)
        const yClose = scaleY(c.close)
        const col    = c.close >= c.open ? C.long : C.short
        return (
          <g key={i}>
            <line x1={x + bw / 2} y1={yHigh} x2={x + bw / 2} y2={yLow}
              stroke={col} strokeWidth={0.8} opacity={0.45} />
            <rect x={x} y={Math.min(yOpen, yClose)} width={bw}
              height={Math.max(1.5, Math.abs(yOpen - yClose))}
              fill={col} opacity={0.92} rx={0.4} />
          </g>
        )
      })}
    </svg>
  )
}

// ─── RSI BAR ─────────────────────────────────────────────────────────────────
export function RSIBar({ value }) {
  const v   = value || 50
  const col = v > 70 ? C.short : v < 30 ? C.long : C.blue
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 4, background: '#141428', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '30%', width: 1, height: '100%', background: '#2a2a48' }} />
        <div style={{ position: 'absolute', left: '70%', width: 1, height: '100%', background: '#2a2a48' }} />
        <div style={{ position: 'absolute', left: 0, width: `${v}%`, height: '100%',
          background: `linear-gradient(90deg, ${col}88, ${col})`,
          transition: 'width 0.5s ease', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontFamily: 'monospace', minWidth: 24, fontWeight: 600 }}>
        {v.toFixed(0)}
      </span>
    </div>
  )
}

// ─── GRADE BADGE ─────────────────────────────────────────────────────────────
export function GradeBadge({ grade }) {
  const colors = { 'A+': C.gold, A: C.long, B: C.blue }
  const c = colors[grade] || '#666'
  return (
    <span style={{
      padding: '2px 8px', fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
      background: `${c}1a`, border: `1px solid ${c}55`, color: c,
      borderRadius: 4, whiteSpace: 'nowrap', letterSpacing: 0.5,
    }}>
      {grade}
    </span>
  )
}

// ─── SIGNAL PILL ─────────────────────────────────────────────────────────────
export function SignalPill({ sig }) {
  const isNeutral = sig.dir === 'NEUTRAL'
  const c = isNeutral ? '#aaa' : sig.dir === 'LONG' ? C.long : C.short
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 8px',
      background: `${c}10`, border: `1px solid ${c}30`,
      borderRadius: 4, whiteSpace: 'nowrap',
    }}>
      <span style={{ color: c, fontSize: 10, fontWeight: 700 }}>
        {isNeutral ? '◆' : sig.dir === 'LONG' ? '▲' : '▼'} {isNeutral ? 'WATCH' : sig.dir}
      </span>
      <span style={{ fontSize: 10, color: C.textDim, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sig.pattern || sig.reason}
      </span>
      <GradeBadge grade={sig.grade} />
    </div>
  )
}

// ─── MTF BADGE ───────────────────────────────────────────────────────────────
export function MTFBadge({ score }) {
  const c = MTF_COLORS[score] || C.textFaint
  const l = MTF_LABELS[score] || '—'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: `${c}18`, color: c, border: `1px solid ${c}33`,
    }}>{l}</span>
  )
}

// ─── ALERT CARD ───────────────────────────────────────────────────────────────
export function AlertCard({ alert, isNew }) {
  const isLong    = alert.dir === 'LONG'
  const isNeutral = alert.dir === 'NEUTRAL'
  const c         = isNeutral ? '#aaa' : isLong ? C.long : C.short
  const age       = Math.max(0, Math.floor((Date.now() - alert.ts) / 1000))
  const ageStr    = age < 60 ? `${age}s` : `${Math.floor(age/60)}m`

  const srcColor  = alert.source === 'ICT' ? C.gold
    : alert.source === 'VOLUME_PROFILE' ? C.blue
    : alert.source === 'MARKET_PROFILE' ? C.purple
    : C.teal

  return (
    <div style={{
      padding: '14px 18px',
      borderLeft: `3px solid ${c}`,
      borderBottom: `1px solid ${C.border}`,
      background: isNew ? `${c}08` : 'transparent',
      animation: isNew ? 'slideIn 0.35s ease' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: c, fontWeight: 800, fontSize: 15, fontFamily: 'monospace', letterSpacing: 1 }}>
            {isNeutral ? '◆' : isLong ? '▲' : '▼'} {alert.sym}
          </span>
          <span style={{ fontSize: 9, color: C.textFaint, padding: '2px 6px',
            border: `1px solid ${C.border}`, borderRadius: 3 }}>{alert.market}</span>
          <GradeBadge grade={alert.grade} />
          <span style={{ fontSize: 10, color: srcColor, padding: '1px 6px',
            background: `${srcColor}12`, border: `1px solid ${srcColor}28`, borderRadius: 3 }}>
            {alert.source || 'CLASSIC'}
          </span>
          {alert.killZone && (
            <span style={{ fontSize: 10, color: C.blue }}>{alert.killZone}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: C.textFaint, fontFamily: 'monospace' }}>{ageStr} ago</span>
      </div>

      {/* Reason */}
      <div style={{ fontSize: 12, color: C.text, marginBottom: 10, fontWeight: 500, opacity: 0.85 }}>
        {alert.reason}
      </div>

      {/* Price grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
        {[['ENTRY', `$${fmt(alert.price)}`, C.text],
          ['STOP',   `$${fmt(alert.stop)}`,   C.short],
          ['TARGET', `$${fmt(alert.target)}`,  C.long],
          ['R:R',    `${alert.rr}R`,           C.gold],
        ].map(([l, v, col]) => (
          <div key={l} style={{ background: C.surface, borderRadius: 4, padding: '6px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color: C.textFaint, letterSpacing: 1, marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 12, color: col, fontFamily: 'monospace', fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Sizing */}
      {alert.riskDollar && (
        <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.textDim, marginBottom: 8 }}>
          <span>Risk <span style={{ color: C.short, fontWeight: 600 }}>${alert.riskDollar}</span></span>
          <span>Stop <span style={{ color: C.text }}>{alert.stopPctLabel}</span></span>
          <span>Size <span style={{ color: C.text }}>{alert.positionSize} units</span></span>
        </div>
      )}

      {/* Notes */}
      <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>
        🛑 {alert.stopNote}&nbsp;·&nbsp;🎯 {alert.targetNote}
      </div>
      <div style={{ fontSize: 10, color: C.textFaint, fontStyle: 'italic',
        borderTop: `1px solid ${C.border}`, paddingTop: 8, lineHeight: 1.6 }}>
        📖 {alert.rule}
      </div>
    </div>
  )
}

// ─── DATA SOURCE BADGE ────────────────────────────────────────────────────────
export function DataBadge({ isLive, dataMode }) {
  // LIVE = Massive.com  → teal
  // YAHOO+SIM = Yahoo futures + sim stocks  → purple (real data, just delayed)
  // SIM = full simulation  → orange
  const c = isLive
    ? C.teal
    : dataMode === 'YAHOO+SIM'
      ? '#a78bfa'   // soft purple — real but delayed
      : '#ffaa44'   // orange — full sim

  const label = isLive
    ? '● LIVE'
    : dataMode === 'YAHOO+SIM'
      ? '◑ YAHOO'   // half-filled = partially live
      : '○ SIM'

  const tip = isLive
    ? 'Real-time via Massive.com'
    : dataMode === 'YAHOO+SIM'
      ? 'Futures: Yahoo Finance (~15 min delayed) · Stocks: Simulation · Crypto: Live'
      : 'Full simulation — add Massive.com key for live data'

  return (
    <div title={tip} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      background: `${c}12`, border: `1px solid ${c}40`, borderRadius: 4,
      cursor: 'default',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c,
        animation: isLive || dataMode === 'YAHOO+SIM' ? 'pulse 1.5s infinite' : 'none',
        display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: 1 }}>
        {label}
      </span>
    </div>
  )
}

// ─── TIMEFRAME SELECTOR ───────────────────────────────────────────────────────
export const TIMEFRAMES = [
  { label: '1M',  minutes: 1,  desc: 'Ultra scalp' },
  { label: '2M',  minutes: 2,  desc: 'Micro scalp' },
  { label: '3M',  minutes: 3,  desc: 'Fast scalp' },
  { label: '5M',  minutes: 5,  desc: 'Scalp' },
  { label: '15M', minutes: 15, desc: 'Intraday' },
  { label: '30M', minutes: 30, desc: 'Swing entry' },
]

export function TFSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: C.textFaint, marginRight: 2, letterSpacing: 1 }}>TF</span>
      {TIMEFRAMES.map(tf => (
        <button key={tf.label} onClick={() => onChange(tf)}
          title={tf.desc}
          style={{
            padding: '4px 9px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            borderRadius: 4, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
            background: value.label === tf.label ? `${C.teal}20` : 'transparent',
            border: `1px solid ${value.label === tf.label ? C.teal : C.border}`,
            color: value.label === tf.label ? C.teal : C.textDim,
            transition: 'all 0.12s',
          }}>
          {tf.label}
        </button>
      ))}
    </div>
  )
}

// ─── TRADINGVIEW CHART EMBED ──────────────────────────────────────────────────
// Maps our symbols to TradingView tickers
const TV_SYMBOLS = {
  ES: 'CME_MINI:ES1!', NQ: 'CME_MINI:NQ1!', CL: 'NYMEX:CL1!', GC: 'COMEX:GC1!',
  AAPL: 'NASDAQ:AAPL', TSLA: 'NASDAQ:TSLA', NVDA: 'NASDAQ:NVDA', MSFT: 'NASDAQ:MSFT',
  AMD: 'NASDAQ:AMD', SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ', META: 'NASDAQ:META',
  BTC: 'BINANCE:BTCUSDT', ETH: 'BINANCE:ETHUSDT', SOL: 'BINANCE:SOLUSDT', BNB: 'BINANCE:BNBUSDT',
}

export function TVChart({ sym, tf }) {
  const ticker   = TV_SYMBOLS[sym] || sym
  const interval = tf?.minutes >= 30 ? '30' : tf?.minutes >= 15 ? '15' : tf?.minutes >= 5 ? '5' : tf?.minutes >= 3 ? '3' : tf?.minutes >= 2 ? '2' : '1'
  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tv_${sym}&symbol=${encodeURIComponent(ticker)}&interval=${interval}&hidesidetoolbar=1&hidetoptoolbar=0&symboledit=1&saveimage=0&toolbarbg=0d0d1f&studies=[]&theme=dark&style=1&timezone=America%2FNew_York&withdateranges=1&showpopupbutton=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=apex`
  return (
    <div style={{ width: '100%', height: 420, borderRadius: 6, overflow: 'hidden',
      border: `1px solid ${C.border}`, background: C.surface, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 14, zIndex: 2,
        fontSize: 11, color: C.textDim, fontFamily: 'monospace', letterSpacing: 1 }}>
        {sym} · {tf?.label} · TRADINGVIEW
      </div>
      <iframe
        key={`${sym}-${interval}`}
        src={src}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allowFullScreen
        title={`${sym} chart`}
      />
    </div>
  )
}

// ─── SECTION LABEL ───────────────────────────────────────────────────────────
export function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 9, color: C.textFaint, letterSpacing: 2,
      fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

// ─── STAT BOX ────────────────────────────────────────────────────────────────
export function StatBox({ label, value, color, sub }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`,
      borderTop: `2px solid ${color || C.border}`,
      borderRadius: 4, padding: '10px 14px' }}>
      <div style={{ fontSize: 9, color: C.textFaint, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, color: color || C.text, fontFamily: 'monospace', fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ─── SKELETON ROW ─────────────────────────────────────────────────────────────
// Shown while market data loads — prevents empty table flash on first paint
export function SkeletonRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '130px 50px 80px 106px 72px 62px 80px 86px 72px 80px 1fr',
      padding: '10px 18px',
      borderBottom: `1px solid ${C.border}`,
      alignItems: 'center',
      gap: 0,
    }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.9; }
          100% { opacity: 0.4; }
        }
        .skel { animation: shimmer 1.4s ease-in-out infinite; background: #1a1a30; border-radius: 3px; }
      `}</style>
      {[90, 30, 70, 80, 50, 40, 60, 60, 40, 60, 120].map((w, i) => (
        <div key={i} className="skel" style={{ height: 10, width: w, borderRadius: 3 }} />
      ))}
    </div>
  )
}

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────
// Corner pop-up for A+ alerts when user is on a different tab
export function Toast({ msg, type }) {
  const borderColor = type === 'ap' ? C.gold : type === 'long' ? C.long : type === 'short' ? C.short : C.teal
  return (
    <div style={{
      pointerEvents: 'auto',
      padding: '10px 14px',
      background: C.surface,
      border: `1px solid ${borderColor}55`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 5,
      fontSize: 11,
      color: C.text,
      maxWidth: 300,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      animation: 'slideInRight 0.25s ease',
      lineHeight: 1.5,
    }}>
      {type === 'ap' && <span style={{ color: C.gold, fontWeight: 700, marginRight: 6 }}>A+</span>}
      {msg}
    </div>
  )
}

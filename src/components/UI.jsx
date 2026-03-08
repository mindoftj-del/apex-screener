import { fmt, fmtPct } from '../engine/technicals.js'
import { MTF_COLORS, MTF_LABELS } from '../engine/symbols.js'

// ─── MINI CANDLESTICK CHART ───────────────────────────────────────────────────
export function MiniChart({ candles, width = 80, height = 28 }) {
  if (!candles || candles.length < 2) return <div style={{ width, height }} />
  const recent = candles.slice(-10)
  const maxH   = Math.max(...recent.map(c => c.high))
  const minL   = Math.min(...recent.map(c => c.low))
  const range  = maxH - minL || 1
  const cw     = width / recent.length
  const scaleY = v => height - ((v - minL) / range) * height

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {recent.map((c, i) => {
        const x      = i * cw + cw * 0.15
        const bw     = cw * 0.7
        const yHigh  = scaleY(c.high)
        const yLow   = scaleY(c.low)
        const yOpen  = scaleY(c.open)
        const yClose = scaleY(c.close)
        const col    = c.close >= c.open ? '#00e5a0' : '#ff3b5c'
        return (
          <g key={i}>
            <line x1={x + bw / 2} y1={yHigh} x2={x + bw / 2} y2={yLow}
              stroke={col} strokeWidth={0.8} opacity={0.5} />
            <rect x={x} y={Math.min(yOpen, yClose)} width={bw}
              height={Math.max(1, Math.abs(yOpen - yClose))}
              fill={col} opacity={0.9} />
          </g>
        )
      })}
    </svg>
  )
}

// ─── RSI BAR ─────────────────────────────────────────────────────────────────
export function RSIBar({ value }) {
  const col = value > 70 ? '#ff3b5c' : value < 30 ? '#00e5a0' : '#5566aa'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 54, height: 3, background: '#0e0e1e', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '30%', width: 1, height: '100%', background: '#222' }} />
        <div style={{ position: 'absolute', left: '70%', width: 1, height: '100%', background: '#222' }} />
        <div style={{ position: 'absolute', left: 0, width: `${value}%`, height: '100%', background: col, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 10, color: col, fontFamily: 'monospace', minWidth: 24 }}>{value.toFixed(0)}</span>
    </div>
  )
}

// ─── GRADE BADGE ─────────────────────────────────────────────────────────────
export function GradeBadge({ grade }) {
  const colors = { 'A+': '#ffd700', A: '#00e5a0', B: '#60a0ff' }
  const c = colors[grade] || '#888'
  return (
    <span style={{ padding: '1px 6px', fontSize: 9, fontWeight: 800, fontFamily: 'monospace',
      background: `${c}18`, border: `1px solid ${c}44`, color: c, borderRadius: 3, whiteSpace: 'nowrap' }}>
      {grade}
    </span>
  )
}

// ─── SIGNAL PILL ─────────────────────────────────────────────────────────────
export function SignalPill({ sig }) {
  const isNeutral = sig.dir === 'NEUTRAL'
  const c = isNeutral ? '#aaa' : sig.dir === 'LONG' ? '#00e5a0' : '#ff3b5c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px',
      background: `${c}0e`, border: `1px solid ${c}28`, borderRadius: 3, whiteSpace: 'nowrap' }}>
      <span style={{ color: c, fontSize: 9, fontWeight: 700 }}>
        {isNeutral ? '◆' : sig.dir === 'LONG' ? '▲' : '▼'} {isNeutral ? 'WATCH' : sig.dir}
      </span>
      <span style={{ fontSize: 9, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sig.reason}
      </span>
      <GradeBadge grade={sig.grade} />
    </div>
  )
}

// ─── MTF BADGE ───────────────────────────────────────────────────────────────
export function MTFBadge({ score }) {
  const c = MTF_COLORS[score] || '#2a2a3e'
  const l = MTF_LABELS[score] || '—'
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
      background: `${c}18`, color: c, border: `1px solid ${c}33` }}>{l}</span>
  )
}

// ─── ALERT CARD ───────────────────────────────────────────────────────────────
export function AlertCard({ alert, isNew }) {
  const isLong    = alert.dir === 'LONG'
  const isNeutral = alert.dir === 'NEUTRAL'
  const c         = isNeutral ? '#aaa' : isLong ? '#00e5a0' : '#ff3b5c'
  const age       = Math.max(0, Math.floor((Date.now() - alert.ts) / 1000))

  return (
    <div style={{ padding: '12px 16px', borderLeft: `3px solid ${c}`,
      borderBottom: '1px solid #0d0d1e',
      background: isNew ? `${c}07` : 'transparent',
      animation: isNew ? 'slideIn 0.35s ease' : 'none' }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <span style={{ color: c, fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>
            {isNeutral ? '◆' : isLong ? '▲' : '▼'} {alert.sym}
          </span>
          <span style={{ fontSize: 8, color: '#2a2a3e', padding: '1px 5px',
            border: '1px solid #1a1a2a', borderRadius: 2 }}>{alert.market}</span>
          <GradeBadge grade={alert.grade} />
          <span style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>{alert.entryLabel}</span>
        </div>
        <span style={{ fontSize: 9, color: '#282838', fontFamily: 'monospace' }}>{age}s ago</span>
      </div>

      {/* Reason */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 9 }}>{alert.reason}</div>

      {/* Price levels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 8 }}>
        {[['ENTRY', `$${fmt(alert.price)}`, '#ccd'],
          ['STOP',   `$${fmt(alert.stop)}`,  '#ff3b5c'],
          ['TARGET', `$${fmt(alert.target)}`, '#00e5a0'],
          ['R:R',    `${alert.rr}R`,          '#ffd700'],
        ].map(([l, v, col]) => (
          <div key={l} style={{ background: '#08081a', borderRadius: 3, padding: '5px 8px' }}>
            <div style={{ fontSize: 7, color: '#222232', letterSpacing: 1, marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 11, color: col, fontFamily: 'monospace', fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Risk sizing */}
      {alert.riskDollar && (
        <div style={{ display: 'flex', gap: 14, fontSize: 9, color: '#333', marginBottom: 7 }}>
          <span>Risk <span style={{ color: '#ff3b5c' }}>${alert.riskDollar}</span></span>
          <span>Stop <span style={{ color: '#777' }}>{alert.stopPctLabel}</span></span>
          <span>Size <span style={{ color: '#aaa' }}>{alert.positionSize} units</span></span>
        </div>
      )}

      {/* Stop & target notes */}
      <div style={{ fontSize: 9, color: '#2a2a3e', marginBottom: 6 }}>
        🛑 {alert.stopNote} &nbsp;·&nbsp; 🎯 {alert.targetNote}
      </div>

      {/* Book rule */}
      <div style={{ fontSize: 9, color: '#1e1e2e', fontStyle: 'italic',
        borderTop: '1px solid #0d0d1a', paddingTop: 7, lineHeight: 1.6 }}>
        📖 {alert.rule}
      </div>
    </div>
  )
}

// ─── DATA SOURCE BADGE ────────────────────────────────────────────────────────
export function DataBadge({ isLive, dataMode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px',
      background: isLive ? 'rgba(74,240,196,0.08)' : 'rgba(255,170,68,0.08)',
      border: `1px solid ${isLive ? '#4af0c444' : '#ffaa4444'}`,
      borderRadius: 3 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isLive ? '#4af0c4' : '#ffaa44',
        animation: 'pulse 1.5s infinite',
        display: 'inline-block',
      }} />
      <span style={{ fontSize: 9, fontWeight: 700, color: isLive ? '#4af0c4' : '#ffaa44', letterSpacing: 1 }}>
        {dataMode}
      </span>
    </div>
  )
}

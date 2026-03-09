import { Component } from 'react'

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
// Catches any render crash anywhere in the tree.
// Shows a clean recovery UI instead of a white screen.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch() {
    // intentionally silent — no console.error in production
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const bg      = '#070711'
    const surface = '#0d0d1f'
    const border  = '#1e1e38'
    const teal    = '#4af0c4'
    const textDim = '#6b6b9a'

    return (
      <div style={{
        minHeight: '100vh', background: bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Share Tech Mono', monospace", padding: 40,
      }}>
        <div style={{
          maxWidth: 480, width: '100%', background: surface,
          border: `1px solid ${border}`, borderTop: `3px solid ${teal}`,
          borderRadius: 8, padding: '32px 36px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 18, color: '#f0f0ff', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
            APEX PRO — Unexpected Error
          </div>
          <div style={{ fontSize: 12, color: textDim, marginBottom: 24, lineHeight: 1.7 }}>
            Something crashed in the UI. Your journal data is safe.
            <br />Click below to reload and continue scanning.
          </div>
          {this.state.error?.message && (
            <div style={{
              fontSize: 10, color: '#ff3b5c', background: '#ff3b5c0a',
              border: '1px solid #ff3b5c22', borderRadius: 4,
              padding: '8px 12px', marginBottom: 20,
              textAlign: 'left', fontFamily: 'monospace', wordBreak: 'break-all',
            }}>
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', fontSize: 12, fontWeight: 700,
              letterSpacing: 1, borderRadius: 4, cursor: 'pointer',
              background: `${teal}18`, border: `1px solid ${teal}`,
              color: teal, fontFamily: 'inherit',
            }}
          >
            ↺ RELOAD APP
          </button>
        </div>
      </div>
    )
  }
}

// ─── SYMBOL ERROR BOUNDARY ────────────────────────────────────────────────────
// Lighter version — wraps individual rows so one bad symbol can't crash the screener
export class RowBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) return null // silently hide broken rows
    return this.props.children
  }
}

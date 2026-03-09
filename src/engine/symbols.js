// ─── SYMBOL UNIVERSE ──────────────────────────────────────────────────────────
// Base prices are current as of March 2026.
// These are FALLBACK seeds only — actual prices come from Yahoo Finance / Binance.

export const FUTURES_CONFIG = [
  { sym: 'ES',  name: 'S&P 500',    base: 5680,  tickSize: 0.25, pointVal: 50,   market: 'FUT',    color: '#4af0c4', polygonTicker: 'ES' },
  { sym: 'NQ',  name: 'Nasdaq 100', base: 19900, tickSize: 0.25, pointVal: 20,   market: 'FUT',    color: '#4af0c4', polygonTicker: 'NQ' },
  { sym: 'CL',  name: 'Crude Oil',  base: 68.0,  tickSize: 0.01, pointVal: 1000, market: 'FUT',    color: '#ffaa44', polygonTicker: 'CL' },
  { sym: 'GC',  name: 'Gold',       base: 2910,  tickSize: 0.10, pointVal: 100,  market: 'FUT',    color: '#ffd700', polygonTicker: 'GC' },
]

export const STOCKS_CONFIG = [
  { sym: 'AAPL', name: 'Apple',     base: 258,  market: 'US', color: '#60a0ff' },
  { sym: 'TSLA', name: 'Tesla',     base: 397,  market: 'US', color: '#60a0ff' },
  { sym: 'NVDA', name: 'NVIDIA',    base: 178,  market: 'US', color: '#60a0ff' },
  { sym: 'MSFT', name: 'Microsoft', base: 409,  market: 'US', color: '#60a0ff' },
  { sym: 'AMD',  name: 'AMD',       base: 118,  market: 'US', color: '#60a0ff' },
  { sym: 'SPY',  name: 'SPY ETF',   base: 672,  market: 'US', color: '#60a0ff' },
  { sym: 'QQQ',  name: 'QQQ ETF',   base: 600,  market: 'US', color: '#60a0ff' },
  { sym: 'META', name: 'Meta',      base: 645,  market: 'US', color: '#60a0ff' },
]

export const CRYPTO_CONFIG = [
  { sym: 'BTC',  name: 'Bitcoin',  base: 87000, market: 'CRYPTO', color: '#f7931a', binancePair: 'btcusdt' },
  { sym: 'ETH',  name: 'Ethereum', base: 2200,  market: 'CRYPTO', color: '#627eea', binancePair: 'ethusdt' },
  { sym: 'SOL',  name: 'Solana',   base: 140,   market: 'CRYPTO', color: '#9945ff', binancePair: 'solusdt' },
  { sym: 'BNB',  name: 'BNB',      base: 620,   market: 'CRYPTO', color: '#f3ba2f', binancePair: 'bnbusdt' },
]

export const ALL_SYMBOLS = [
  ...FUTURES_CONFIG,
  ...STOCKS_CONFIG,
  ...CRYPTO_CONFIG,
]

export const MARKET_COLORS = { FUT: '#4af0c4', US: '#60a0ff', CRYPTO: '#f7931a' }
export const TREND_COLORS  = { UPTREND: '#00e5a0', DOWNTREND: '#ff3b5c', RANGING: '#4a4a6a' }
export const MTF_LABELS    = { 0: 'WEAK', 1: 'MOD', 2: 'STRONG', 3: 'MAX' }
export const MTF_COLORS    = { 0: '#2a2a3e', 1: '#555', 2: '#ffaa44', 3: '#ffd700' }

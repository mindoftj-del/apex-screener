# ⚡ APEX PRO — Day Trading Screener

**5-Book Technical Engine** · ES · NQ · CL · GC · US Stocks · Crypto
Live data via Polygon.io + Binance WebSocket · Deploy to Vercel in minutes

---

## 🚀 QUICK START — Deploy to Vercel

### Step 1 — Get Your Polygon.io API Key

1. Go to **https://polygon.io** and click **Get Free API Key**
2. Create an account (email + password)
3. **Free tier** = 5 REST calls/min (no WebSocket). Good for testing.
4. **Starter plan ($29/mo)** = Unlimited REST + WebSocket real-time streaming.
   This is what you need for live auto-ping alerts on stocks.
5. Copy your API key from the dashboard — looks like: `abc123XYZ...`

> **Crypto (BTC/ETH/SOL/BNB) is FREE** — Binance WebSocket requires no API key.
> You can run crypto live immediately with zero cost.

> **Futures (ES/NQ/CL/GC)**: Polygon requires a Futures data add-on (~$79/mo).
> Without it, futures run in **SIMULATION mode** (realistic but not real prices).
> Alternative: Use NinjaTrader or Sierra Chart for real futures data and integrate separately.

---

### Step 2 — Deploy to Vercel

**Option A: GitHub → Vercel (Recommended)**

```bash
# 1. Install dependencies locally first (to verify it works)
npm install
npm run dev   # Opens at http://localhost:3000

# 2. Push to GitHub
git init
git add .
git commit -m "APEX PRO screener initial commit"
git remote add origin https://github.com/YOUR_USERNAME/apex-screener.git
git push -u origin main

# 3. Go to https://vercel.com
#    → "Add New Project" → Import your GitHub repo
#    → Framework: Vite (auto-detected)
#    → Add Environment Variable:
#        Name:  VITE_POLYGON_API_KEY
#        Value: your_actual_polygon_api_key
#    → Click Deploy
```

**Option B: Vercel CLI (Fastest)**

```bash
npm install -g vercel
npm install

# Deploy (follow prompts)
vercel

# Add your API key
vercel env add VITE_POLYGON_API_KEY
# Paste your Polygon key when prompted

# Redeploy with the env var
vercel --prod
```

---

### Step 3 — Local Development

```bash
# Copy the env template
cp .env.example .env.local

# Edit .env.local and add your key:
# VITE_POLYGON_API_KEY=your_actual_key_here

# Start dev server
npm install
npm run dev
# → Opens at http://localhost:3000
```

---

## 📡 Data Sources

| Market | Source | Cost | Stream Type |
|--------|--------|------|-------------|
| US Stocks (AAPL, TSLA, NVDA...) | Polygon.io | $29/mo Starter | WebSocket + REST |
| Crypto (BTC, ETH, SOL, BNB) | Binance Public | **Free** | WebSocket |
| Futures (ES, NQ, CL, GC) | Polygon.io | $79/mo add-on | WebSocket + REST |
| All markets (no key) | **Simulation** | **Free** | Internal engine |

**Without a Polygon key**: App runs in full simulation mode — all signals, patterns,
and alerts work perfectly with realistic simulated price action. Great for strategy testing.

---

## 🎯 Signal Engine — What Gets Detected

### A+ Grade Setups (Highest Conviction)
- **Bullish/Bearish Engulfing @ VWAP** — Ravenshaw + Shannon + Thornton
- **Break of Structure + Volume** — Shannon MTF + Thornton Type 1
- **Morning Star / Evening Star** — Ravenshaw 3-candle reversals

### A Grade Setups
- **Hammer / Dragonfly at Support** — Ravenshaw wick patterns
- **Shooting Star / Gravestone at Resistance**
- **VWAP 2-Standard Deviation Extreme** — Shannon bands
- **Tweezer Tops/Bottoms** — Institutional level defense
- **Bull/Bear Marubozu** — Pure momentum candles

### B Grade Setups
- **8 EMA Pullback Continuation** — Thornton Type 3
- **Doji @ VWAP** — Indecision watch signal

---

## ⚖️ Risk Management

Set your account size and risk % in the **RISK tab**. The app automatically calculates:
- Max dollar risk per trade
- Maximum contracts per futures instrument (ES/NQ/CL/GC)
- Stop percentage from entry
- Position size in units

**Futures contract specs pre-loaded:**
- ES: $50/point, 0.25 tick, suggested 4-tick stop
- NQ: $20/point, 0.25 tick, suggested 8-tick stop
- CL: $1000/point, $0.01 tick, suggested 20-tick stop
- GC: $100/point, $0.10 tick, suggested 10-tick stop

---

## 📁 Project Structure

```
apex-screener/
├── src/
│   ├── engine/
│   │   ├── symbols.js        ← All symbol configs & constants
│   │   └── technicals.js     ← Candlestick patterns, indicators, signal engine
│   ├── hooks/
│   │   ├── usePolygon.js     ← Polygon.io REST + WebSocket
│   │   ├── useBinance.js     ← Binance WebSocket (free crypto)
│   │   ├── useSimulation.js  ← Simulation fallback
│   │   └── useMarketData.js  ← Master data router
│   ├── components/
│   │   └── UI.jsx            ← Reusable components
│   ├── App.jsx               ← Main application
│   └── main.jsx              ← React entry point
├── .env.example              ← Copy to .env.local
├── vercel.json               ← Vercel deployment config
├── vite.config.js            ← Vite build config
└── package.json
```

---

## 🔮 Planned Next Steps

- [ ] Connect real futures data (Tradovate API / NinjaTrader bridge)
- [ ] Add TradingView chart embed per symbol
- [ ] Telegram / Discord alert webhook
- [ ] Trade journal with P&L tracking
- [ ] Backtesting mode against historical data

---

## ⚠️ Disclaimer

This tool is for educational and informational purposes only.
It is NOT financial advice. All trading involves risk.
Past performance of any pattern or signal does not guarantee future results.
Always use proper risk management on every trade.

---

*Built on: Trading in the Zone · Best Loser Wins · The Disciplined Trader ·
The Candlestick Trading Bible · Technical Analysis Using Multiple Timeframes ·
The Ultimate Day Trading Playbook*

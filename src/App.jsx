import { useState, useEffect, useRef, useCallback } from 'react'
import { useMarketData } from './hooks/useMarketData.js'
import { detectSignals, fmt, fmtPct } from './engine/technicals.js'
import { detectICTSignals, getKillZone } from './engine/ict.js'
import { ALL_SYMBOLS, FUTURES_CONFIG, MARKET_COLORS, TREND_COLORS } from './engine/symbols.js'
import {
  MiniChart, RSIBar, GradeBadge, SignalPill, MTFBadge, AlertCard, DataBadge,
  TFSelector, TIMEFRAMES, TVChart, SectionLabel, StatBox, C,
} from './components/UI.jsx'

// ─── TIMEFRAME SIGNAL TUNING ──────────────────────────────────────────────────
// Lower TF = tighter stops, faster targets, higher vol threshold
function tfParams(tf) {
  const m = tf.minutes
  return {
    volThreshold:  m <= 2 ? 2.0 : m <= 5 ? 1.5 : m <= 15 ? 1.3 : 1.1,
    targetMult:    m <= 2 ? 0.6 : m <= 5 ? 1.0 : m <= 15 ? 1.5 : 2.0,
    stopTightness: m <= 2 ? 0.9985 : m <= 5 ? 0.999 : m <= 15 ? 0.998 : 0.996,
    rsiRange:      m <= 5 ? [35, 65] : [30, 70],
    candlesNeeded: m <= 2 ? 6 : m <= 5 ? 8 : 12,
    label:         tf.label,
  }
}

// ─── PLAYBOOK ─────────────────────────────────────────────────────────────────
const PLAYBOOK = [
  { grade:'A+', color:C.gold, title:'Liquidity Sweep + FVG', books:['ICT'],
    long:'Price sweeps sell-side liquidity (wicks below prior low, closes back above) · Bullish FVG nearby · Vol >1.5× · NY Kill Zone',
    short:'Price sweeps buy-side liquidity (spikes above prior high, closes back below) · Bearish FVG nearby',
    entry:'Enter on close of sweep candle OR on FVG midpoint retest (CE). Stop beyond sweep wick.',
    stop:'LONG: Below sweep wick low · SHORT: Above sweep wick high',
    target:'50% at 1.5R · BE stop · Trail to next liquidity pool', rr:'3–5R',
    mind:'ICT: You are not trading support — you are trading the TRAP. Enter after smart money fills their orders.' },
  { grade:'A+', color:C.gold, title:'Order Block Retest', books:['ICT'],
    long:'Last bearish candle before strong bullish impulse · Price retests range · Vol >1.2× · MTF aligned',
    short:'Last bullish candle before strong bearish impulse · Price retests range · Vol >1.2×',
    entry:'Limit at OB midpoint (mean threshold). Institutions reprice here to fill remaining orders.',
    stop:'LONG: Below OB low · SHORT: Above OB high',
    target:'Next FVG or opposing liquidity', rr:'2.5–4R',
    mind:'ICT: The OB is WHERE institutions placed their original trade. You enter with them.' },
  { grade:'A+', color:C.gold, title:'SMT Divergence (NQ/ES)', books:['ICT'],
    long:'NQ makes new low but ES holds · NY Open Kill Zone only',
    short:'NQ makes new high but ES fails to confirm',
    entry:'After SMT: find sweep + FVG on 1–2min for entry trigger.',
    stop:'Beyond the sweep wick of the diverging instrument',
    target:'Opposite liquidity pool (prior session H/L)', rr:'4–8R',
    mind:'ICT: NQ/ES divergence = clearest institutional footprint. Highest conviction setup.' },
  { grade:'A+', color:C.gold, title:'Bull/Bear Engulf @ VWAP', books:['Candlestick Bible','MTF Analysis'],
    long:'Bull engulf > prior candle · At/near VWAP ±0.5% · Vol >1.8× · MTF ≥2',
    short:'Bear engulf > prior candle · At/near VWAP ±0.5% · Vol >1.8× · MTF ≥2',
    entry:'Wait for candle CLOSE. Enter next open or limit at body midpoint.',
    stop:'LONG: Below engulf low · SHORT: Above engulf high',
    target:'50% at 1.5R · Runner to 3R', rr:'2.7–3.5R',
    mind:'Ravenshaw: Engulf at VWAP = institutional entry. Volume confirms participation.' },
  { grade:'A', color:C.long, title:'FVG / IFVG Retest', books:['ICT'],
    long:'Bullish FVG · Price retraces into gap · Enter at CE (midpoint)',
    short:'Bearish FVG · Price retests from below · Enter at CE',
    entry:'Limit at FVG midpoint. IFVG = higher conviction than standard FVG.',
    stop:'Beyond far FVG edge. Fully filled = voided.',
    target:'Beyond opposite FVG edge for continuation', rr:'2–3R',
    mind:'ICT: FVG = the market moved too fast and left an efficiency void. It will return.' },
  { grade:'A', color:C.long, title:'POC Mean Reversion', books:['Volume Profile'],
    long:'Price >0.8% below POC · Vol >1.2× · No strong downtrend',
    short:'Price >0.8% above POC · Vol >1.2× · No strong uptrend',
    entry:'Enter in direction of POC. POC is the magnetic center.',
    stop:'±0.6% emergency stop', target:'Full mean reversion to POC', rr:'2–3.5R',
    mind:'VP: POC is true fair value. 70% of volume traded there. Extremes snap back.' },
  { grade:'A', color:C.long, title:'VAH/VAL + 80% Rule', books:['Volume Profile','Market Profile'],
    long:'Price touches VAL · RSI <40 · Re-entry into VA → 80% fills to VAH',
    short:'Price touches VAH · RSI >60 · Range-bound session',
    entry:'At VAL for long / VAH for short. Confirm with rejection candle.',
    stop:'LONG: Below VAL · SHORT: Above VAH',
    target:'LONG: POC → VAH · SHORT: POC → VAL', rr:'2–4R',
    mind:'Market Profile 80% Rule: Re-entry into value area has 80% probability of filling.' },
  { grade:'A', color:C.long, title:'IB Breakout (NQ/ES)', books:['Market Profile'],
    long:'Price breaks above IB High · Vol >1.5× · NY session',
    short:'Price breaks below IB Low · Vol >1.5× · Clean structure',
    entry:'Enter on CLOSE of breakout candle. Stop inside IB.',
    stop:'Just inside the IB', target:'IB ± IB Range (measured move)', rr:'2.5–4R',
    mind:'Market Profile: When institutions commit beyond the IB they show their hand.' },
  { grade:'A', color:C.long, title:'VWAP 2SD Extreme', books:['MTF Analysis'],
    long:'Price >2.2% below VWAP · RSI <35 · Vol >1.4×',
    short:'Price >2.2% above VWAP · RSI >65 · Vol >1.4×',
    entry:'Market order next candle open. Best on ES/NQ NY session.',
    stop:'±0.6% emergency stop', target:'Full reversion to VWAP', rr:'2–3.5R',
    mind:'Shannon: At 2SD extremes the rubber band is maximally stretched.' },
  { grade:'B', color:C.blue, title:'8 EMA Pullback', books:['MTF Analysis'],
    long:'Uptrend (HH+HL) · Price to 8 EMA ±0.3% · RSI 42–62',
    short:'Downtrend (LH+LL) · Price to 8 EMA ±0.3% · RSI 38–58',
    entry:'Thornton Type 3: Limit AT the 8 EMA.',
    stop:'3 ticks below EMA (futures) / 0.3% (stocks)',
    target:'Trail behind 8 EMA', rr:'1.5–2.5R',
    mind:'Thornton: You are joining an established trend cheaply. Not predicting.' },
]

function playBeep(dir, grade) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = dir==='LONG' ? (grade==='A+'?1046:880) : (grade==='A+'?523:440)
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.22, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start(); osc.stop(ctx.currentTime + 0.45)
  } catch {}
}

function KZBadge({ kz }) {
  if (!kz) return null
  return (
    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700,
      background: kz.active ? `${kz.color}18` : '#ffffff06',
      border: `1px solid ${kz.active ? kz.color+'44' : C.border}`,
      color: kz.active ? kz.color : C.textFaint,
      opacity: kz.quality==='AVOID' ? 0.5 : 1 }}>
      {kz.quality==='AVOID'?'⛔':kz.active?'🎯':'○'} {kz.name}
    </span>
  )
}

function VPRow({ vp, price }) {
  if (!vp) return null
  const c = price > vp.poc ? C.long : C.short
  return (
    <div style={{ display:'flex', gap:12, fontSize:10, flexWrap:'wrap', alignItems:'center' }}>
      {[['POC',vp.poc,vp.atPOC?C.gold:C.text],['VAH',vp.vah,vp.atVAH?C.short:C.textDim],['VAL',vp.val,vp.atVAL?C.long:C.textDim]].map(([l,v,col])=>(
        <span key={l}><span style={{color:C.textFaint}}>{l} </span><span style={{color:col,fontFamily:'monospace',fontWeight:600}}>${fmt(v)}</span></span>
      ))}
      <span style={{color:c,fontFamily:'monospace'}}>{vp.pocDev>0?'+':''}{vp.pocDev?.toFixed(2)}%</span>
      {vp.insideVA&&<span style={{color:C.blue,fontSize:9}}>IN VALUE</span>}
      {vp.aboveVA&&<span style={{color:C.gold,fontSize:9}}>ABOVE VA</span>}
      {vp.belowVA&&<span style={{color:C.short,fontSize:9}}>BELOW VA</span>}
    </div>
  )
}

function FVGRow({ fvgs }) {
  if (!fvgs||fvgs.length===0) return <span style={{fontSize:10,color:C.textFaint}}>No active FVGs</span>
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {fvgs.slice(0,4).map((f,i)=>{
        const c = f.inverted ? (f.dir==='BULL'?C.short:C.long) : (f.dir==='BULL'?C.long:C.short)
        return (
          <div key={i} style={{display:'flex',gap:7,alignItems:'center'}}>
            <span style={{fontSize:9,padding:'2px 6px',borderRadius:3,background:`${c}14`,border:`1px solid ${c}28`,color:c,fontWeight:700}}>
              {f.inverted?'IFVG':'FVG'} {f.dir}
            </span>
            <span style={{fontSize:10,color:C.textDim,fontFamily:'monospace'}}>${fmt(f.gapLow)} – ${fmt(f.gapHigh)}</span>
            <span style={{fontSize:9,color:C.textFaint}}>CE ${fmt(f.mid)}</span>
            {f.active&&<span style={{fontSize:9,color:C.gold,fontWeight:700}}>● ACTIVE</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [scanActive,  setScanActive]  = useState(true)
  const [tab,         setTab]         = useState('SCREENER')
  const [markets,     setMarkets]     = useState(['FUT','US','CRYPTO'])
  const [dirFilter,   setDirFilter]   = useState('ALL')
  const [gradeFilter, setGradeFilter] = useState('ALL')
  const [soundOn,     setSoundOn]     = useState(true)
  const [alerts,      setAlerts]      = useState([])
  const [riskPct,     setRiskPct]     = useState(1)
  const [accountSize, setAccountSize] = useState(50000)
  const [expandedSym, setExpandedSym] = useState(null)
  const [chartSym,    setChartSym]    = useState('NQ')
  const [tick,        setTick]        = useState(0)
  const [tf,          setTF]          = useState(TIMEFRAMES[3]) // default 5M

  // Journal state
  const [journal, setJournal]         = useState(() => {
    try { return JSON.parse(localStorage.getItem('apex_journal') || '[]') } catch { return [] }
  })
  const [journalForm, setJournalForm] = useState({ sym:'NQ', dir:'LONG', entry:'', stop:'', exit:'', contracts:'1', notes:'' })

  // Backtest state
  const [btRunning,  setBtRunning]   = useState(false)
  const [btResults,  setBtResults]   = useState(null)
  const [btSetup,    setBtSetup]     = useState('A+')
  const [btSym,      setBtSym]       = useState('NQ')

  const alertIdRef   = useRef(0)
  const lastFiredRef = useRef({})

  const { marketData, isLive, dataMode } = useMarketData(scanActive)
  const [killZone, setKillZone] = useState(()=>getKillZone())

  useEffect(()=>{ const id=setInterval(()=>setKillZone(getKillZone()),30000); return()=>clearInterval(id) },[])
  useEffect(()=>{ if(!scanActive)return; const id=setInterval(()=>setTick(t=>t+1),2500); return()=>clearInterval(id) },[scanActive])

  // Persist journal
  useEffect(()=>{ try{localStorage.setItem('apex_journal',JSON.stringify(journal))}catch{} },[journal])

  const tfP = tfParams(tf)

  // Alert pipeline
  useEffect(()=>{
    if(!scanActive||Object.keys(marketData).length===0) return
    const newAlerts=[]
    ALL_SYMBOLS.forEach(({sym,market})=>{
      if(!markets.includes(market)) return
      const d=marketData[sym]
      if(!d?.candles||d.candles.length<tfP.candlesNeeded) return
      const {signals:cs}=detectSignals({sym,market,candles:d.candles,price:d.price,vwap:d.vwap,rsi:d.rsi,volRatio:d.volRatio,ema8:d.ema8,structure:d.structure,riskPct,accountSize,tf:tfP})
      const peerSym=sym==='NQ'?'ES':sym==='ES'?'NQ':null
      const {ictSignals}=detectICTSignals({sym,market,candles:d.candles,price:d.price,vwap:d.vwap,rsi:d.rsi,volRatio:d.volRatio,structure:d.structure,riskPct,accountSize,peerCandles:peerSym?marketData[peerSym]?.candles:null,tf:tfP})
      ;[...cs,...ictSignals].forEach(sig=>{
        const key=`${sym}-${sig.dir}-${sig.grade}-${sig.pattern}`
        const last=lastFiredRef.current[key]||0
        const cd=sig.grade==='A+'?20000:sig.grade==='A'?14000:10000
        if(Date.now()-last<cd) return
        if(Math.random()>(sig.grade==='A+'?0.30:sig.grade==='A'?0.22:0.15)) return
        lastFiredRef.current[key]=Date.now()
        alertIdRef.current++
        newAlerts.push({id:alertIdRef.current,sym,market,ts:Date.now(),...sig})
        if(soundOn) playBeep(sig.dir,sig.grade)
      })
    })
    if(newAlerts.length>0) setAlerts(prev=>[...newAlerts,...prev].slice(0,150))
  },[tick,soundOn,riskPct,accountSize,markets,scanActive,tf])

  const toggleMarket=m=>setMarkets(p=>p.includes(m)?p.filter(x=>x!==m):[...p,m])

  const screenerRows=ALL_SYMBOLS.filter(({market})=>markets.includes(market)).map(({sym,market})=>{
    const d=marketData[sym]; if(!d?.candles) return null
    const cl=detectSignals({sym,market,candles:d.candles,price:d.price,vwap:d.vwap,rsi:d.rsi,volRatio:d.volRatio,ema8:d.ema8,structure:d.structure,riskPct,accountSize,tf:tfP})
    const peerSym=sym==='NQ'?'ES':sym==='ES'?'NQ':null
    const ict=detectICTSignals({sym,market,candles:d.candles,price:d.price,vwap:d.vwap,rsi:d.rsi,volRatio:d.volRatio,structure:d.structure,riskPct,accountSize,peerCandles:peerSym?marketData[peerSym]?.candles:null,tf:tfP})
    return {sym,market,d,signals:[...cl.signals,...ict.ictSignals],patterns:cl.patterns,entryType:cl.entryType,...ict}
  }).filter(Boolean)

  const displayRows=screenerRows.filter(r=>{
    if(dirFilter==='LONG')    return r.signals.some(s=>s.dir==='LONG')
    if(dirFilter==='SHORT')   return r.signals.some(s=>s.dir==='SHORT')
    if(dirFilter==='SIGNALS') return r.signals.length>0
    return true
  })
  const filteredAlerts=alerts.filter(a=>markets.includes(a.market)&&(dirFilter==='ALL'||a.dir===dirFilter)&&(gradeFilter==='ALL'||a.grade===gradeFilter))
  const recentAlerts=alerts.filter(a=>Date.now()-a.ts<60000)
  const longCount=recentAlerts.filter(a=>a.dir==='LONG').length
  const shortCount=recentAlerts.filter(a=>a.dir==='SHORT').length
  const futuresRiskCalc=FUTURES_CONFIG.map(f=>{
    const st={ES:4,NQ:8,CL:20,GC:10}[f.sym]||5
    const sd=st*f.pointVal*f.tickSize
    return{...f,stopTicks:st,stopDollar:sd,maxContracts:Math.max(0,Math.floor(accountSize*riskPct/100/sd))}
  })

  // Journal helpers
  const addTrade = () => {
    if(!journalForm.entry||!journalForm.exit) return
    const entry=parseFloat(journalForm.entry), exit=parseFloat(journalForm.exit)
    const stop=parseFloat(journalForm.stop)||0
    const contracts=parseFloat(journalForm.contracts)||1
    const cfg=FUTURES_CONFIG.find(f=>f.sym===journalForm.sym)
    const pointVal=cfg?.pointVal||1
    const pnl=journalForm.dir==='LONG' ? (exit-entry)*pointVal*contracts : (entry-exit)*pointVal*contracts
    const riskAmt=stop>0 ? Math.abs(entry-stop)*pointVal*contracts : 0
    const rr=riskAmt>0 ? Math.abs(pnl/riskAmt).toFixed(1) : '—'
    const trade={
      id:Date.now(),sym:journalForm.sym,dir:journalForm.dir,
      entry,stop,exit,contracts,pnl:pnl.toFixed(2),rr,
      notes:journalForm.notes,ts:new Date().toISOString().slice(0,16).replace('T',' '),
    }
    setJournal(p=>[trade,...p])
    setJournalForm(f=>({...f,entry:'',stop:'',exit:'',notes:''}))
  }
  const deleteTrade = id => setJournal(p=>p.filter(t=>t.id!==id))
  const jStats = {
    total: journal.length,
    wins:  journal.filter(t=>parseFloat(t.pnl)>0).length,
    pnl:   journal.reduce((s,t)=>s+parseFloat(t.pnl),0),
    bestR: journal.reduce((b,t)=>parseFloat(t.rr)>b?parseFloat(t.rr):b, 0),
  }
  const winRate = jStats.total>0 ? ((jStats.wins/jStats.total)*100).toFixed(0) : 0

  // Simple backtest
  const runBacktest = () => {
    setBtRunning(true)
    setTimeout(()=>{
      const d=marketData[btSym]
      if(!d?.candles||d.candles.length<20){ setBtRunning(false); return }
      const candles=d.candles
      const trades=[]
      for(let i=8;i<candles.length-1;i++){
        const slice=candles.slice(0,i+1)
        const {signals}=detectSignals({sym:btSym,market:'FUT',candles:slice,price:slice[i].close,vwap:d.vwap,rsi:d.rsi,volRatio:d.volRatio,ema8:d.ema8,structure:d.structure,riskPct,accountSize,tf:tfP})
        const {ictSignals}=detectICTSignals({sym:btSym,market:'FUT',candles:slice,price:slice[i].close,vwap:d.vwap,rsi:d.rsi,volRatio:d.volRatio,structure:d.structure,riskPct,accountSize,peerCandles:null,tf:tfP})
        const allSigs=[...signals,...ictSignals].filter(s=>btSetup==='ALL'||s.grade===btSetup)
        if(allSigs.length===0) continue
        const sig=allSigs[0]
        const next=candles[i+1]
        if(!next||!sig.stop||!sig.target) continue
        const entry=slice[i].close
        const hitTarget=sig.dir==='LONG' ? next.high>=sig.target : next.low<=sig.target
        const hitStop  =sig.dir==='LONG' ? next.low<=sig.stop   : next.high>=sig.stop
        const pnl=hitTarget&&!hitStop ? Math.abs(sig.target-entry) : -Math.abs(entry-sig.stop)
        const cfg=FUTURES_CONFIG.find(f=>f.sym===btSym)
        const pointVal=cfg?.pointVal||1
        trades.push({i,sig,pnl:pnl*pointVal,win:hitTarget&&!hitStop})
      }
      const wins=trades.filter(t=>t.win).length
      const totalPnl=trades.reduce((s,t)=>s+t.pnl,0)
      const avgWin=wins>0?trades.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0)/wins:0
      const losses=trades.length-wins
      const avgLoss=losses>0?Math.abs(trades.filter(t=>!t.win).reduce((s,t)=>s+t.pnl,0)/losses):0
      setBtResults({ trades:trades.length, wins, losses, winRate:trades.length>0?((wins/trades.length)*100).toFixed(0):0, totalPnl:totalPnl.toFixed(0), avgWin:avgWin.toFixed(0), avgLoss:avgLoss.toFixed(0), pf:avgLoss>0?(avgWin/avgLoss).toFixed(2):'∞', recentTrades:trades.slice(-8) })
      setBtRunning(false)
    }, 300)
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text,
      fontFamily:"'Share Tech Mono','Courier New',monospace", display:'flex', flexDirection:'column' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Exo+2:wght@400;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        @keyframes slideIn{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.2;}}
        .row:hover{background:rgba(255,255,255,0.025)!important;cursor:pointer;}
        .btn{cursor:pointer;border:none;font-family:inherit;transition:all 0.13s;}
        .btn:hover{filter:brightness(1.25);}
        input,textarea,select{font-family:'Share Tech Mono',monospace;outline:none;}
        input:focus,textarea:focus,select:focus{border-color:${C.teal}!important;}
        .tab-btn{padding:12px 18px;font-size:11px;font-weight:600;letter-spacing:1px;background:transparent;cursor:pointer;border:none;font-family:inherit;transition:all 0.13s;}
        .tab-btn:hover{color:${C.text}!important;}
      `}</style>

      {/* ════ HEADER ════ */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', height:58, flexShrink:0, gap:16 }}>

        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:36, height:36, borderRadius:9, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:18,
              background:'linear-gradient(135deg,#4af0c4,#0066ff)',
              boxShadow:'0 0 20px #4af0c433' }}>⚡</div>
            <div>
              <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:16, fontWeight:800,
                color:'#f0f0ff', letterSpacing:3 }}>
                APEX <span style={{color:C.teal}}>PRO</span>
              </div>
              <div style={{ fontSize:9, color:C.textFaint, letterSpacing:2 }}>ICT · SMC · VP · MTF · v3</div>
            </div>
          </div>

          <div style={{ width:1, height:30, background:C.border }}/>

          {/* Market toggles */}
          {Object.entries(MARKET_COLORS).map(([m,clr])=>(
            <button key={m} className="btn" onClick={()=>toggleMarket(m)} style={{
              padding:'5px 13px', fontSize:11, fontWeight:700, letterSpacing:1, borderRadius:4,
              background:markets.includes(m)?`${clr}1a`:'transparent',
              border:`1px solid ${markets.includes(m)?clr:C.border}`,
              color:markets.includes(m)?clr:C.textDim }}>{m}</button>
          ))}

          <div style={{ width:1, height:30, background:C.border }}/>

          {/* Timeframe selector */}
          <TFSelector value={tf} onChange={setTF} />
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <KZBadge kz={killZone}/>
          <DataBadge isLive={isLive} dataMode={dataMode}/>
          <div style={{ display:'flex', gap:16, fontSize:11 }}>
            <span style={{color:C.long}}>▲ {longCount}</span>
            <span style={{color:C.short}}>▼ {shortCount}</span>
            <span style={{color:C.textFaint}}>{displayRows.length} syms</span>
          </div>
          <button className="btn" onClick={()=>setScanActive(p=>!p)} style={{
            padding:'6px 15px', fontSize:11, fontWeight:700, letterSpacing:1, borderRadius:4,
            background:scanActive?`${C.teal}12`:`${C.short}12`,
            border:`1px solid ${scanActive?C.teal:C.short}`,
            color:scanActive?C.teal:C.short }}>
            <span style={{animation:scanActive?'pulse 1.4s infinite':'none',display:'inline-block',marginRight:5}}>●</span>
            {scanActive?'LIVE':'PAUSED'}
          </button>
          <button className="btn" onClick={()=>setSoundOn(p=>!p)} style={{
            width:34,height:34,fontSize:15,borderRadius:4,
            background:C.surface,border:`1px solid ${C.border}`,
            color:soundOn?C.text:C.textFaint }}>{soundOn?'🔔':'🔕'}</button>
        </div>
      </div>

      {/* ════ TAB BAR ════ */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`,
        display:'flex', alignItems:'center', padding:'0 20px', flexShrink:0 }}>

        {[['SCREENER','📊'],['ALERTS','🔔'],['CHART','📈'],['JOURNAL','📝'],['BACKTEST','🧪'],['RISK','⚖️'],['PLAYBOOK','📖']].map(([t,icon])=>(
          <button key={t} className="tab-btn" onClick={()=>setTab(t)} style={{
            color:tab===t?'#f0f0ff':C.textDim,
            borderBottom:`2px solid ${tab===t?C.teal:'transparent'}`,
            marginBottom:-1 }}>
            {icon} {t}
            {t==='ALERTS'&&alerts.length>0&&(
              <span style={{marginLeft:5,background:C.short,color:'#fff',
                fontSize:9,padding:'1px 5px',borderRadius:8,fontWeight:800}}>
                {Math.min(alerts.length,99)}
              </span>
            )}
          </button>
        ))}

        <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
          {['ALL','LONG','SHORT','SIGNALS'].map(f=>(
            <button key={f} className="btn" onClick={()=>setDirFilter(f)} style={{
              padding:'4px 9px',fontSize:10,fontWeight:700,borderRadius:4,
              background:dirFilter===f?'#ffffff0d':'transparent',
              border:`1px solid ${dirFilter===f?(f==='LONG'?C.long+'55':f==='SHORT'?C.short+'55':C.borderL):C.border}`,
              color:dirFilter===f?(f==='LONG'?C.long:f==='SHORT'?C.short:C.text):C.textDim
            }}>{f}</button>
          ))}
          <div style={{width:1,height:14,background:C.border,margin:'0 3px'}}/>
          {['ALL','A+','A','B'].map(g=>(
            <button key={g} className="btn" onClick={()=>setGradeFilter(g)} style={{
              padding:'4px 8px',fontSize:10,fontWeight:800,borderRadius:4,
              background:gradeFilter===g?'#ffffff0d':'transparent',
              border:`1px solid ${gradeFilter===g?C.borderL:C.border}`,
              color:gradeFilter===g?(g==='A+'?C.gold:g==='A'?C.long:g==='B'?C.blue:C.text):C.textDim
            }}>{g}</button>
          ))}
        </div>
      </div>

      {/* ════ CONTENT ════ */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* ── SCREENER ── */}
        {tab==='SCREENER'&&(
          <div style={{flex:1,overflow:'auto'}}>
            {/* Column headers */}
            <div style={{ display:'grid',
              gridTemplateColumns:'130px 50px 80px 100px 72px 62px 80px 86px 72px 80px 1fr',
              padding:'8px 18px', background:C.surface,
              borderBottom:`1px solid ${C.border}`,
              fontSize:9, color:C.textFaint, fontWeight:700, letterSpacing:1,
              position:'sticky', top:0, zIndex:2 }}>
              {['SYMBOL','MKT','CHART','PRICE','CHG%','VOL×','RSI','TREND','MTF','ENTRY','SIGNALS'].map(h=>(
                <span key={h}>{h}</span>
              ))}
            </div>

            {displayRows.map(({sym,market,d,signals,patterns,entryType,fvgs,orderBlocks,sweep,breaker,vpLevels,mpLevels,smt,killZone:kz})=>{
              const cfg=ALL_SYMBOLS.find(s=>s.sym===sym)
              const isUp=d.pct>=0
              const topSig=[...signals].sort((a,b)=>(a.grade==='A+'?0:a.grade==='A'?1:2)-(b.grade==='A+'?0:b.grade==='A'?1:2))[0]
              const isExpanded=expandedSym===sym
              const borderCol=topSig?.dir==='LONG'?C.long:topSig?.dir==='SHORT'?C.short:'transparent'
              const hasICT=(fvgs?.some(f=>f.active)||!!sweep||orderBlocks?.some(o=>o.active)||!!smt)
              return (
                <div key={sym}>
                  <div className="row" onClick={()=>setExpandedSym(isExpanded?null:sym)}
                    style={{ display:'grid',
                      gridTemplateColumns:'130px 50px 80px 100px 72px 62px 80px 86px 72px 80px 1fr',
                      padding:'10px 18px', borderBottom:`1px solid ${C.border}`,
                      alignItems:'center',
                      background:signals.length>0?'rgba(255,255,255,0.018)':'transparent',
                      borderLeft:`2px solid ${signals.length>0?borderCol+'66':'transparent'}` }}>

                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:cfg?.color||C.text,letterSpacing:0.5}}>{sym}</div>
                      {cfg?.name&&<div style={{fontSize:9,color:C.textFaint}}>{cfg.name}</div>}
                      {hasICT&&<div style={{fontSize:8,color:C.gold+'80',letterSpacing:1}}>◆ ICT</div>}
                    </div>
                    <span style={{fontSize:9,fontWeight:700,color:MARKET_COLORS[market]||'#555',letterSpacing:0.5}}>{market}</span>
                    <div onClick={e=>{e.stopPropagation();setChartSym(sym);setTab('CHART')}} title="Open chart"
                      style={{cursor:'pointer',opacity:0.8}}>
                      <MiniChart candles={d.candles} width={74} height={26}/>
                    </div>
                    <span style={{fontSize:12,fontFamily:'monospace',color:C.text,fontWeight:600}}>
                      ${fmt(d.price,d.price>100?2:4)}
                    </span>
                    <span style={{fontSize:11,color:isUp?C.long:C.short,fontWeight:700}}>
                      {(d.pct>=0?'+':'')+Number(d.pct).toFixed(2)}%
                    </span>
                    <span style={{fontSize:11,fontWeight:d.volRatio>1.5?700:400,
                      color:d.volRatio>2?C.gold:d.volRatio>1.5?C.orange:C.textDim}}>
                      {d.volRatio.toFixed(1)}×
                    </span>
                    <RSIBar value={d.rsi}/>
                    <span style={{fontSize:10,fontWeight:700,
                      color:TREND_COLORS[d.structure?.trend]||C.textFaint}}>
                      {d.structure?.trend==='UPTREND'?'▲ UP':d.structure?.trend==='DOWNTREND'?'▼ DOWN':'— RNG'}
                    </span>
                    <MTFBadge score={d.structure?.mtfScore??0}/>
                    <span style={{fontSize:10,color:entryType?.color||C.textFaint}}>{entryType?.label||'—'}</span>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {signals.slice(0,2).map((s,i)=><SignalPill key={i} sig={s}/>)}
                      {signals.length===0&&<span style={{fontSize:10,color:C.textFaint}}>watching</span>}
                    </div>
                  </div>

                  {isExpanded&&(
                    <div style={{background:'#0a0a1c',borderBottom:`1px solid ${C.borderL}`,
                      padding:'16px 20px',animation:'slideIn 0.2s ease'}}>

                      {/* Context bar */}
                      <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:14,
                        padding:'10px 14px',background:C.surface,borderRadius:5,
                        border:`1px solid ${C.border}`,flexWrap:'wrap'}}>
                        <KZBadge kz={kz}/>
                        <div style={{width:1,height:16,background:C.border}}/>
                        <VPRow vp={vpLevels} price={d.price}/>
                        {mpLevels&&(<>
                          <div style={{width:1,height:16,background:C.border}}/>
                          <span style={{fontSize:10,color:C.blue}}>
                            IB {fmt(mpLevels.ibLow)}–{fmt(mpLevels.ibHigh)}
                            {mpLevels.extendedUp?' ↑EXT':''}{mpLevels.extendedDown?' ↓EXT':''}
                            {mpLevels.poorHigh?' POOR HI':''}{mpLevels.poorLow?' POOR LO':''}
                          </span>
                        </>)}
                        {smt&&<span style={{fontSize:10,color:C.gold,fontWeight:700}}>⚡ SMT: {smt.type}</span>}
                        <button className="btn" onClick={e=>{e.stopPropagation();setChartSym(sym);setTab('CHART')}}
                          style={{marginLeft:'auto',padding:'4px 12px',fontSize:10,borderRadius:4,
                            background:`${C.teal}14`,border:`1px solid ${C.teal}40`,color:C.teal}}>
                          📈 Open Chart
                        </button>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:18}}>
                        {/* Left panel */}
                        <div>
                          <SectionLabel>Patterns</SectionLabel>
                          {patterns.length===0
                            ? <span style={{fontSize:10,color:C.textFaint}}>No patterns detected</span>
                            : patterns.map((p,i)=>{
                              const c=p.dir==='LONG'?C.long:p.dir==='SHORT'?C.short:'#777'
                              return (
                                <div key={i} style={{display:'flex',gap:7,alignItems:'center',marginBottom:6}}>
                                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:3,
                                    background:`${c}14`,border:`1px solid ${c}28`,color:c}}>{p.name}</span>
                                  <span style={{fontSize:10,color:C.textDim,flex:1}}>{p.desc}</span>
                                  <GradeBadge grade={p.strength}/>
                                </div>
                              )
                            })
                          }
                          <div style={{marginTop:12}}>
                            <SectionLabel>Fair Value Gaps</SectionLabel>
                            <FVGRow fvgs={fvgs}/>
                          </div>
                          {orderBlocks?.length>0&&(
                            <div style={{marginTop:12}}>
                              <SectionLabel>Order Blocks</SectionLabel>
                              {orderBlocks.map((ob,i)=>{
                                const c=ob.dir==='BULL'?C.long:C.short
                                return (
                                  <div key={i} style={{display:'flex',gap:7,alignItems:'center',marginBottom:5}}>
                                    <span style={{fontSize:9,padding:'2px 6px',borderRadius:3,
                                      background:`${c}14`,border:`1px solid ${c}28`,color:c,fontWeight:700}}>
                                      {ob.dir} OB
                                    </span>
                                    <span style={{fontSize:10,color:C.textDim,fontFamily:'monospace'}}>
                                      ${fmt(ob.obLow)}–${fmt(ob.obHigh)}
                                    </span>
                                    {ob.active&&<span style={{fontSize:9,color:C.gold,fontWeight:700}}>● IN OB</span>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Right: trade plans */}
                        <div>
                          <SectionLabel>Trade Plans — {tf.label} Timeframe</SectionLabel>
                          {signals.length===0
                            ? <span style={{fontSize:11,color:C.textFaint}}>No active setups — stand aside</span>
                            : signals.map((s,i)=>{
                              const c=s.dir==='LONG'?C.long:s.dir==='SHORT'?C.short:'#aaa'
                              const sc=s.source==='ICT'?C.gold:s.source==='VOLUME_PROFILE'?C.blue:s.source==='MARKET_PROFILE'?C.purple:C.teal
                              return (
                                <div key={i} style={{marginBottom:12,padding:'12px 14px',
                                  background:C.card,borderRadius:5,borderLeft:`3px solid ${c}`,
                                  border:`1px solid ${C.border}`,borderLeftWidth:3}}>
                                  <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                                    <span style={{color:c,fontWeight:800,fontSize:13}}>{s.dir==='LONG'?'▲':s.dir==='SHORT'?'▼':'◆'} {s.dir}</span>
                                    <GradeBadge grade={s.grade}/>
                                    <span style={{fontSize:9,color:sc,padding:'2px 6px',
                                      background:`${sc}14`,border:`1px solid ${sc}28`,borderRadius:3}}>
                                      {s.source||'CLASSIC'}
                                    </span>
                                    <span style={{fontSize:10,color:C.textDim,fontStyle:'italic'}}>{s.entryLabel}</span>
                                    {s.killZone&&<span style={{fontSize:9,color:C.blue,marginLeft:'auto'}}>{s.killZone}</span>}
                                  </div>
                                  <div style={{fontSize:11,color:C.textDim,marginBottom:8}}>{s.reason}</div>
                                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:8}}>
                                    {[['STOP',`$${fmt(s.stop)}`,C.short],
                                      ['TARGET',`$${fmt(s.target)}`,C.long],
                                      ['R:R',`${s.rr}R`,C.gold],
                                      ['SIZE',s.positionSize||'—',C.text]
                                    ].map(([l,v,col])=>(
                                      <div key={l} style={{background:C.surface,borderRadius:4,padding:'5px 8px',border:`1px solid ${C.border}`}}>
                                        <div style={{fontSize:8,color:C.textFaint,letterSpacing:1,marginBottom:2}}>{l}</div>
                                        <div style={{fontSize:11,color:col,fontFamily:'monospace',fontWeight:700}}>{v}</div>
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{fontSize:10,color:C.textDim,marginBottom:5}}>{s.stopNote} · {s.targetNote}</div>
                                  {s.rule&&<div style={{fontSize:9,color:C.textFaint,fontStyle:'italic',
                                    borderTop:`1px solid ${C.border}`,paddingTop:6}}>{s.rule}</div>}
                                </div>
                              )
                            })
                          }
                        </div>
                      </div>

                      {sweep&&(
                        <div style={{marginTop:10,padding:'9px 14px',
                          background:`${sweep.dir==='BULL'?C.long:C.short}0e`,
                          border:`1px solid ${sweep.dir==='BULL'?C.long+'40':C.short+'40'}`,
                          borderRadius:4,fontSize:11,
                          color:sweep.dir==='BULL'?C.long:C.short}}>
                          ⚡ LIQUIDITY SWEEP: {sweep.type} — Swept ${fmt(sweep.sweptLevel)} ({sweep.sweepDepth?.toFixed(3)}% depth)
                        </div>
                      )}
                      {d.structure?.bos&&(
                        <div style={{marginTop:8,padding:'9px 14px',
                          background:`${C.gold}0a`,border:`1px solid ${C.gold}30`,
                          borderRadius:4,fontSize:11,color:C.gold}}>
                          ⚡ BREAK OF STRUCTURE: {d.structure.bos.replace('_',' ')} — Wait for retest before entry.
                        </div>
                      )}
                      <div style={{marginTop:12,display:'flex',gap:22,fontSize:10,color:C.textDim,flexWrap:'wrap'}}>
                        <span>VWAP <span style={{color:C.text,fontFamily:'monospace'}}>${fmt(d.vwap)}</span></span>
                        <span>DEV <span style={{color:d.vwapDev>0?C.blue:C.orange,fontFamily:'monospace'}}>{(d.vwapDev>=0?'+':'')+Number(d.vwapDev).toFixed(2)}%</span></span>
                        <span>8 EMA <span style={{color:C.text,fontFamily:'monospace'}}>${fmt(d.ema8)}</span></span>
                        <span>RSI <span style={{color:d.rsi<35?C.long:d.rsi>65?C.short:C.text}}>{d.rsi?.toFixed(1)}</span></span>
                        <span>TF <span style={{color:C.teal}}>{tf.label}</span></span>
                        <span>DATA <span style={{color:d.source==='live'?C.teal:'#ffaa44'}}>{d.source?.toUpperCase()}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {displayRows.length===0&&(
              <div style={{padding:70,textAlign:'center',color:C.textFaint}}>
                <div style={{fontSize:32,marginBottom:12}}>🎯</div>
                <div style={{fontSize:14}}>No setups match current filters.</div>
                <div style={{fontSize:11,marginTop:8,color:C.textFaint}}>Disciplined Trader: The market owes you nothing. Wait for the edge.</div>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS ── */}
        {tab==='ALERTS'&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,
              background:C.surface,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <span style={{fontSize:11,color:C.teal}}>{filteredAlerts.length} alerts · {tf.label}</span>
                <KZBadge kz={killZone}/>
              </div>
              <button className="btn" onClick={()=>setAlerts([])} style={{
                padding:'4px 12px',fontSize:10,background:'transparent',
                border:`1px solid ${C.border}`,color:C.textDim,borderRadius:4}}>CLEAR ALL</button>
            </div>
            <div style={{flex:1,overflow:'auto'}}>
              {filteredAlerts.length===0&&(
                <div style={{padding:70,textAlign:'center',color:C.textFaint}}>
                  <div style={{fontSize:32,marginBottom:12}}>📡</div>
                  <div style={{fontSize:14}}>Scanning {ALL_SYMBOLS.filter(s=>markets.includes(s.market)).length} instruments on {tf.label}...</div>
                  <div style={{fontSize:11,marginTop:8}}>ICT + Classic engine active. High-confluence setups only.</div>
                </div>
              )}
              {filteredAlerts.map((a,i)=><AlertCard key={a.id} alert={a} isNew={i===0&&Date.now()-a.ts<3000}/>)}
            </div>
          </div>
        )}

        {/* ── CHART ── */}
        {tab==='CHART'&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'10px 18px',borderBottom:`1px solid ${C.border}`,
              background:C.surface,display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:C.textDim}}>Symbol:</span>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {ALL_SYMBOLS.filter(s=>markets.includes(s.market)).map(s=>(
                  <button key={s.sym} className="btn" onClick={()=>setChartSym(s.sym)} style={{
                    padding:'4px 10px',fontSize:10,fontWeight:600,borderRadius:4,
                    background:chartSym===s.sym?`${s.color||C.teal}18`:'transparent',
                    border:`1px solid ${chartSym===s.sym?s.color||C.teal:C.border}`,
                    color:chartSym===s.sym?s.color||C.teal:C.textDim}}>{s.sym}</button>
                ))}
              </div>
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:10,color:C.textFaint}}>Timeframe:</span>
                <TFSelector value={tf} onChange={setTF}/>
              </div>
            </div>
            <div style={{flex:1,padding:16,overflow:'auto'}}>
              <TVChart sym={chartSym} tf={tf}/>
              {/* Show signals for this symbol */}
              {(()=>{
                const row=screenerRows.find(r=>r.sym===chartSym)
                if(!row||row.signals.length===0) return (
                  <div style={{marginTop:14,padding:'12px 16px',background:C.surface,
                    border:`1px solid ${C.border}`,borderRadius:5,fontSize:11,color:C.textFaint}}>
                    No active signals for {chartSym} on {tf.label}
                  </div>
                )
                return (
                  <div style={{marginTop:14}}>
                    <SectionLabel>Active Signals — {chartSym} {tf.label}</SectionLabel>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10}}>
                      {row.signals.slice(0,4).map((s,i)=>{
                        const c=s.dir==='LONG'?C.long:s.dir==='SHORT'?C.short:'#aaa'
                        return (
                          <div key={i} style={{padding:'12px 14px',background:C.card,
                            border:`1px solid ${C.border}`,borderLeft:`3px solid ${c}`,borderRadius:5}}>
                            <div style={{display:'flex',gap:7,alignItems:'center',marginBottom:6}}>
                              <span style={{color:c,fontWeight:800,fontSize:12}}>{s.dir==='LONG'?'▲':'▼'} {s.dir}</span>
                              <GradeBadge grade={s.grade}/>
                              <span style={{fontSize:9,color:C.textFaint}}>{s.pattern}</span>
                            </div>
                            <div style={{fontSize:10,color:C.textDim,marginBottom:8}}>{s.reason}</div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                              {[['STOP',`$${fmt(s.stop)}`,C.short],['TARGET',`$${fmt(s.target)}`,C.long],['R:R',`${s.rr}R`,C.gold]].map(([l,v,col])=>(
                                <div key={l} style={{background:C.surface,borderRadius:3,padding:'4px 7px',border:`1px solid ${C.border}`}}>
                                  <div style={{fontSize:8,color:C.textFaint,marginBottom:2}}>{l}</div>
                                  <div style={{fontSize:11,color:col,fontFamily:'monospace',fontWeight:700}}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ── JOURNAL ── */}
        {tab==='JOURNAL'&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Stats bar */}
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${C.border}`,
              background:C.surface,flexShrink:0}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
                <StatBox label="TOTAL TRADES" value={jStats.total} color={C.teal}/>
                <StatBox label="WIN RATE" value={`${winRate}%`} color={parseFloat(winRate)>=50?C.long:C.short}/>
                <StatBox label="NET P&L" value={`$${parseFloat(jStats.pnl).toLocaleString('en',{maximumFractionDigits:0})}`} color={jStats.pnl>=0?C.long:C.short}/>
                <StatBox label="WINS" value={jStats.wins} color={C.long}/>
                <StatBox label="BEST R:R" value={`${jStats.bestR}R`} color={C.gold}/>
              </div>
            </div>

            <div style={{flex:1,display:'grid',gridTemplateColumns:'320px 1fr',overflow:'hidden'}}>
              {/* Entry form */}
              <div style={{borderRight:`1px solid ${C.border}`,padding:'18px 16px',overflow:'auto'}}>
                <SectionLabel>Log New Trade</SectionLabel>
                {[
                  ['Symbol', <select value={journalForm.sym} onChange={e=>setJournalForm(f=>({...f,sym:e.target.value}))}
                    style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,color:C.text,padding:'7px 10px',borderRadius:4,fontSize:11}}>
                    {ALL_SYMBOLS.map(s=><option key={s.sym} value={s.sym}>{s.sym}</option>)}
                  </select>],
                  ['Direction', <div style={{display:'flex',gap:6}}>
                    {['LONG','SHORT'].map(dir=>(
                      <button key={dir} className="btn" onClick={()=>setJournalForm(f=>({...f,dir}))} style={{
                        flex:1,padding:'7px',fontSize:11,fontWeight:700,borderRadius:4,
                        background:journalForm.dir===dir?(dir==='LONG'?`${C.long}20`:`${C.short}20`):'transparent',
                        border:`1px solid ${journalForm.dir===dir?(dir==='LONG'?C.long:C.short):C.border}`,
                        color:journalForm.dir===dir?(dir==='LONG'?C.long:C.short):C.textDim}}>{dir}</button>
                    ))}
                  </div>],
                  ['Entry Price', <input value={journalForm.entry} onChange={e=>setJournalForm(f=>({...f,entry:e.target.value}))} placeholder="e.g. 21450.00" style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,color:C.text,padding:'7px 10px',borderRadius:4,fontSize:11}}/>],
                  ['Stop Price', <input value={journalForm.stop} onChange={e=>setJournalForm(f=>({...f,stop:e.target.value}))} placeholder="e.g. 21420.00" style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,color:C.text,padding:'7px 10px',borderRadius:4,fontSize:11}}/>],
                  ['Exit Price', <input value={journalForm.exit} onChange={e=>setJournalForm(f=>({...f,exit:e.target.value}))} placeholder="e.g. 21510.00" style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,color:C.text,padding:'7px 10px',borderRadius:4,fontSize:11}}/>],
                  ['Contracts', <input value={journalForm.contracts} onChange={e=>setJournalForm(f=>({...f,contracts:e.target.value}))} placeholder="1" style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,color:C.text,padding:'7px 10px',borderRadius:4,fontSize:11}}/>],
                  ['Notes', <textarea value={journalForm.notes} onChange={e=>setJournalForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Setup, emotions, lessons..." style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,color:C.text,padding:'7px 10px',borderRadius:4,fontSize:11,resize:'none'}}/>],
                ].map(([label,input])=>(
                  <div key={label} style={{marginBottom:12}}>
                    <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:5}}>{label.toUpperCase()}</div>
                    {input}
                  </div>
                ))}
                <button className="btn" onClick={addTrade} style={{
                  width:'100%',padding:'10px',fontSize:12,fontWeight:700,letterSpacing:1,
                  background:`${C.teal}18`,border:`1px solid ${C.teal}`,color:C.teal,borderRadius:4}}>
                  + LOG TRADE
                </button>
              </div>

              {/* Trade list */}
              <div style={{overflow:'auto',padding:'16px 18px'}}>
                <SectionLabel>Trade History ({journal.length})</SectionLabel>
                {journal.length===0&&(
                  <div style={{padding:40,textAlign:'center',color:C.textFaint}}>
                    <div style={{fontSize:28,marginBottom:10}}>📝</div>
                    <div style={{fontSize:13}}>No trades logged yet.</div>
                    <div style={{fontSize:11,marginTop:6}}>Log your first trade to start tracking your edge.</div>
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {journal.map(t=>{
                    const isWin=parseFloat(t.pnl)>0
                    const c=isWin?C.long:C.short
                    return (
                      <div key={t.id} style={{padding:'12px 14px',background:C.card,
                        border:`1px solid ${C.border}`,borderLeft:`3px solid ${c}`,borderRadius:5}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <span style={{color:t.dir==='LONG'?C.long:C.short,fontWeight:800,fontSize:13}}>
                              {t.dir==='LONG'?'▲':'▼'} {t.sym}
                            </span>
                            <span style={{fontSize:9,color:C.textFaint,padding:'2px 6px',border:`1px solid ${C.border}`,borderRadius:3}}>{t.ts}</span>
                          </div>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <span style={{fontSize:14,color:c,fontFamily:'monospace',fontWeight:800}}>
                              {isWin?'+':''}{parseFloat(t.pnl).toLocaleString('en',{maximumFractionDigits:0})}
                            </span>
                            <button className="btn" onClick={()=>deleteTrade(t.id)} style={{
                              fontSize:11,color:C.textFaint,background:'transparent',border:'none',padding:'2px 6px'}}>✕</button>
                          </div>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,marginBottom:t.notes?8:0}}>
                          {[['ENTRY',`$${t.entry}`],['STOP',`$${t.stop}`],['EXIT',`$${t.exit}`],['CNTS',t.contracts],['R:R',`${t.rr}R`]].map(([l,v])=>(
                            <div key={l} style={{background:C.surface,borderRadius:3,padding:'4px 7px',border:`1px solid ${C.border}`}}>
                              <div style={{fontSize:8,color:C.textFaint,marginBottom:2}}>{l}</div>
                              <div style={{fontSize:10,color:C.text,fontFamily:'monospace'}}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {t.notes&&<div style={{fontSize:10,color:C.textDim,fontStyle:'italic',marginTop:6}}>{t.notes}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── BACKTEST ── */}
        {tab==='BACKTEST'&&(
          <div style={{flex:1,overflow:'auto',padding:'20px 22px'}}>
            <SectionLabel>Backtest Engine — Signal Replay on Candle History</SectionLabel>

            {/* Config */}
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:20,
              padding:'14px 16px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:5}}>
              <div>
                <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:4}}>SYMBOL</div>
                <select value={btSym} onChange={e=>setBtSym(e.target.value)}
                  style={{background:C.card,border:`1px solid ${C.border}`,color:C.text,padding:'7px 12px',borderRadius:4,fontSize:11}}>
                  {FUTURES_CONFIG.map(f=><option key={f.sym} value={f.sym}>{f.sym} — {f.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:4}}>GRADE FILTER</div>
                <select value={btSetup} onChange={e=>setBtSetup(e.target.value)}
                  style={{background:C.card,border:`1px solid ${C.border}`,color:C.text,padding:'7px 12px',borderRadius:4,fontSize:11}}>
                  <option value="ALL">All Grades</option>
                  <option value="A+">A+ Only</option>
                  <option value="A">A Grade</option>
                  <option value="B">B Grade</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:4}}>TIMEFRAME</div>
                <TFSelector value={tf} onChange={setTF}/>
              </div>
              <button className="btn" onClick={runBacktest} disabled={btRunning} style={{
                padding:'10px 22px',fontSize:12,fontWeight:700,letterSpacing:1,borderRadius:4,
                marginTop:14,
                background:btRunning?C.surface:`${C.teal}18`,
                border:`1px solid ${btRunning?C.border:C.teal}`,
                color:btRunning?C.textFaint:C.teal}}>
                {btRunning?'⟳ Running...':'▶ Run Backtest'}
              </button>
              <div style={{fontSize:10,color:C.textFaint,marginTop:14,maxWidth:360}}>
                Replays signal engine across available candle history. Simulates next-candle outcome based on stop/target levels.
              </div>
            </div>

            {btResults&&(
              <>
                {/* Stats */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
                  <StatBox label="TOTAL SIGNALS" value={btResults.trades} color={C.teal}/>
                  <StatBox label="WIN RATE" value={`${btResults.winRate}%`}
                    color={parseFloat(btResults.winRate)>=50?C.long:C.short}
                    sub={`${btResults.wins}W / ${btResults.losses}L`}/>
                  <StatBox label="PROFIT FACTOR" value={btResults.pf}
                    color={parseFloat(btResults.pf)>=1.5?C.long:parseFloat(btResults.pf)>=1?C.gold:C.short}/>
                  <StatBox label="SIMULATED P&L" value={`$${parseFloat(btResults.totalPnl).toLocaleString('en',{maximumFractionDigits:0})}`}
                    color={parseFloat(btResults.totalPnl)>=0?C.long:C.short}/>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
                  <StatBox label="AVG WIN ($)" value={`$${parseFloat(btResults.avgWin).toLocaleString()}`} color={C.long}/>
                  <StatBox label="AVG LOSS ($)" value={`-$${parseFloat(btResults.avgLoss).toLocaleString()}`} color={C.short}/>
                </div>

                {/* Recent signals */}
                <SectionLabel>Recent Backtest Signals</SectionLabel>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {btResults.recentTrades.map((t,i)=>{
                    const c=t.win?C.long:C.short
                    return (
                      <div key={i} style={{padding:'10px 14px',background:C.card,
                        border:`1px solid ${C.border}`,borderLeft:`3px solid ${c}`,borderRadius:4,
                        display:'flex',gap:14,alignItems:'center'}}>
                        <span style={{color:t.sig.dir==='LONG'?C.long:C.short,fontWeight:700,fontSize:12}}>
                          {t.sig.dir==='LONG'?'▲':'▼'} {t.sig.dir}
                        </span>
                        <GradeBadge grade={t.sig.grade}/>
                        <span style={{fontSize:11,color:C.textDim,flex:1}}>{t.sig.reason}</span>
                        <span style={{fontSize:11,color:c,fontFamily:'monospace',fontWeight:700}}>
                          {t.win?'+':''}{t.pnl.toLocaleString('en',{maximumFractionDigits:0})}
                        </span>
                        <span style={{fontSize:10,color:t.win?C.long:C.short,fontWeight:700}}>
                          {t.win?'✓ WIN':'✗ LOSS'}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div style={{marginTop:16,padding:'12px 16px',background:C.surface,
                  border:`1px solid ${C.border}`,borderRadius:4,fontSize:10,color:C.textFaint,lineHeight:1.8}}>
                  ⚠️ Backtest uses simulation data with next-candle outcome approximation.
                  Results are indicative only — not a guarantee of live performance.
                  Slippage, spread, and execution delay are not modeled.
                  Always forward-test before trading live capital.
                </div>
              </>
            )}

            {!btResults&&!btRunning&&(
              <div style={{padding:50,textAlign:'center',color:C.textFaint}}>
                <div style={{fontSize:32,marginBottom:12}}>🧪</div>
                <div style={{fontSize:14}}>Configure and run a backtest above.</div>
                <div style={{fontSize:11,marginTop:6}}>Signal engine replays across candle history to estimate historical performance.</div>
              </div>
            )}
          </div>
        )}

        {/* ── RISK ── */}
        {tab==='RISK'&&(
          <div style={{flex:1,overflow:'auto'}}>
            <div style={{padding:'18px 22px',borderBottom:`1px solid ${C.border}`,background:C.surface}}>
              <SectionLabel>Risk Management — Best Loser Wins</SectionLabel>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18}}>
                <div>
                  <div style={{fontSize:10,color:C.textDim,marginBottom:6,letterSpacing:1}}>ACCOUNT SIZE ($)</div>
                  <input value={accountSize} onChange={e=>setAccountSize(Number(e.target.value.replace(/\D/g,'')))}
                    style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,color:C.text,
                      padding:'9px 12px',fontSize:14,borderRadius:4}} placeholder="50000"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.textDim,marginBottom:6,letterSpacing:1}}>RISK PER TRADE</div>
                  <div style={{display:'flex',gap:6}}>
                    {[0.5,1,1.5,2].map(p=>(
                      <button key={p} className="btn" onClick={()=>setRiskPct(p)} style={{
                        flex:1,padding:'9px 4px',fontSize:12,fontFamily:'monospace',
                        background:riskPct===p?`${C.long}18`:C.card,
                        border:`1px solid ${riskPct===p?C.long:C.border}`,
                        color:riskPct===p?C.long:C.textDim,borderRadius:4}}>{p}%</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.textDim,marginBottom:6,letterSpacing:1}}>MAX RISK / TRADE</div>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,padding:'9px 14px',borderRadius:4}}>
                    <span style={{fontSize:16,color:C.short,fontFamily:'monospace',fontWeight:800}}>
                      ${(accountSize*riskPct/100).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{padding:'18px 22px'}}>
              <SectionLabel>Leveraged Futures Contract Specs</SectionLabel>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
                {futuresRiskCalc.map(f=>(
                  <div key={f.sym} style={{background:C.surface,border:`1px solid ${C.border}`,
                    borderTop:`2px solid ${f.color}`,borderRadius:5,padding:16}}>
                    <div style={{fontSize:15,fontWeight:800,color:f.color,marginBottom:2}}>{f.sym}</div>
                    <div style={{fontSize:10,color:C.textFaint,marginBottom:12}}>{f.name}</div>
                    {[['Tick Size',`$${f.tickSize}`],['Point Value',`$${f.pointVal}`],
                      ['Suggested Stop',`${f.stopTicks} ticks`],
                      ['Stop Cost',`$${f.stopDollar}`],
                      ['Max Contracts',`${f.maxContracts}`]].map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',
                        borderBottom:`1px solid ${C.border}`,padding:'5px 0',fontSize:10}}>
                        <span style={{color:C.textDim}}>{l}</span>
                        <span style={{color:C.text,fontFamily:'monospace'}}>{v}</span>
                      </div>
                    ))}
                    <div style={{marginTop:12,fontSize:13,color:f.color,fontWeight:800}}>
                      MAX: {f.maxContracts} × {f.sym}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:'14px 16px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,
                fontSize:10,color:C.textDim,lineHeight:2}}>
                <span style={{color:C.gold}}>⚡ ICT RULES: </span>
                Kill Zones only · 4H/1H bias before 1–5min entry · FVG needs sweep OR OB confluence · SMT = highest conviction · Never hold through FOMC/CPI/NFP/EIA
              </div>
            </div>
          </div>
        )}

        {/* ── PLAYBOOK ── */}
        {tab==='PLAYBOOK'&&(
          <div style={{flex:1,overflow:'auto',padding:'20px 24px',maxWidth:960}}>
            <SectionLabel>Master Playbook — ICT · Volume Profile · Market Profile · 5 Books</SectionLabel>
            {PLAYBOOK.map((p,i)=>(
              <div key={i} style={{marginBottom:16,border:`1px solid ${p.color}18`,
                borderLeft:`3px solid ${p.color}`,background:`${p.color}04`,
                borderRadius:5,padding:'18px 20px'}}>
                <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:14}}>
                  <GradeBadge grade={p.grade}/>
                  <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:14,fontWeight:700,color:'#f0f0ff'}}>{p.title}</span>
                  <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                    {p.books.map(b=>(
                      <span key={b} style={{fontSize:9,padding:'2px 7px',background:'#ffffff07',
                        border:`1px solid ${C.border}`,color:C.textFaint,borderRadius:3}}>{b}</span>
                    ))}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:5}}>▲ LONG CONDITIONS</div>
                    <div style={{fontSize:11,color:C.long,lineHeight:1.8,opacity:0.9}}>{p.long}</div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:5}}>▼ SHORT CONDITIONS</div>
                    <div style={{fontSize:11,color:C.short,lineHeight:1.8,opacity:0.9}}>{p.short}</div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['ENTRY METHOD',p.entry,C.blue],['STOP',p.stop,C.short],['TARGET',p.target,C.long],['R:R',p.rr,C.gold]].map(([l,v,c])=>(
                    <div key={l} style={{background:C.surface,borderRadius:4,padding:'8px 10px',border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:9,color:C.textFaint,letterSpacing:1,marginBottom:4}}>{l}</div>
                      <div style={{fontSize:10,color:c,lineHeight:1.5}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11,color:C.textDim,fontStyle:'italic',
                  borderTop:`1px solid ${C.border}`,paddingTop:10,lineHeight:1.7}}>
                  💬 {p.mind}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ════ STATUS BAR ════ */}
      <div style={{ height:26, background:'#04040b', borderTop:`1px solid ${C.border}`,
        display:'flex', alignItems:'center', padding:'0 18px',
        gap:20, fontSize:9, color:C.textFaint, letterSpacing:1, flexShrink:0 }}>
        <span style={{color:scanActive?`${C.teal}44`:`${C.short}44`}}>
          ● {scanActive?`SCANNING 2.5S`:' PAUSED'} · {dataMode} · {tf.label}
        </span>
        <span>ES · NQ · CL · GC · STOCKS · CRYPTO</span>
        <span>ICT: FVG · IFVG · OB · SWEEP · SMT · VP: POC/VAH/VAL · IB</span>
        <span style={{marginLeft:'auto'}}>APEX PRO v3 · NOT FINANCIAL ADVICE</span>
      </div>
    </div>
  )
}

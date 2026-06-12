import { TrendingUp, ScanSearch, Zap, DollarSign } from 'lucide-react';

const MARKETS = [
  { flag: '🇬🇭', name: 'Ghana GSE',        tickers: ['MTNGH.GH', 'GCB.GH', 'BOPP.GH'] },
  { flag: '🇺🇸', name: 'US NYSE / NASDAQ', tickers: ['AAPL', 'MSFT', 'TSLA'] },
  { flag: '🇳🇬', name: 'Nigeria NGX',       tickers: ['DANGCEM.LG', 'GTCO.LG'] },
  { flag: '🇿🇦', name: 'South Africa JSE',  tickers: ['NPN.JO', 'MTN.JO'] },
];

const ANALYSES = [
  { label: 'Trade Signal', color: 'text-gold', bg: 'bg-gold/10 border-gold/20' },
  { label: 'Dividend Analysis', color: 'text-gain', bg: 'bg-gain/10 border-gain/20' },
  { label: 'Fundamental Analysis', color: 'text-info', bg: 'bg-info/10 border-info/20' },
  { label: 'Technical Analysis', color: 'text-violet', bg: 'bg-violet/10 border-violet/20' },
  { label: 'Risk Management', color: 'text-loss', bg: 'bg-loss/10 border-loss/20' },
  { label: 'Sector Analysis', color: 'text-t2', bg: 'bg-raised border-rim' },
  { label: 'Portfolio Fit', color: 'text-t2', bg: 'bg-raised border-rim' },
  { label: 'Investment Strategies', color: 'text-t2', bg: 'bg-raised border-rim' },
  { label: 'Market Trends', color: 'text-t2', bg: 'bg-raised border-rim' },
  { label: 'Results Reports', color: 'text-t2', bg: 'bg-raised border-rim' },
  { label: 'Growth vs Dividend', color: 'text-t2', bg: 'bg-raised border-rim' },
  { label: 'World Events Impact', color: 'text-t2', bg: 'bg-raised border-rim' },
];

export default function EmptyState({ onOpenScreener }) {
  return (
    <div className="h-full overflow-y-auto flex flex-col items-center justify-center p-8 gap-8">
      {/* Hero */}
      <div className="text-center space-y-3 max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-gain/10 border border-gain/20 flex items-center justify-center mx-auto">
          <TrendingUp size={26} className="text-gain" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-bold text-t1 leading-tight">
          AI-Powered Stock Research
        </h2>
        <p className="text-sm text-t2 leading-relaxed">
          Search any stock or browse the market sidebar. Get instant AI analysis
          across 12 research dimensions — including BUY/SELL signals, dividend scoring, and more.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
        <FeatureCard
          icon={<Zap size={16} className="text-gold" />}
          bg="bg-gold/10 border-gold/20"
          title="Trade Signals"
          desc="BUY/SELL/HOLD with entry price, targets & stop-loss"
        />
        <FeatureCard
          icon={<DollarSign size={16} className="text-gain" />}
          bg="bg-gain/10 border-gain/20"
          title="Dividend Analysis"
          desc="Yield quality, safety score & income suitability"
        />
        <button
          onClick={onOpenScreener}
          className="panel px-3 py-3 text-left hover:bg-raised cursor-pointer transition-colors group"
        >
          <div className="w-7 h-7 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center mb-2">
            <ScanSearch size={14} className="text-violet" />
          </div>
          <div className="text-xs font-semibold text-t1 group-hover:text-violet transition-colors">Stock Screener</div>
          <div className="text-[10px] text-t3 mt-0.5 leading-tight">Ask in plain English — "Best Ghana dividend stocks"</div>
        </button>
      </div>

      {/* Markets */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {MARKETS.map((m) => (
          <div key={m.name} className="panel px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{m.flag}</span>
              <span className="text-xs font-semibold text-t2">{m.name}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.tickers.map((t) => (
                <span key={t} className="font-mono text-[10px] text-t3 bg-raised px-1.5 py-0.5 rounded">
                  {t.split('.')[0]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Analysis types */}
      <div className="w-full max-w-lg">
        <div className="text-[10px] font-semibold text-t3 uppercase tracking-widest text-center mb-2">
          12 Analysis Types
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {ANALYSES.map((a) => (
            <span key={a.label} className={`text-[11px] px-2 py-1 rounded-md border font-medium ${a.color} ${a.bg}`}>
              {a.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, bg, title, desc }) {
  return (
    <div className="panel px-3 py-3">
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center mb-2 ${bg}`}>
        {icon}
      </div>
      <div className="text-xs font-semibold text-t1">{title}</div>
      <div className="text-[10px] text-t3 mt-0.5 leading-tight">{desc}</div>
    </div>
  );
}

import { TrendingUp, TrendingDown, Minus, Globe, ExternalLink, AlertTriangle } from 'lucide-react';

const fmt = (v, d = 2) => {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(d);
};
const money = (v, currency) => {
  const s = fmt(v);
  return s === '—' ? '—' : `${currency && currency !== 'USD' ? currency + ' ' : '$'}${s}`;
};
// EODHD returns analyst rating as 1–5 numeric score; map to text
const fmtRating = (v) => {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  const n = parseFloat(v);
  if (isNaN(n)) return String(v);
  if (n <= 1.5) return 'Strong Buy';
  if (n <= 2.5) return 'Buy';
  if (n <= 3.5) return 'Hold';
  if (n <= 4.5) return 'Sell';
  return 'Strong Sell';
};
const pct = (v, mul = 1) => {
  if (v == null) return '—';
  const n = parseFloat(v) * mul;
  return isNaN(n) ? '—' : `${n.toFixed(2)}%`;
};

export default function StockOverview({ ticker, stockData }) {
  const q = stockData?.quote;
  if (!q) return null;

  /* ── Loading skeleton ── */
  if (q.dataSource === 'loading') {
    return (
      <div className="panel px-5 py-4 animate-pulse space-y-3">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-5 w-44 bg-raised rounded" />
            <div className="h-3 w-28 bg-raised rounded" />
          </div>
          <div className="h-8 w-24 bg-raised rounded" />
        </div>
        <div className="grid grid-cols-4 gap-px pt-3 border-t border-rim">
          {[1,2,3,4].map(i => <div key={i} className="h-8 bg-raised rounded" />)}
        </div>
      </div>
    );
  }

  /* ── AI-only mode ── */
  if (q.dataSource === 'ai-only') {
    return (
      <div className="panel px-5 py-4 flex items-start gap-4 bg-gain-glow">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={16} className="text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-t1 text-base">{q.symbol}</span>
            <span className="badge badge-gold text-[10px]">AI Mode</span>
          </div>
          <p className="text-xs text-t2 mt-1 leading-relaxed">
            Live data unavailable for this ticker. All 10 analysis types still work — Claude uses its knowledge base.
          </p>
          <p className="text-[10px] text-t3 mt-1">
            Live prices available for major US, UK and global exchange stocks. Ghana GSE, Nigeria NSE prices require a data provider API.
          </p>
        </div>
      </div>
    );
  }

  const change    = q.regularMarketChange ?? 0;
  const changePct = q.regularMarketChangePercent ?? 0;
  const isUp   = change > 0;
  const isDown = change < 0;

  const priceColor = isUp ? 'text-gain' : isDown ? 'text-loss' : 'text-t2';
  const bgGlow     = isUp ? 'bg-gain-glow' : isDown ? 'bg-loss-glow' : '';
  const ChangeIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  const lo = q.fiftyTwoWeekLow, hi = q.fiftyTwoWeekHigh, cur = q.regularMarketPrice;
  const _rp = lo != null && hi != null && hi > lo && cur != null
    ? Math.min(100, Math.max(0, ((cur - lo) / (hi - lo)) * 100))
    : null;
  const rangePct = _rp != null && !isNaN(_rp) ? _rp : null;

  const hasFund = q.marketCap != null || q.trailingPE != null || q.yearlyChangePercent != null;

  return (
    <div className="space-y-3 animate-slide-in">
      {/* ── Price card ── */}
      <div className={`panel px-5 py-4 ${bgGlow}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left: name + tags */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-t1 text-lg leading-tight truncate">
                {q.longName || q.symbol}
              </h1>
              <span className="badge badge-green font-mono">{q.symbol}</span>
              {q.exchange && <span className="badge badge-muted">{q.exchange}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-t3">
              {q.sector && <span>{q.sector}</span>}
              {q.industry && <><span>·</span><span>{q.industry}</span></>}
              {q.country && (
                <><span>·</span><Globe size={10} className="inline" /><span>{q.country}</span></>
              )}
            </div>
          </div>

          {/* Right: price */}
          <div className="text-right shrink-0">
            <div className={`font-mono font-bold text-3xl leading-none ${q.regularMarketPrice != null ? priceColor : 'text-t3'}`}>
              {q.regularMarketPrice != null
                ? `${q.currency ? q.currency + ' ' : ''}${fmt(q.regularMarketPrice, 2)}`
                : '—'
              }
            </div>
            {q.regularMarketChange != null && (
              <div className={`flex items-center justify-end gap-1 mt-1.5 ${priceColor}`}>
                <ChangeIcon size={12} strokeWidth={2.5} />
                <span className="font-mono text-xs font-semibold">
                  {isUp ? '+' : ''}{fmt(change, 4)}&nbsp;
                  ({isUp ? '+' : ''}{fmt(changePct, 2)}%)
                </span>
              </div>
            )}
            {q.chartPreviousClose != null && (
              <div className="text-[10px] text-t3 mt-1 font-mono">
                Prev close {q.currency} {fmt(q.chartPreviousClose, 2)}
              </div>
            )}
          </div>
        </div>

        {/* Quick stats row */}
        {(q.regularMarketDayHigh != null || q.regularMarketVolume != null) && (
          <div className="grid grid-cols-4 gap-px mt-4 pt-4 border-t border-rim">
            <StatCell label="Day High"  value={fmt(q.regularMarketDayHigh)} />
            <StatCell label="Day Low"   value={fmt(q.regularMarketDayLow)} />
            <StatCell label="Volume"    value={fmt(q.regularMarketVolume)} />
            <StatCell label="Prev Close" value={fmt(q.chartPreviousClose)} />
          </div>
        )}

        {/* 52-week range bar */}
        {rangePct != null && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-t3 mb-1.5 font-mono">
              <span>52W L {fmt(lo, 2)}</span>
              <span className="text-t2">52-Week Range</span>
              <span>52W H {fmt(hi, 2)}</span>
            </div>
            <div className="relative h-1 rounded-full bg-raised">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-loss via-gold to-gain"
                style={{ width: `${rangePct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-t1 border border-t4 shadow-md"
                style={{ left: `calc(${rangePct}% - 5px)` }}
              />
            </div>
            <div className="text-center text-[10px] text-t3 mt-1.5 font-mono">
              {fmt(cur, 2)} · {rangePct.toFixed(1)}% of range
            </div>
          </div>
        )}
      </div>

      {/* ── Fundamentals grid ── */}
      {hasFund && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FundCard title="Valuation">
            <Row label="Market Cap"   val={money(q.marketCap, q.currency)} />
            <Row label="P/E (TTM)"    val={fmt(q.trailingPE)} />
            <Row label="EPS (TTM)"    val={fmt(q.trailingEps)} />
            <Row label="Beta"         val={fmt(q.beta)} />
            {q.yearlyChangePercent != null && (
              <Row
                label="1-Year Return"
                val={`${q.yearlyChangePercent >= 0 ? '+' : ''}${q.yearlyChangePercent.toFixed(1)}%`}
                highlight={q.yearlyChangePercent >= 0 ? 'buy' : 'sell'}
              />
            )}
          </FundCard>
          <FundCard title="Financials">
            <Row label="Revenue TTM"  val={money(q.revenueTotal, q.currency)} />
            <Row label="Profit Margin" val={pct(q.profitMargin, 100)} />
            <Row label="Op. Margin"   val={pct(q.operatingMargin, 100)} />
            <Row label="ROE"          val={pct(q.returnOnEquity, 100)} />
            <Row label="ROA"          val={pct(q.returnOnAssets, 100)} />
          </FundCard>
          <FundCard title="Dividends & Analyst">
            <Row label="Div. Yield"   val={pct(q.dividendYield, 100)} />
            <Row label="Analyst"      val={fmtRating(q.analystRating)} highlight={fmtRating(q.analystRating)} />
            <Row label="Target Price" val={fmt(q.analystTargetPrice)} />
            <Row label="52W High"     val={fmt(q.fiftyTwoWeekHigh)} />
            <Row label="52W Low"      val={fmt(q.fiftyTwoWeekLow)} />
          </FundCard>
        </div>
      )}

      {/* ── Description ── */}
      {q.description && (
        <div className="panel px-4 py-3">
          <div className="data-label mb-2">About</div>
          <p className="text-xs text-t2 leading-relaxed line-clamp-3">{q.description}</p>
          {q.website && (
            <a
              href={q.website} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-info mt-2 hover:text-info/80 transition-colors"
            >
              <ExternalLink size={10} /> {q.website}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="text-center">
      <div className="data-label">{label}</div>
      <div className="font-mono text-xs font-semibold text-t1 mt-0.5">{value}</div>
    </div>
  );
}

function FundCard({ title, children }) {
  return (
    <div className="panel px-4 py-3">
      <div className="data-label mb-2.5">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, val, highlight }) {
  const h = highlight != null ? String(highlight).toLowerCase() : '';
  const ratingColor = h.includes('buy')  ? 'text-gain'
                    : h.includes('sell') ? 'text-loss'
                    : 'text-t1';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-t3">{label}</span>
      <span className={`font-mono text-xs font-semibold truncate ${ratingColor}`}>{val}</span>
    </div>
  );
}

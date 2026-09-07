import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, Star } from 'lucide-react';
import { streamMarketDashboard } from '../services/claude.js';
import { getFullStockData, buildStubFromMarkets } from '../services/stockData.js';

const MARKETS = [
  { key: 'GSE', label: 'Ghana GSE', flag: '🇬🇭' },
  { key: 'ALL', label: 'All Markets', flag: '🌍' },
  { key: 'NYSE_NASDAQ', label: 'US Markets', flag: '🇺🇸' },
  { key: 'NSE', label: 'Nigeria', flag: '🇳🇬' },
  { key: 'JSE', label: 'South Africa', flag: '🇿🇦' },
];

// How often the dashboard re-scans the market on its own while open.
const REFRESH_MS = 15 * 60 * 1000; // 15 minutes
const STORAGE_PREFIX = 'stockiq_dashboard_v1_';

function loadCached(market) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + market);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveCached(market, text, ts) {
  try {
    localStorage.setItem(STORAGE_PREFIX + market, JSON.stringify({ text, ts }));
  } catch {
    // storage full/unavailable — dashboard still works, just won't persist across reloads
  }
}

// Parses the streamed markdown (## BUY / HOLD / SELL tables + TOP_PICK line)
// into structured buckets. Re-run on every chunk so the UI fills in live.
function parseDashboard(text) {
  const buckets = { BUY: [], HOLD: [], SELL: [] };
  let current = null;
  let topPick = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^##\s*BUY\b/i.test(line)) { current = 'BUY'; continue; }
    if (/^##\s*HOLD\b/i.test(line)) { current = 'HOLD'; continue; }
    if (/^##\s*SELL\b/i.test(line)) { current = 'SELL'; continue; }

    if (/^TOP_PICK:/i.test(line)) {
      const m = line.match(/^TOP_PICK:\s*\[?([A-Z0-9.\-]+)\]?\s*[—\-]*\s*(.*)$/i);
      if (m) topPick = { ticker: m[1], reason: m[2].trim() };
      continue;
    }

    if (!current || !line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (/^ticker$/i.test(cells[0])) continue; // header row
    if (/^-+$/.test(cells[0])) continue;       // separator row

    if (current === 'BUY' && cells.length >= 4) {
      const conviction = parseInt(cells[2], 10);
      buckets.BUY.push({
        ticker: cells[0],
        name: cells[1] || '',
        conviction: Number.isFinite(conviction) ? conviction : null,
        reason: cells[3] || '',
      });
    } else {
      buckets[current].push({ ticker: cells[0], name: cells[1] || '', reason: cells[2] || '' });
    }
  }

  // Apportion a hypothetical buy budget across the BUY list as whole
  // percentage points that always sum to 100 — weighted by each stock's
  // conviction score, falling back to an equal split if scores are missing.
  if (buckets.BUY.length) {
    const hasAllScores = buckets.BUY.every(it => it.conviction != null && it.conviction > 0);
    const weights = hasAllScores ? buckets.BUY.map(it => it.conviction) : buckets.BUY.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const raw = weights.map(w => (w / total) * 100);
    const floored = raw.map(Math.floor);
    const remainder = 100 - floored.reduce((a, b) => a + b, 0);
    const order = raw
      .map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < remainder; i++) floored[order[i][1]]++;
    buckets.BUY.forEach((it, i) => { it.allocation = floored[i]; });
  }

  return { buckets, topPick };
}

function timeAgo(ts, now) {
  if (!ts) return null;
  const s = Math.floor((now - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

const BUCKET_META = {
  BUY:  { label: 'Buy',  icon: TrendingUp,   badge: 'badge-green', dot: 'bg-gain' },
  HOLD: { label: 'Hold', icon: Minus,        badge: 'badge-gold',  dot: 'bg-gold' },
  SELL: { label: 'Sell', icon: TrendingDown, badge: 'badge-red',   dot: 'bg-loss' },
};

export default function Dashboard({ onSelectStock, onLiveUpdate }) {
  const [market, setMarket]       = useState('GSE');
  const [result, setResult]       = useState('');
  const [streaming, setStreaming] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow]             = useState(Date.now());
  const abortRef    = useRef(null);
  const intervalRef = useRef(null);

  const run = useCallback(async (isBackground = false) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStreaming(true);
    if (!isBackground) setResult('');
    let buf = '';

    try {
      await streamMarketDashboard({ market }, (chunk) => {
        buf += chunk;
        setResult(buf);
      }, ctrl.signal);
      if (!ctrl.signal.aborted && buf.trim()) {
        const ts = Date.now();
        setLastUpdated(ts);
        saveCached(market, buf, ts);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !ctrl.signal.aborted && !buf) {
        setResult(`**Error:** ${err.message}\n\nMake sure \`VITE_ANTHROPIC_API_KEY\` is set.`);
      }
    } finally {
      if (!ctrl.signal.aborted) setStreaming(false);
    }
  }, [market]);

  // On mount / market change: show cached result instantly, refresh if stale,
  // then keep re-scanning on an interval for as long as the dashboard is open.
  useEffect(() => {
    const cached = loadCached(market);
    setResult(cached?.text || '');
    setLastUpdated(cached?.ts || null);

    const age = cached ? Date.now() - cached.ts : Infinity;
    if (age > REFRESH_MS) run(false);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => run(true), REFRESH_MS);

    return () => {
      clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  // Tick the clock so "updated Xm ago" / next-refresh countdown stay live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { buckets, topPick } = useMemo(() => parseDashboard(result), [result]);
  const totalRated = buckets.BUY.length + buckets.HOLD.length + buckets.SELL.length;
  const isError = result.trim().startsWith('**Error:**');

  const nextRefreshIn = lastUpdated ? Math.max(0, REFRESH_MS - (now - lastUpdated)) : null;
  const nextRefreshMin = nextRefreshIn != null ? Math.ceil(nextRefreshIn / 60000) : null;

  const openTicker = async (ticker) => {
    if (!onSelectStock) return;
    onSelectStock(ticker, buildStubFromMarkets(ticker));
    try {
      const data = await getFullStockData(ticker);
      onLiveUpdate?.(ticker, data);
    } catch {
      // stub stays in place — stock view handles missing live data gracefully
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 border-b border-rim bg-surface px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h1 className="text-sm font-bold text-t1">Market Dashboard</h1>
              <p className="text-xs text-t3 mt-0.5">
                Every stock rated Buy, Hold, or Sell — refreshes automatically every {REFRESH_MS / 60000} minutes.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-[11px] text-t3 font-mono">
                  Updated {timeAgo(lastUpdated, now)}
                  {!streaming && nextRefreshMin != null && ` · next in ${nextRefreshMin}m`}
                </span>
              )}
              <button
                onClick={() => run(false)}
                disabled={streaming}
                className="btn-ghost text-xs gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {streaming
                  ? <><Loader2 size={12} className="animate-spin-sm" /> Scanning…</>
                  : <><RefreshCw size={12} /> Refresh now</>
                }
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {MARKETS.map(m => (
              <button key={m.key} onClick={() => setMarket(m.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${market === m.key ? 'bg-gain/15 text-gain border border-gain/30' : 'text-t3 border border-rim hover:text-t2 hover:border-rim-hi'}`}>
                <span className="text-xs">{m.flag}</span>{m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-5">

          {!result && streaming && (
            <div className="space-y-3 max-w-md">
              {[70, 90, 55, 80, 65].map((w, i) => (
                <div key={i} className="h-3 rounded bg-raised animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          )}

          {!result && !streaming && (
            <div className="text-xs text-t3 py-10 text-center">No scan yet — click Refresh now.</div>
          )}

          {isError && (
            <div className="panel px-4 py-3 mb-4 border-loss/30 bg-loss/5 text-xs text-t2 whitespace-pre-wrap">
              {result.replace(/^\*\*Error:\*\*\s*/, '')}
            </div>
          )}

          {topPick && (
            <div className="panel px-4 py-3 mb-4 flex items-center gap-3 border-gold/30 bg-gold/5">
              <Star size={16} className="text-gold shrink-0" />
              <div className="min-w-0 text-xs">
                <span className="font-semibold text-t1">Top pick: </span>
                <button
                  onClick={() => openTicker(topPick.ticker)}
                  className="font-mono font-semibold text-gold hover:underline cursor-pointer"
                >
                  {topPick.ticker}
                </button>
                <span className="text-t2"> — {topPick.reason}</span>
              </div>
            </div>
          )}

          {totalRated > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['BUY', 'HOLD', 'SELL'].map((key) => {
                const meta = BUCKET_META[key];
                const Icon = meta.icon;
                const items = buckets[key];
                return (
                  <div key={key} className="panel overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-rim flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Icon size={13} className={meta.badge.includes('green') ? 'text-gain' : meta.badge.includes('gold') ? 'text-gold' : 'text-loss'} />
                        <span className="text-xs font-semibold text-t1">{meta.label}</span>
                        {key === 'BUY' && items.length > 0 && (
                          <span className="text-[10px] text-t3 font-normal">· suggested split</span>
                        )}
                      </div>
                      <span className={`badge ${meta.badge} text-[10px]`}>{items.length}</span>
                    </div>
                    <div className="divide-y divide-rim max-h-[520px] overflow-y-auto">
                      {items.length === 0 && streaming && (
                        <div className="px-3 py-3 text-[11px] text-t3">Rating…</div>
                      )}
                      {items.map((it, i) => (
                        <button
                          key={`${it.ticker}-${i}`}
                          onClick={() => openTicker(it.ticker)}
                          className="w-full text-left px-3 py-2.5 hover:bg-raised transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                            <span className="font-mono text-xs font-semibold text-t1">{it.ticker.split('.')[0]}</span>
                            <span className="text-[11px] text-t3 truncate flex-1">{it.name}</span>
                            {key === 'BUY' && it.allocation != null && (
                              <span className="font-mono text-[11px] font-semibold text-gain shrink-0">{it.allocation}%</span>
                            )}
                          </div>
                          {key === 'BUY' && it.allocation != null && (
                            <div className="h-1 rounded-full bg-raised mt-1.5 ml-3.5 overflow-hidden">
                              <div className="h-full bg-gain/60 rounded-full" style={{ width: `${it.allocation}%` }} />
                            </div>
                          )}
                          {it.reason && (
                            <div className="text-[11px] text-t3 mt-1 pl-3.5 leading-snug">{it.reason}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

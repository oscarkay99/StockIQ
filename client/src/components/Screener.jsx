import { useState, useRef } from 'react';
import { Search, Loader2, X, Sparkles, Play, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { streamScreener } from '../services/claude.js';

const MARKETS = [
  { key: 'ALL',        label: 'All Markets', flag: '🌍' },
  { key: 'GSE',        label: 'Ghana GSE',   flag: '🇬🇭' },
  { key: 'NYSE_NASDAQ',label: 'US Markets',  flag: '🇺🇸' },
  { key: 'NSE',        label: 'Nigeria',     flag: '🇳🇬' },
  { key: 'JSE',        label: 'South Africa',flag: '🇿🇦' },
];

const TYPES = [
  { key: 'ANY',       label: 'Any Type'   },
  { key: 'DIVIDEND',  label: 'Dividend'   },
  { key: 'GROWTH',    label: 'Growth'     },
  { key: 'VALUE',     label: 'Value'      },
  { key: 'BUY_NOW',   label: 'Buy Now'    },
  { key: 'LOW_RISK',  label: 'Low Risk'   },
];

const EXAMPLES = [
  'Best dividend stocks on Ghana GSE',
  'Undervalued banking stocks in Africa',
  'US tech stocks with strong growth and fair valuation',
  'Nigerian stocks that pay regular dividends',
  'Low-risk blue chip stocks across all markets',
  'Ghana stocks with dividend yield above 4%',
  'South African gold mining stocks',
  'Best stocks to buy under $50 on NYSE',
];

export default function Screener({ onSelectStock }) {
  const [query, setQuery]       = useState('');
  const [market, setMarket]     = useState('ALL');
  const [type, setType]         = useState('ANY');
  const [result, setResult]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [hasRun, setHasRun]     = useState(false);
  const abortRef = useRef(null);

  const run = async () => {
    if (!query.trim() || streaming) return;
    if (abortRef.current) abortRef.current.abort();

    setStreaming(true);
    setResult('');
    setHasRun(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamScreener(
        { query: query.trim(), market, type },
        (chunk) => setResult(p => p + chunk),
        ctrl.signal,
      );
    } catch (err) {
      if (err.name !== 'AbortError' && !ctrl.signal.aborted) {
        setResult(`**Error:** ${err.message}\n\nMake sure \`VITE_ANTHROPIC_API_KEY\` is set.`);
      }
    } finally {
      setStreaming(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header bar ── */}
      <div className="flex-shrink-0 border-b border-rim bg-surface px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-violet" />
            <span className="text-sm font-bold text-t1">Stock Screener</span>
            <span className="badge badge-purple text-[10px]">AI-Powered</span>
          </div>
          <p className="text-xs text-t3 mb-4">
            Describe what you're looking for in plain English — dividends, growth, value, sector, market — and get personalized stock picks.
          </p>

          {/* Query input */}
          <div className="relative mb-3">
            <div className="flex items-start gap-2 bg-card border border-rim rounded-xl px-4 py-3 focus-within:border-violet/50 transition-colors">
              <Search size={14} className="text-t3 mt-0.5 shrink-0" />
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="e.g. Best dividend stocks on Ghana GSE with yield above 4%…"
                rows={2}
                className="flex-1 bg-transparent text-t1 text-sm placeholder-t3 outline-none resize-none leading-relaxed"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-t3 hover:text-t1 transition-colors cursor-pointer mt-0.5">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-t3 uppercase tracking-wider mr-0.5">Market:</span>
              {MARKETS.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMarket(m.key)}
                  className={`
                    flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer
                    ${market === m.key
                      ? 'bg-violet/15 text-violet border border-violet/30'
                      : 'text-t3 border border-rim hover:text-t2 hover:border-rim-hi'
                    }
                  `}
                >
                  <span className="text-xs">{m.flag}</span>
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-t3 uppercase tracking-wider mr-0.5">Type:</span>
              {TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`
                    px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer border
                    ${type === t.key
                      ? 'bg-violet/15 text-violet border-violet/30'
                      : 'text-t3 border-rim hover:text-t2 hover:border-rim-hi'
                    }
                  `}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2">
            <button
              onClick={run}
              disabled={!query.trim() || streaming}
              className="btn-primary bg-violet hover:bg-violet/80 disabled:opacity-40 disabled:cursor-not-allowed gap-2"
            >
              {streaming
                ? <><Loader2 size={13} className="animate-spin-sm" /> Screening…</>
                : hasRun
                  ? <><RefreshCw size={13} /> Re-run Screener</>
                  : <><Play size={13} /> Find Stocks</>
              }
            </button>
            {streaming && (
              <button
                onClick={() => abortRef.current?.abort()}
                className="btn-ghost text-xs text-t3 gap-1"
              >
                <X size={11} /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-y-auto">
        {!hasRun && (
          <div className="max-w-3xl mx-auto px-6 py-8">
            <div className="text-[10px] font-semibold text-t3 uppercase tracking-widest mb-3">
              Example queries
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  onClick={() => setQuery(ex)}
                  className="text-xs text-t3 bg-card border border-rim px-3 py-1.5 rounded-lg hover:bg-raised hover:text-t2 hover:border-rim-hi transition-colors cursor-pointer text-left"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasRun && (
          <div className="max-w-3xl mx-auto px-6 py-5">
            {/* Skeleton while streaming and no content yet */}
            {streaming && !result && (
              <div className="space-y-3">
                {[70, 90, 55, 80, 65].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-raised animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
            {result && (
              <div className="prose-analysis animate-slide-in">
                <ReactMarkdown>{result}</ReactMarkdown>
                {streaming && <span className="cursor-blink" />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, ChevronDown, Loader2, Play, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { streamAnalysis } from '../services/claude.js';

const TABS = [
  { key: 'trade_signal',    label: 'Trade Signal',   short: 'Signal'   },
  { key: 'fundamental',    label: 'Fundamental',    short: 'Fund.'    },
  { key: 'technical',      label: 'Technical',      short: 'Tech.'    },
  { key: 'dividend_analysis', label: 'Dividends',   short: 'Divid.'   },
  { key: 'portfolio',      label: 'Portfolio',      short: 'Port.'    },
  { key: 'strategies',     label: 'Strategies',     short: 'Strat.'   },
  { key: 'trends',         label: 'Trends',         short: 'Trends'   },
  { key: 'sector',         label: 'Sector',         short: 'Sector'   },
  { key: 'risk',           label: 'Risk',           short: 'Risk'     },
  { key: 'results',        label: 'Results',        short: 'Results'  },
  { key: 'growth_dividend',label: 'Growth/Div',     short: 'G/D'      },
  { key: 'world_events',   label: 'World Events',   short: 'Global'   },
];

// Parse the ===SIGNAL=== block that Claude outputs at the top of trade_signal responses
function parseSignalBlock(text) {
  const match = text.match(/===SIGNAL===([\s\S]*?)===END===/);
  if (!match) return null;
  const sig = {};
  for (const line of match[1].trim().split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const k = line.slice(0, colon).trim();
    const v = line.slice(colon + 1).trim();
    if (k) sig[k] = v;
  }
  return sig.VERDICT ? sig : null;
}

function PillarBar({ label, score }) {
  const s = parseInt(score) || 0;
  const color = s >= 7 ? 'bg-gain' : s >= 5 ? 'bg-gold' : 'bg-loss';
  const textColor = s >= 7 ? 'text-gain' : s >= 5 ? 'text-gold' : 'text-loss';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-t3 uppercase tracking-wider">{label}</span>
        <span className={`text-[11px] font-bold font-mono ${textColor}`}>{s}/10</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${s * 10}%` }} />
      </div>
    </div>
  );
}

function SignalCard({ sig, streaming, isAiOnly }) {
  const verdict = sig.VERDICT || 'HOLD';
  const conf    = sig.CONFIDENCE || 'MEDIUM';
  const cur     = sig.CURRENCY || '';
  const score   = parseInt(sig.SIGNAL_SCORE) || 0;
  const rr      = parseFloat(sig.RISK_REWARD) || 0;
  const horizon = sig.TIME_HORIZON || '';

  const isB = verdict === 'BUY';
  const isS = verdict === 'SELL';

  const verdictColor = isB ? 'text-gain' : isS ? 'text-loss' : 'text-gold';
  const verdictBg    = isB ? 'bg-gain/10 border-gain/30' : isS ? 'bg-loss/10 border-loss/30' : 'bg-gold/10 border-gold/30';
  const confColor    = conf === 'HIGH' ? 'badge-green' : conf === 'LOW' ? 'badge-red' : 'badge-gold';
  const scoreColor   = score >= 72 ? 'text-gain' : score >= 50 ? 'text-gold' : 'text-loss';
  const scoreBarColor = score >= 72 ? 'bg-gain' : score >= 50 ? 'bg-gold' : 'bg-loss';
  const rrColor      = rr >= 2.5 ? 'text-gain' : rr >= 1.5 ? 'text-gold' : 'text-loss';
  const Icon = isB ? TrendingUp : isS ? TrendingDown : Minus;

  const fmt = (v) => (v && v !== '0.00' && v !== '0.0' && v !== '0') ? `${cur} ${parseFloat(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const upPct = sig.UPSIDE_PCT && sig.UPSIDE_PCT !== '0.0' && sig.UPSIDE_PCT !== '0' ? `${parseFloat(sig.UPSIDE_PCT) > 0 ? '+' : ''}${sig.UPSIDE_PCT}%` : null;

  return (
    <div className={`mx-5 mt-5 mb-1 rounded-xl border p-4 ${verdictBg}`}>
      {/* Verdict row */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isB ? 'bg-gain/15' : isS ? 'bg-loss/15' : 'bg-gold/15'}`}>
            <Icon size={22} className={verdictColor} strokeWidth={2.5} />
          </div>
          <div>
            <div className={`text-2xl font-black tracking-tight leading-none ${verdictColor}`}>{verdict}</div>
            <div className="text-[11px] text-t3 mt-0.5">AI Trade Signal</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${confColor} text-[11px] font-semibold`}>{conf} confidence</span>
          {horizon && (
            <span className="badge badge-gold text-[11px] font-semibold">{horizon}</span>
          )}
          {upPct && (
            <span className={`badge font-mono text-[11px] ${parseFloat(sig.UPSIDE_PCT) >= 0 ? 'badge-green' : 'badge-red'}`}>
              {upPct} (12M)
            </span>
          )}
          {isAiOnly && (
            <span className="badge text-[10px] font-semibold" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
              AI Est. prices
            </span>
          )}
          {streaming && <Loader2 size={12} className="text-t3 animate-spin-sm" />}
        </div>
      </div>

      {/* Signal score bar */}
      {score > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-t3 uppercase tracking-wider">Signal Score</span>
            <div className="flex items-center gap-2">
              {rr > 0 && (
                <span className={`text-[10px] font-mono font-semibold ${rrColor}`}>R:R {rr.toFixed(1)}:1</span>
              )}
              <span className={`text-sm font-black font-mono ${scoreColor}`}>{score}<span className="text-[10px] font-normal text-t3">/100</span></span>
            </div>
          </div>
          <div className="h-2 bg-surface rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all duration-700 ${scoreBarColor}`} style={{ width: `${score}%` }} />
          </div>
          {/* Pillar scores */}
          <div className="grid grid-cols-3 gap-3">
            <PillarBar label="Technical" score={sig.TECH_SCORE} />
            <PillarBar label="Fundamental" score={sig.FUND_SCORE} />
            <PillarBar label="Momentum" score={sig.MOM_SCORE} />
          </div>
        </div>
      )}

      {/* Price levels grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <LevelCell label="Entry Zone"    value={`${fmt(sig.ENTRY_LOW)} – ${fmt(sig.ENTRY_HIGH)}`} color="text-info"  />
        <LevelCell label="Target 1M"     value={fmt(sig.TARGET_1M)}   color="text-gain" />
        <LevelCell label="Target 3M"     value={fmt(sig.TARGET_3M)}   color="text-gain" />
        <LevelCell label="Target 12M"    value={fmt(sig.TARGET_12M)}  color="text-gain" />
        <LevelCell label="Stop-Loss"     value={fmt(sig.STOP_LOSS)}   color="text-loss" />
      </div>
    </div>
  );
}

function LevelCell({ label, value, color }) {
  return (
    <div className="bg-surface/60 rounded-lg px-3 py-2 text-center">
      <div className="text-[9px] text-t3 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[11px] font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function AnalysisHub({ ticker, stockData }) {
  const [active, setActive]       = useState('trade_signal');
  const [results, setResults]     = useState({});
  const [streaming, setStreaming] = useState(false);
  const [extraCtx, setExtraCtx]   = useState('');
  const [showCtx, setShowCtx]     = useState(false);
  const abortRef  = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => { setResults({}); setActive('trade_signal'); }, [ticker]);

  useEffect(() => {
    if (streaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [results[active], streaming]);

  const run = async (type = active) => {
    if (streaming) abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStreaming(true);
    setResults(p => ({ ...p, [type]: '' }));

    try {
      await streamAnalysis(
        type,
        stockData,
        extraCtx,
        (chunk) => setResults(p => ({ ...p, [type]: (p[type] || '') + chunk })),
        ctrl.signal,
      );
    } catch (err) {
      if (err.name !== 'AbortError' && !ctrl.signal.aborted) {
        setResults(p => ({
          ...p,
          [type]: `**Error:** ${err.message}\n\nMake sure \`VITE_ANTHROPIC_API_KEY\` is set.`,
        }));
      }
    } finally {
      setStreaming(false);
    }
  };

  const switchTab = (key) => {
    setActive(key);
    if (!results[key]) run(key);
  };

  const current = results[active] || '';
  const hasContent = Boolean(current);

  // Trade signal special rendering
  const isSignalTab = active === 'trade_signal';
  const signalData  = isSignalTab && hasContent ? parseSignalBlock(current) : null;
  // Strip the signal block from the markdown body
  const analysisBody = signalData
    ? current.replace(/===SIGNAL===[\s\S]*?===END===\n*/m, '').trim()
    : current;

  return (
    <div className="panel overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-0 border-b border-rim">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-gain" />
            <span className="text-xs font-semibold text-t1">AI Research</span>
            <span className="badge badge-green font-mono text-[10px]">{ticker}</span>
            {streaming && (
              <span className="flex items-center gap-1 text-[10px] text-gain">
                <Loader2 size={10} className="animate-spin-sm" />
                Analyzing…
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowCtx(v => !v)}
              className="btn-ghost text-[11px] gap-1"
            >
              Context
              <ChevronDown size={11} className={`transition-transform ${showCtx ? 'rotate-180' : ''}`} />
            </button>
            {hasContent && (
              <button onClick={() => run()} disabled={streaming} className="btn-ghost text-[11px] gap-1">
                <RefreshCw size={11} className={streaming ? 'animate-spin-sm' : ''} />
                Refresh
              </button>
            )}
          </div>
        </div>

        {showCtx && (
          <div className="mb-2">
            <textarea
              value={extraCtx}
              onChange={e => setExtraCtx(e.target.value)}
              placeholder="Add context — e.g. 'Focus on Ghana IMF program impact' or 'I want high-dividend income stocks only'…"
              rows={2}
              className="w-full bg-card border border-rim rounded-lg px-3 py-2 text-xs text-t1 placeholder-t3 outline-none resize-none focus:border-gain/50 transition-colors"
            />
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0 overflow-x-auto no-scrollbar -mb-px">
          {TABS.map((t) => {
            const isActive = active === t.key;
            const isDone   = Boolean(results[t.key]);
            const isSignal = t.key === 'trade_signal';
            return (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`
                  relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap
                  border-b-2 transition-all duration-150 cursor-pointer
                  ${isActive
                    ? isSignal ? 'border-gold text-gold' : 'border-gain text-gain'
                    : 'border-transparent text-t3 hover:text-t2 hover:border-rim-hi'
                  }
                `}
              >
                {t.label}
                {isDone && !isActive && (
                  <span className={`w-1 h-1 rounded-full shrink-0 ${isSignal ? 'bg-gold/60' : 'bg-gain/60'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative">
        {/* Empty: prompt to generate */}
        {!hasContent && !streaming && (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${isSignalTab ? 'bg-gold/10 border-gold/20' : 'bg-gain/10 border-gain/20'}`}>
              {isSignalTab
                ? <TrendingUp size={20} className="text-gold" />
                : <Sparkles size={20} className="text-gain" />
              }
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-t1 mb-1">
                {TABS.find(t => t.key === active)?.label}
              </div>
              <div className="text-xs text-t3 max-w-xs">
                {isSignalTab
                  ? `Get an AI trade signal with BUY/SELL/HOLD verdict and price targets for `
                  : `Generate AI-powered analysis for `
                }
                <span className="font-mono text-gain">{ticker}</span>
              </div>
            </div>
            <button onClick={() => run()} className={`btn-primary ${isSignalTab ? 'bg-gold text-base hover:bg-gold/90' : ''}`}>
              <Play size={13} />
              {isSignalTab ? 'Generate Signal' : 'Generate Analysis'}
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {streaming && !hasContent && (
          <div className="p-6 space-y-3">
            {[80, 60, 90, 50, 70].map((w, i) => (
              <div
                key={i}
                className="h-3 rounded bg-raised animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}

        {/* Signal card (trade_signal tab) */}
        {isSignalTab && (signalData || (streaming && hasContent)) && (
          <SignalCard sig={signalData || {}} streaming={streaming} isAiOnly={!stockData?.liveData} />
        )}

        {/* Analysis markdown body */}
        {hasContent && analysisBody && (
          <div className="p-5 prose-analysis animate-slide-in">
            <ReactMarkdown>{analysisBody}</ReactMarkdown>
            {streaming && <span className="cursor-blink" />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}

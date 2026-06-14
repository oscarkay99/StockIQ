import { useState, useRef, useEffect } from 'react';
import { Menu, TrendingUp, Search, Loader2, X, Wifi, ScanSearch } from 'lucide-react';
import { searchStocks, getFullStockData } from '../services/stockData.js';

export default function Header({ sidebarOpen, onToggleSidebar, onSelectStock, view, onSetView }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(false);
  const debounce = useRef(null);
  const wrapRef  = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const search = (val) => {
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (!val.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(() => {
      setLoading(true);
      try {
        const matches = searchStocks(val.trim());
        setResults(matches);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 220);
  };

  const loadStock = async (ticker) => {
    setOpen(false); setQuery(ticker); setFetching(true);
    try {
      const data = await getFullStockData(ticker);
      onSelectStock(ticker, data);
    } catch (err) {
      alert(`Could not load "${ticker}": ${err.message}`);
    } finally { setFetching(false); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) loadStock(query.trim().toUpperCase());
  };

  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const isScreener = view === 'screener';

  return (
    <header className="flex-shrink-0 h-12 flex items-center gap-3 px-4 bg-surface border-b border-rim z-40">
      {/* Logo + toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-t3 hover:text-t1 hover:bg-raised transition-colors cursor-pointer"
          aria-label="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-md bg-gain flex items-center justify-center">
            <TrendingUp size={13} className="text-base" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-t1 text-[15px] tracking-tight">
            Stock<span className="text-gain">IQ</span>
          </span>
        </div>
      </div>

      {/* Nav pill — Stocks / Screener */}
      <div className="flex items-center gap-px bg-card border border-rim rounded-lg p-0.5 flex-shrink-0">
        <button
          onClick={() => onSetView('stocks')}
          className={`
            flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer
            ${!isScreener ? 'bg-raised text-t1' : 'text-t3 hover:text-t2'}
          `}
        >
          Stocks
        </button>
        <button
          onClick={() => onSetView('screener')}
          className={`
            flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer
            ${isScreener ? 'bg-violet/20 text-violet' : 'text-t3 hover:text-t2'}
          `}
        >
          <ScanSearch size={11} />
          Screener
        </button>
      </div>

      {/* Search — center */}
      <div ref={wrapRef} className="flex-1 max-w-xl mx-auto relative">
        <div className="flex items-center gap-2 bg-card border border-rim rounded-lg px-3 py-1.5 hover:border-rim-hi focus-within:border-gain/50 transition-colors">
          {fetching
            ? <Loader2 size={13} className="text-gain animate-spin-sm shrink-0" />
            : <Search size={13} className="text-t3 shrink-0" />
          }
          <input
            value={query}
            onChange={e => search(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search ticker or company — e.g. AAPL, GCB, Dangote…"
            className="flex-1 bg-transparent text-t1 text-xs placeholder-t3 outline-none min-w-0"
          />
          {loading && <Loader2 size={11} className="text-t3 animate-spin-sm shrink-0" />}
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="text-t3 hover:text-t1 transition-colors cursor-pointer">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-raised border border-rim rounded-xl overflow-hidden shadow-2xl z-50 animate-slide-in">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => loadStock(r.symbol)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-card transition-colors cursor-pointer border-b border-rim last:border-0 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-semibold text-gain text-xs shrink-0">{r.symbol.split('.')[0]}</span>
                  <span className="text-t2 text-xs truncate">{r.longname || r.shortname}</span>
                </div>
                {r.exchDisp && (
                  <span className="badge badge-muted shrink-0 ml-2 text-[10px]">{r.exchDisp.split(' ')[0]}</span>
                )}
              </button>
            ))}
            <div className="px-3 py-1.5 text-[10px] text-t3 bg-surface border-t border-rim">
              Press Enter to look up any ticker directly
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gain opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-gain" />
          </span>
          <span className="text-[11px] text-t2 font-medium">Live</span>
        </div>
        <div className="hidden md:flex items-center gap-1 font-mono text-[11px] text-t3">
          <Wifi size={11} className="text-t3" />
          <span>{time}</span>
        </div>
      </div>
    </header>
  );
}

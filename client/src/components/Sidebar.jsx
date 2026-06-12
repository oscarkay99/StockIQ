import { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import STATIC_MARKETS from '../data/markets.json';

const MARKET_FLAGS = { GSE: '🇬🇭', NYSE_NASDAQ: '🇺🇸', NSE: '🇳🇬', JSE: '🇿🇦' };

export default function Sidebar({ onSelectStock, activeTicker }) {
  const [markets, setMarkets]   = useState(STATIC_MARKETS);
  const [expanded, setExpanded] = useState({ GSE: true });
  const [loading, setLoading]   = useState({});

  useEffect(() => {
    axios.get('/api/stocks/markets').then(r => setMarkets(r.data)).catch(() => {});
  }, []);

  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const pick = async (stock) => {
    setLoading(p => ({ ...p, [stock.ticker]: true }));
    try {
      const res = await axios.get(`/api/stocks/quote/${encodeURIComponent(stock.ticker)}`);
      onSelectStock(stock.ticker, res.data);
    } catch {
      onSelectStock(stock.ticker, { quote: { symbol: stock.ticker, longName: stock.name, dataSource: 'ai-only' }, summary: null, liveData: false });
    } finally {
      setLoading(p => ({ ...p, [stock.ticker]: false }));
    }
  };

  return (
    <nav className="py-3 min-w-0">
      <div className="px-4 pb-2 pt-1">
        <span className="text-[10px] font-semibold text-t3 uppercase tracking-widest">Markets</span>
      </div>

      {Object.entries(markets).map(([key, market]) => {
        const isOpen = !!expanded[key];
        return (
          <div key={key}>
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-raised transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm leading-none">{MARKET_FLAGS[key] || '🌍'}</span>
                <div className="min-w-0 text-left">
                  <div className="text-xs font-semibold text-t1 truncate">{key}</div>
                  <div className="text-[10px] text-t3 truncate leading-tight mt-0.5">
                    {market.currency} · {market.stocks.length} stocks
                  </div>
                </div>
              </div>
              <span className="text-t3 shrink-0 ml-1">
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            </button>

            {isOpen && (
              <div className="pb-2">
                {market.stocks.map((stock) => {
                  const isActive = activeTicker === stock.ticker;
                  return (
                    <button
                      key={stock.ticker}
                      onClick={() => pick(stock)}
                      disabled={loading[stock.ticker]}
                      className={`
                        w-full flex items-center justify-between pl-9 pr-4 py-1.5
                        transition-colors cursor-pointer text-left group
                        ${isActive ? 'bg-gain/10 border-l-2 border-gain' : 'hover:bg-raised border-l-2 border-transparent'}
                      `}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-xs font-semibold ${isActive ? 'text-gain' : 'text-t2 group-hover:text-t1'} transition-colors`}>
                            {stock.ticker.split('.')[0]}
                          </span>
                          {loading[stock.ticker] && <Loader2 size={9} className="animate-spin-sm text-t3" />}
                        </div>
                        <div className="text-[10px] text-t3 truncate leading-tight">{stock.name}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

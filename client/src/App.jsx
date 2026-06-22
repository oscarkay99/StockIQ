import { useState, useCallback } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import StockSearch from './components/StockSearch.jsx';
import StockOverview from './components/StockOverview.jsx';
import AnalysisHub from './components/AnalysisHub.jsx';
import EmptyState from './components/EmptyState.jsx';
import Screener from './components/Screener.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

export default function App() {
  const [selected, setSelected] = useState(null);   // { ticker, data }
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState('stocks');        // 'stocks' | 'screener'

  // New stock selected (shows instantly with stub data)
  const handleSelect = useCallback((ticker, data) => {
    setSelected({ ticker, data });
    setView('stocks');
  }, []);

  // Live data arrived in background — only apply if ticker is still active
  const handleLiveUpdate = useCallback((ticker, data) => {
    setSelected(prev => prev?.ticker === ticker ? { ticker, data } : prev);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-base overflow-hidden">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onSelectStock={handleSelect}
        onLiveUpdate={handleLiveUpdate}
        view={view}
        onSetView={setView}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
            flex-shrink-0 overflow-y-auto bg-surface border-r border-rim
            transition-all duration-200 ease-in-out
            ${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'}
          `}
        >
          <Sidebar onSelectStock={handleSelect} onLiveUpdate={handleLiveUpdate} activeTicker={selected?.ticker} />
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {view === 'screener' ? (
            <Screener onSelectStock={handleSelect} />
          ) : selected ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 max-w-5xl mx-auto w-full">
              <ErrorBoundary key={`ov-${selected.ticker}`}>
                <StockOverview ticker={selected.ticker} stockData={selected.data} />
              </ErrorBoundary>
              <ErrorBoundary key={`hub-${selected.ticker}`}>
                <AnalysisHub ticker={selected.ticker} stockData={selected.data} />
              </ErrorBoundary>
            </div>
          ) : (
            <EmptyState onOpenScreener={() => setView('screener')} />
          )}
        </main>
      </div>
    </div>
  );
}

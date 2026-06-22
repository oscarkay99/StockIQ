import MARKETS from '../data/markets.json';

const PROXY = 'https://corsproxy.io/?url=';
const cache = new Map();
const TTL = 5 * 60 * 1000;

function fromCache(key) {
  const e = cache.get(key);
  return e && Date.now() - e.ts < TTL ? e.data : null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ── GSE Live Data (Mula DataHub API) ────────────────────────────────────────

const MULA_BASE = 'https://gse-service.mulatechnologies.com/api/v1';


async function getGseStockData(ticker) {
  const symbol = ticker.replace(/\.GH$/i, '');

  // Fetch live data and full 1-year daily history in parallel
  const [liveRes, histRes] = await Promise.all([
    fetch(PROXY + encodeURIComponent(`${MULA_BASE}/stocks/${symbol}`)).then(r => r.json()),
    fetch(PROXY + encodeURIComponent(`${MULA_BASE}/stocks/${symbol}/history?range=1y`)).then(r => r.json()),
  ]);

  if (!liveRes.success) throw new Error(`Mula API: ${liveRes.error?.message}`);

  const s         = liveRes.data;
  const equity    = (histRes.success ? histRes.data?.equity : null) || s.equity || {};
  const co        = equity.company || {};
  const snapshots = histRes.success ? (histRes.data?.snapshots || []) : [];

  const price     = s.price ?? null;
  const change    = s.change ?? null;
  const prevClose = price != null && change != null ? price - change : null;
  const changePct = prevClose && prevClose !== 0 ? change / prevClose : null;

  // True 52-week high/low from daily snapshots
  const prices52W = snapshots.map(x => x.price).filter(Boolean);
  if (price != null) prices52W.push(price);
  const fiftyTwoWeekHigh = prices52W.length ? Math.max(...prices52W) : null;
  const fiftyTwoWeekLow  = prices52W.length ? Math.min(...prices52W) : null;

  // 1-year momentum: compare first snapshot price to current
  const firstSnap    = snapshots[0];
  const yearlyOpenPrice     = firstSnap?.price ?? null;
  const yearlyChangePercent = yearlyOpenPrice && price
    ? ((price - yearlyOpenPrice) / yearlyOpenPrice) * 100 : null;

  // 30-day momentum: last 30 snapshots
  const recent30 = snapshots.slice(-30);
  const recent30First = recent30[0]?.price ?? null;
  const momentum30Pct = recent30First && price
    ? ((price - recent30First) / recent30First) * 100 : null;

  const trailingEps   = equity.eps ?? null;
  const trailingPE    = trailingEps && price ? price / trailingEps : null;
  const dividendYield = equity.dps && price ? equity.dps / price : null;

  // Name/sector from API, fallback to markets.json
  let longName = co.name || symbol;
  let sector   = co.sector || null;
  let industry = co.industry || null;
  for (const [, mkt] of Object.entries(MARKETS)) {
    const found = mkt.stocks.find(x => x.ticker === ticker);
    if (found) {
      if (!longName || longName === symbol) longName = found.name;
      if (!sector) sector = found.sector;
      break;
    }
  }

  return {
    quote: {
      symbol: ticker,
      longName,
      shortName: longName,
      currency: 'GHS',
      exchange: 'Ghana Stock Exchange',
      fullExchangeName: 'Ghana Stock Exchange',
      sector,
      industry,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePct,
      regularMarketDayHigh: null,
      regularMarketDayLow: null,
      regularMarketVolume: s.volume ?? null,
      chartPreviousClose: prevClose,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      marketCap: equity.capital ?? null,
      trailingEps,
      trailingPE,
      dividendYield,
      bidPrice: s.bidPrice ?? null,
      askPrice: s.askPrice ?? null,
      yearlyChangePercent,
      yearlyOpenPrice,
      momentum30Pct,
      dataSource: 'mula-api',
    },
    summary: null,
    liveData: true,
  };
}

// ── Yahoo Finance ────────────────────────────────────────────────────────────

async function getYahooStockData(ticker) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d&includePrePost=false`;
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('no price');

  return {
    quote: {
      symbol: ticker,
      longName: meta.longName || meta.shortName || ticker,
      shortName: meta.shortName || ticker,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || '',
      fullExchangeName: meta.fullExchangeName || meta.exchangeName || '',
      regularMarketPrice: meta.regularMarketPrice ?? null,
      regularMarketChange: meta.regularMarketPrice != null && meta.chartPreviousClose != null
        ? meta.regularMarketPrice - meta.chartPreviousClose : null,
      regularMarketChangePercent: meta.regularMarketPrice != null && meta.chartPreviousClose != null
        ? (meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose : null,
      regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
      regularMarketDayLow: meta.regularMarketDayLow ?? null,
      regularMarketVolume: meta.regularMarketVolume ?? null,
      chartPreviousClose: meta.chartPreviousClose ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      dataSource: 'yahoo',
    },
    summary: null,
    liveData: true,
  };
}

// ── Fallback stub ────────────────────────────────────────────────────────────

function aiOnlyStub(ticker) {
  let longName = ticker, sector = null, currency = null, exchange = null;
  for (const [, mkt] of Object.entries(MARKETS)) {
    const found = mkt.stocks.find(s => s.ticker === ticker);
    if (found) {
      longName = found.name;
      sector   = found.sector;
      currency = mkt.currency;
      exchange = mkt.name;
      break;
    }
  }
  return {
    quote: {
      symbol: ticker,
      longName,
      shortName: longName,
      sector,
      currency,
      exchange,
      fullExchangeName: exchange,
      dataSource: 'ai-only',
    },
    summary: null,
    liveData: false,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function buildStubFromMarkets(ticker) {
  let longName = ticker, sector = null, currency = null, exchange = null;
  for (const [, mkt] of Object.entries(MARKETS)) {
    const found = mkt.stocks.find(s => s.ticker === ticker);
    if (found) {
      longName = found.name;
      sector   = found.sector;
      currency = mkt.currency;
      exchange = mkt.name;
      break;
    }
  }
  return {
    quote: { symbol: ticker, longName, shortName: longName, sector, currency, exchange, fullExchangeName: exchange, dataSource: 'loading' },
    summary: null,
    liveData: false,
  };
}

export async function getFullStockData(ticker) {
  const key = `full:${ticker}`;
  const cached = fromCache(key);
  if (cached) return cached;

  const isGse = /\.GH$/i.test(ticker);

  try {
    const result = isGse
      ? await getGseStockData(ticker)
      : await getYahooStockData(ticker);
    setCache(key, result);
    return result;
  } catch {
    const result = aiOnlyStub(ticker);
    setCache(key, result);
    return result;
  }
}

export function searchStocks(query) {
  const q = query.toLowerCase().trim();
  const matches = [];
  const seen = new Set();

  for (const [, market] of Object.entries(MARKETS)) {
    for (const stock of market.stocks) {
      if (stock.ticker.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q)) {
        if (!seen.has(stock.ticker)) {
          seen.add(stock.ticker);
          matches.push({
            symbol: stock.ticker,
            longname: stock.name,
            shortname: stock.name,
            exchDisp: market.name,
            sector: stock.sector,
          });
        }
      }
    }
  }

  if (matches.length === 0) {
    matches.push({
      symbol: query.toUpperCase(),
      longname: `Look up "${query.toUpperCase()}" directly`,
      shortname: query.toUpperCase(),
      exchDisp: 'Direct lookup',
    });
  }

  return matches.slice(0, 8);
}

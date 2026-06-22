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

// ── GSE Live Data (dev.kwayisi.org) ─────────────────────────────────────────

let gseLiveSnapshot = null;
let gseLiveTs = 0;

async function fetchGseLive() {
  if (gseLiveSnapshot && Date.now() - gseLiveTs < TTL) return gseLiveSnapshot;
  const url = 'https://dev.kwayisi.org/apis/gse/live';
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`GSE live HTTP ${res.status}`);
  gseLiveSnapshot = await res.json(); // array of { name, price, change, volume }
  gseLiveTs = Date.now();
  return gseLiveSnapshot;
}

async function fetchGseEquity(symbol) {
  const url = `https://dev.kwayisi.org/apis/gse/equities/${symbol}`;
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`GSE equity HTTP ${res.status}`);
  return res.json();
}

async function getGseStockData(ticker) {
  const symbol = ticker.replace(/\.GH$/i, '');
  const [liveList, equity] = await Promise.all([fetchGseLive(), fetchGseEquity(symbol)]);
  const live = liveList.find(s => s.name === symbol) || {};

  const price    = equity.price ?? live.price ?? null;
  const change   = live.change ?? null;
  const prevClose = price != null && change != null ? price - change : null;
  const changePct = prevClose ? change / prevClose : null;

  // Dividend yield from dps/price
  const dividendYield = equity.dps && price ? equity.dps / price : null;

  // Look up static market data for name/sector fallback
  let longName = equity.company?.name || symbol;
  let sector   = equity.company?.sector || null;
  let industry = equity.company?.industry || null;
  for (const [, mkt] of Object.entries(MARKETS)) {
    const found = mkt.stocks.find(s => s.ticker === ticker);
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
      regularMarketVolume: live.volume ?? null,
      chartPreviousClose: prevClose,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      marketCap: equity.capital ?? null,
      trailingEps: equity.eps ?? null,
      dividendYield,
      dataSource: 'gse-api',
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

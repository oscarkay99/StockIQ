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

function aiOnlyStub(ticker) {
  // Enrich stub with static data from markets.json so Claude has context even without live prices
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

export async function getFullStockData(ticker) {
  const key = `full:${ticker}`;
  const cached = fromCache(key);
  if (cached) return cached;

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d&includePrePost=false`;
    const res = await fetch(PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error('no price');

    const quote = {
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
    };

    const result = { quote, summary: null, liveData: true };
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

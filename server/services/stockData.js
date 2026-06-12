// Yahoo Finance unofficial JSON API — no API key required, covers all global exchanges.
// Uses node:https (HTTP/1.1) to match curl's behaviour; fetch() uses HTTP/2 which
// Yahoo fingerprints differently and rate-limits more aggressively.

import https from 'node:https';
import { URL } from 'node:url';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In-memory cache (5 min TTL)
const cache = new Map();
const TTL = 5 * 60 * 1000;
function fromCache(key) {
  const e = cache.get(key);
  return e && Date.now() - e.ts < TTL ? e.data : null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Circuit breaker: stop hammering Yahoo if we're getting rate-limited
let _yfBlocked = false;
let _yfBlockedUntil = 0;
function yfIsBlocked() {
  if (_yfBlocked && Date.now() < _yfBlockedUntil) return true;
  _yfBlocked = false;
  return false;
}
function yfBlock(ms = 5 * 60 * 1000) {
  _yfBlocked = true;
  _yfBlockedUntil = Date.now() + ms;
}

// Yahoo requires a cookie + crumb for authenticated API access
let _cookie = null;
let _crumb = null;
let _credTs = 0;
const CRED_TTL = 30 * 60 * 1000; // 30 min

function httpsGet(urlStr, extraHeaders = {}) {
  if (yfIsBlocked()) return Promise.reject(new Error('Yahoo Finance temporarily unavailable (rate limited)'));
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': UA, 'Accept': 'application/json', ...extraHeaders },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGet(res.headers.location, extraHeaders));
      }
      if (res.statusCode === 429) {
        yfBlock(10 * 60 * 1000); // back off 10 minutes on rate limit
        return reject(new Error('Yahoo Finance HTTP 429'));
      }
      if (res.statusCode !== 200) return reject(new Error(`Yahoo Finance HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
  });
}

async function getYahooCreds() {
  if (_crumb && Date.now() - _credTs < CRED_TTL) return { cookie: _cookie, crumb: _crumb };

  // Step 1: get cookie
  const cookieData = await new Promise((resolve, reject) => {
    const req = https.get({ hostname: 'fc.yahoo.com', path: '/', headers: { 'User-Agent': UA } }, (res) => {
      resolve(res.headers['set-cookie']?.join('; ') || '');
      res.resume();
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  });
  _cookie = cookieData.split(';')[0] || '';

  // Step 2: get crumb
  const crumbData = await new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'query2.finance.yahoo.com',
      path: '/v1/test/getcrumb',
      headers: { 'User-Agent': UA, 'Cookie': _cookie },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body.trim()));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  });
  _crumb = crumbData;
  _credTs = Date.now();
  return { cookie: _cookie, crumb: _crumb };
}

async function yfFetch(urlStr, withCrumb = true) {
  if (!withCrumb) return httpsGet(urlStr);
  const { cookie, crumb } = await getYahooCreds();
  const sep = urlStr.includes('?') ? '&' : '?';
  return httpsGet(`${urlStr}${sep}crumb=${encodeURIComponent(crumb)}`, { Cookie: cookie });
}

export async function getFullStockData(ticker) {
  const cacheKey = `full:${ticker}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  // Primary: v8 chart (works without auth — gives live price + meta)
  let chartMeta = null;
  let hasPrice = false;
  try {
    const chartData = await httpsGet(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d&includePrePost=false`
    );
    chartMeta = chartData?.chart?.result?.[0]?.meta ?? null;
    hasPrice = chartMeta?.regularMarketPrice != null;
  } catch {
    // chart failed — continue to fundamentals attempt
  }

  // Secondary: quoteSummary for fundamentals (needs crumb — may fail under rate limits)
  let summaryModules = null;
  try {
    const summaryData = await yfFetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile`
    );
    summaryModules = summaryData?.quoteSummary?.result?.[0] ?? null;
  } catch {
    // fundamentals unavailable — live price still usable if chart succeeded
  }

  if (!hasPrice && !summaryModules) {
    const result = buildAiOnlyStub(ticker);
    setCache(cacheKey, result);
    return result;
  }

  const detail = summaryModules?.summaryDetail ?? {};
  const stats = summaryModules?.defaultKeyStatistics ?? {};
  const financial = summaryModules?.financialData ?? {};
  const profile = summaryModules?.assetProfile ?? {};

  const v = (obj) => (obj && obj.raw !== undefined ? obj.raw : obj ?? null);

  const quote = {
    symbol: ticker,
    longName: chartMeta?.longName || chartMeta?.shortName || ticker,
    shortName: chartMeta?.shortName || ticker,
    currency: chartMeta?.currency || 'USD',
    exchange: chartMeta?.exchangeName || '',
    fullExchangeName: chartMeta?.fullExchangeName || chartMeta?.exchangeName || '',
    sector: profile.sector || null,
    industry: profile.industry || null,
    country: profile.country || null,
    description: profile.longBusinessSummary || null,
    website: profile.website || null,
    // Live price from chart
    regularMarketPrice: chartMeta?.regularMarketPrice ?? null,
    regularMarketChange: chartMeta?.regularMarketPrice != null && chartMeta?.chartPreviousClose != null
      ? chartMeta.regularMarketPrice - chartMeta.chartPreviousClose : null,
    regularMarketChangePercent: chartMeta?.regularMarketPrice != null && chartMeta?.chartPreviousClose != null
      ? (chartMeta.regularMarketPrice - chartMeta.chartPreviousClose) / chartMeta.chartPreviousClose : null,
    regularMarketDayHigh: chartMeta?.regularMarketDayHigh ?? null,
    regularMarketDayLow: chartMeta?.regularMarketDayLow ?? null,
    regularMarketVolume: chartMeta?.regularMarketVolume ?? null,
    chartPreviousClose: chartMeta?.chartPreviousClose ?? null,
    // Fundamentals from quoteSummary (may be null if unavailable)
    marketCap: v(detail.marketCap),
    trailingPE: v(detail.trailingPE),
    forwardPE: v(detail.forwardPE),
    trailingEps: v(stats.trailingEps),
    dividendYield: v(detail.dividendYield),
    fiftyTwoWeekHigh: v(detail.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: v(detail.fiftyTwoWeekLow),
    beta: v(detail.beta) ?? v(stats.beta),
    profitMargin: v(financial.profitMargins),
    revenueTotal: v(financial.totalRevenue),
    revenuePerShare: v(financial.revenuePerShare),
    returnOnEquity: v(financial.returnOnEquity),
    returnOnAssets: v(financial.returnOnAssets),
    grossProfit: v(financial.grossProfits),
    operatingMargin: v(financial.operatingMargins),
    analystRating: financial.recommendationKey || null,
    analystTargetPrice: v(financial.targetMeanPrice),
    dataSource: hasPrice ? (summaryModules ? 'yahoo' : 'yahoo-price-only') : 'yahoo-fundamentals',
  };

  const result = { quote, summary: null, liveData: hasPrice };
  setCache(cacheKey, result);
  return result;
}

function buildAiOnlyStub(ticker, errMsg = null) {
  return {
    quote: {
      symbol: ticker,
      longName: ticker,
      shortName: ticker,
      dataSource: 'ai-only',
      _notice: errMsg || 'Live data not available for this ticker. AI analysis will draw on Claude\'s knowledge.',
    },
    summary: null,
    liveData: false,
  };
}

export async function searchStocks(query) {
  const { MARKETS } = await import('../data/markets.js');
  const q = query.toLowerCase().trim();
  const localMatches = [];

  for (const [, market] of Object.entries(MARKETS)) {
    for (const stock of market.stocks) {
      if (stock.ticker.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q)) {
        localMatches.push({
          symbol: stock.ticker,
          longname: stock.name,
          shortname: stock.name,
          exchDisp: market.name,
          sector: stock.sector,
          quoteType: 'EQUITY',
          _local: true,
        });
      }
    }
  }

  // Yahoo Finance search — covers all exchanges worldwide, no API key needed
  let yahooMatches = [];
  const yfSearchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
  try {
    // Try without crumb first (faster); fall back to authenticated request on 401/403
    let data;
    try {
      data = await yfFetch(yfSearchUrl, false);
    } catch {
      data = await yfFetch(yfSearchUrl, true);
    }
    const quotes = data?.quotes ?? [];
    yahooMatches = quotes
      .filter(r => r.quoteType === 'EQUITY' || r.quoteType === 'ETF' || r.quoteType === 'MUTUALFUND')
      .map(r => ({
        symbol: r.symbol,
        longname: r.longname || r.shortname || r.symbol,
        shortname: r.shortname || r.symbol,
        exchDisp: r.exchDisp || r.exchange || '',
        sector: r.sector || null,
        quoteType: r.quoteType || 'EQUITY',
      }));
  } catch {
    // Yahoo unreachable — fall through to local + direct lookup
  }

  // Merge: local curated results first, then Yahoo results not already covered
  const seen = new Set(localMatches.map(m => m.symbol.toUpperCase()));
  const merged = [...localMatches];
  for (const r of yahooMatches) {
    if (!seen.has(r.symbol.toUpperCase())) {
      seen.add(r.symbol.toUpperCase());
      merged.push(r);
    }
  }

  if (merged.length === 0) {
    merged.push({
      symbol: query.toUpperCase(),
      longname: `Look up "${query.toUpperCase()}" directly`,
      shortname: query.toUpperCase(),
      exchDisp: 'Direct lookup',
      quoteType: 'EQUITY',
    });
  }

  return merged.slice(0, 10);
}

export async function getHistoricalData(ticker, period = '6mo') {
  const cacheKey = `hist:${ticker}:${period}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const rangeMap = { '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y' };
  const range = rangeMap[period] || '6mo';

  try {
    const data = await yfFetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&includeAdjustedClose=true`
    );

    const chart = data?.chart?.result?.[0];
    if (!chart) return [];

    const timestamps = chart.timestamp ?? [];
    const closes = chart.indicators?.quote?.[0]?.close ?? [];
    const volumes = chart.indicators?.quote?.[0]?.volume ?? [];

    const result = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        close: closes[i] ?? null,
        volume: volumes[i] ?? null,
      }))
      .filter(d => d.close != null);

    setCache(cacheKey, result);
    return result;
  } catch {
    return [];
  }
}

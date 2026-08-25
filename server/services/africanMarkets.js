// Live price feeds for exchanges Yahoo Finance doesn't cover (GSE, NSE Nigeria).
// Both are the exchanges' own public market-data endpoints (no API key, no auth) —
// discovered from the JS bundles of their official web portals.
//
// GSE:  gsemarketwatch.com — the Ghana Stock Exchange's own real-time market-watch app.
// NSE:  doclib.ngxgroup.com — the Nigerian Exchange Group's own live price-list feed.

import https from 'node:https';
import { URL } from 'node:url';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const cache = new Map();
function fromCache(key, ttlMs) {
  const e = cache.get(key);
  return e && Date.now() - e.ts < ttlMs ? e.data : null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function httpsGetJson(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  });
}

const numFrom = (v) => {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return Number.isFinite(n) ? n : null;
};

// ── GSE (Ghana) ──────────────────────────────────────────────────────────────
// Real-time intraday bid/ask/last-trade snapshot, keyed by bare symbol (no .GH suffix).

const GSE_TTL = 60 * 1000;

async function fetchGseTable() {
  const cached = fromCache('gse', GSE_TTL);
  if (cached) return cached;
  const rows = await httpsGetJson('https://gsemarketwatch.com/api/symbol-statistics');
  const bySymbol = new Map();
  for (const r of rows) bySymbol.set(r.symbol.toUpperCase(), r);
  setCache('gse', bySymbol);
  return bySymbol;
}

async function getGseQuote(symbol) {
  const table = await fetchGseTable();
  const r = table.get(symbol.toUpperCase());
  if (!r) return null;

  const lastTrade = numFrom(r.last_trade_price);
  const bid = numFrom(r.bid_price);
  const ask = numFrom(r.ask_price);
  const price = lastTrade || bid || ask || numFrom(r.open_price);
  if (price == null) return null;

  const changePct = numFrom(r.percent_change); // already in percent units, e.g. -4.05
  const change = numFrom(r.net_change);
  const prevClose = change != null ? price - change : null;

  return {
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: changePct != null ? changePct / 100 : null,
    regularMarketDayHigh: numFrom(r.high_price),
    regularMarketDayLow: numFrom(r.low_price),
    regularMarketVolume: numFrom(r.total_trade_volume),
    chartPreviousClose: prevClose,
    bidPrice: bid,
    askPrice: ask,
    dataSource: 'gse-live',
  };
}

// ── NSE (Nigeria) ────────────────────────────────────────────────────────────
// Prior trading day's official close, keyed by NGX symbol (differs from our
// ticker's bare prefix for a few renamed/rebranded names — mapped below).

const NGX_TTL = 5 * 60 * 1000;

const NGX_SYMBOL_MAP = {
  ZENITHBA: 'ZENITHBANK',
  ACCESS: 'ACCESSCORP',
  FBNH: 'FIRSTHOLDCO',
};

async function fetchNgxTable() {
  const cached = fromCache('ngx', NGX_TTL);
  if (cached) return cached;
  const rows = await httpsGetJson('https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=&pageSize=300&pageNo=0');
  const bySymbol = new Map();
  for (const r of rows) bySymbol.set(r.Symbol.toUpperCase(), r);
  setCache('ngx', bySymbol);
  return bySymbol;
}

async function getNgxQuote(symbol) {
  const table = await fetchNgxTable();
  const key = NGX_SYMBOL_MAP[symbol.toUpperCase()] || symbol.toUpperCase();
  const r = table.get(key);
  if (!r) return null;

  const price = numFrom(r.ClosePrice) ?? numFrom(r.OpeningPrice);
  if (price == null) return null;

  const prevClose = numFrom(r.PrevClosingPrice);
  const change = numFrom(r.Change) ?? (prevClose != null ? price - prevClose : null);
  const changePct = numFrom(r.PercChange) ?? (prevClose ? (change / prevClose) * 100 : null);

  return {
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: changePct != null ? changePct / 100 : null,
    regularMarketDayHigh: numFrom(r.HighPrice),
    regularMarketDayLow: numFrom(r.LowPrice),
    regularMarketVolume: numFrom(r.Volume),
    chartPreviousClose: prevClose,
    dataSource: 'ngx-live',
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────
// ticker is the full app ticker, e.g. "GCB.GH" or "ZENITHBA.LG"

export async function getAfricanExchangeQuote(ticker) {
  const [bareSymbol, suffix] = ticker.split('.');
  const sfx = (suffix || '').toUpperCase();
  if (sfx === 'GH') return getGseQuote(bareSymbol);
  if (sfx === 'LG') return getNgxQuote(bareSymbol);
  return null;
}

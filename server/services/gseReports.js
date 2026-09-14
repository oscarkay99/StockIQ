import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_URLS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/gse-report-urls.json'), 'utf8'));

// Server-to-server fetches aren't subject to browser CORS, so unlike the client
// version of this file, no proxy is needed here — straight to gse.com.gh.
const SEARCH_URL = 'https://gse.com.gh/';

function classifyPeriod(title) {
  return /half[\s-]?year|interim|unaudited|nine[\s-]?month|\bq[1-3]\b|quarter/i.test(title)
    ? 'interim'
    : 'annual';
}

function decodeEntities(s) {
  return s
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&amp;/g, '&');
}

const MONTHS = 'JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER';
const PERIOD_RE = new RegExp(`(?:YEARS?|PERIODS?)\\s+ENDED\\s+(?:\\w+\\s+)?(\\d{1,2})(?:ST|ND|RD|TH)?\\s+(${MONTHS})[,]?\\s+(\\d{4})`, 'i');

function extractPeriodDate(title) {
  const m = title.match(PERIOD_RE);
  if (!m) return null;
  const date = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function searchGseSite(term) {
  try {
    const html = await fetchText(`${SEARCH_URL}?s=${encodeURIComponent(term)}`);
    const out = [];
    const re = /<h2 class="title"><a href="([^"]+)">([^<]+)<\/a><\/h2>/g;
    let m;
    while ((m = re.exec(html))) {
      const link = m[1];
      if (!/\/(financial-statement|pressrelease)\//.test(link)) continue;
      out.push({ url: link, title: decodeEntities(m[2].trim()) });
    }
    return out;
  } catch {
    return [];
  }
}

async function findMostRecentFiling(ticker, companyName) {
  const symbol = ticker.replace(/\.GH$/i, '');
  const terms = companyName && companyName !== symbol ? [symbol, companyName] : [symbol];
  const resultSets = await Promise.all(terms.map(searchGseSite));

  let best = null;
  const seenUrls = new Set();
  for (const results of resultSets) {
    for (const r of results) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      const date = extractPeriodDate(r.title);
      if (!date) continue;
      if (!best || date > best.date) {
        best = { date, url: r.url, title: r.title, periodType: classifyPeriod(r.title) };
      }
    }
  }
  return best;
}

function extractPdfUrlFromPage(html) {
  const m = html.match(/file=(https:\/\/gse\.com\.gh\/wp-content\/uploads\/[^&"]+\.pdf)/i);
  return m ? m[1] : null;
}

async function fetchPdfAsBase64(pdfUrl) {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

export async function fetchGseReportPdf(ticker, companyName) {
  const best = await findMostRecentFiling(ticker, companyName);
  if (best) {
    try {
      const pageHtml = await fetchText(best.url);
      const pdfUrl = extractPdfUrlFromPage(pageHtml);
      if (pdfUrl) {
        const base64 = await fetchPdfAsBase64(pdfUrl);
        return {
          base64,
          title: best.title,
          url: pdfUrl,
          periodType: best.periodType,
          filedDate: best.date.toISOString().slice(0, 10),
        };
      }
    } catch { /* fall through to static map */ }
  }

  const entry = REPORT_URLS[ticker];
  if (entry?.pdfUrl) {
    try {
      const base64 = await fetchPdfAsBase64(entry.pdfUrl);
      return {
        base64,
        title: `${ticker} Annual Report FY${entry.fiscalYear}`,
        url: entry.pdfUrl,
        periodType: 'annual',
        fiscalYear: entry.fiscalYear,
      };
    } catch { /* no report available */ }
  }

  return null;
}

export async function checkLatestFilingDate(ticker, companyName) {
  const best = await findMostRecentFiling(ticker, companyName);
  if (!best) return null;
  return { periodType: best.periodType, filedDate: best.date.toISOString().slice(0, 10) };
}

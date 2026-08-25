import REPORT_URLS from '../data/gse-report-urls.json';

const PROXY = 'https://corsproxy.io/?url=';
// corsproxy.io's free plan flatly rejects application/pdf ("content type not
// allowed") — confirmed via direct testing, not a transient error. proxy.cors.sh
// serves binary content fine (CORS-open, Cloudflare-cached) and is used only for
// the actual PDF download step; corsproxy.io still handles the HTML/JSON fetches.
const PDF_PROXY = 'https://proxy.cors.sh/';

// IMPORTANT: gse.com.gh's WordPress REST API (/wp-json/wp/v2/posts, with or without
// a category filter) does NOT index financial-statement/press-release content — it
// reliably returns an empty array no matter the query, for every ticker tested. The
// site's own front-end search (/?s=...) works fine and is what's used here instead.
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

// Filing titles are formulaic press-release headers that state the reporting period
// directly (e.g. "...FOR THE YEAR ENDED 31 DECEMBER 2025" or "...PERIOD ENDED 30
// JUNE 2026 (UNAUDITED)"). Parsing that period straight out of the title is far more
// reliable than any post publish-date metadata, and sidesteps the REST API gap above.
function extractPeriodDate(title) {
  const m = title.match(PERIOD_RE);
  if (!m) return null;
  const date = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchText(url) {
  const r = await fetch(PROXY + encodeURIComponent(url));
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

// Finds a company's most recent actual filing by reporting period (not publish date).
// Searches both the bare ticker AND the full company name — the two rank results
// differently on gse.com.gh's site search (e.g. "GCB" surfaces a newer interim that
// "GCB Bank Ltd" alone ranks below its annual report), and a short/generic ticker
// like "ETI" or "SIC" pulls in unrelated results that the full name filters out. Two
// cheap searches per stock beats missing the most recent filing.
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

// The filing's own page embeds its PDF via a viewer plugin (pdfjs-viewer-shortcode)
// rather than a plain <a href> to the file — the real PDF URL is the "file=" param.
function extractPdfUrlFromPage(html) {
  const m = html.match(/file=(https:\/\/gse\.com\.gh\/wp-content\/uploads\/[^&"]+\.pdf)/i);
  return m ? m[1] : null;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function fetchPdfAsBase64(pdfUrl) {
  const res = await fetch(PDF_PROXY + pdfUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

// Primary: search gse.com.gh live for the most recent filing (interim or annual),
// then fetch its page to pull out the actual PDF link and download it.
// Fallback: our pre-built static map of annual report PDF URLs scraped from the
// sitemap, used only if the live path fails or finds nothing.
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

// Lightweight companion to fetchGseReportPdf: same live search, but metadata only
// (no page fetch, no PDF download) — cheap enough to run for every stock in a
// market on every dashboard scan, to flag when a filing newer than the static
// fundamentals baseline exists.
export async function checkLatestFilingDate(ticker, companyName) {
  const best = await findMostRecentFiling(ticker, companyName);
  if (!best) return null;
  return { periodType: best.periodType, filedDate: best.date.toISOString().slice(0, 10) };
}

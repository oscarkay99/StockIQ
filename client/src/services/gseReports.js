import REPORT_URLS from '../data/gse-report-urls.json';

const PROXY = 'https://corsproxy.io/?url=';
const WP_POSTS = 'https://gse.com.gh/wp-json/wp/v2/posts';

// Ghana-listed companies file half-year (interim/unaudited) statements between annual
// audited reports — there's no full quarterly cadence like the US. A half-year filing
// is often much fresher than the last annual report, so it must win when more recent.
const INTERIM_TERMS = ['interim', 'half year', 'half-year', 'unaudited', 'nine month'];
const ANNUAL_TERMS = ['annual', 'audited', 'financial'];

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
  const res = await fetch(PROXY + encodeURIComponent(pdfUrl));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function extractPdfUrl(contentHtml) {
  // href may be missing the https:// prefix
  const m = contentHtml.match(/href=["']((?:https?:\/\/)?gse\.com\.gh\/wp-content\/uploads\/[^"']+\.pdf)/i);
  if (!m) return null;
  return m[1].startsWith('http') ? m[1] : 'https://' + m[1];
}

function classifyPeriod(title) {
  return /half[\s-]?year|interim|unaudited|nine[\s-]?month|\bq[1-3]\b|quarter/i.test(title)
    ? 'interim'
    : 'annual';
}

async function searchPosts(term) {
  const apiUrl = `${WP_POSTS}?search=${encodeURIComponent(term)}&per_page=5&categories=21&_fields=id,title,content,date`;
  try {
    const r = await fetch(PROXY + encodeURIComponent(apiUrl));
    if (!r.ok) return [];
    const posts = await r.json();
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

// Search both interim and annual terms in parallel, then keep whichever dated filing
// is genuinely the most recent — a 2026 half-year report should beat a 2025 annual one.
async function findMostRecentFiling(symbol) {
  const terms = [...INTERIM_TERMS, ...ANNUAL_TERMS].map((t) => `${symbol} ${t}`);
  const results = await Promise.all(terms.map(searchPosts));

  let best = null;
  const seen = new Set();
  for (const posts of results) {
    for (const post of posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);

      const pdfUrl = extractPdfUrl(post.content?.rendered || '');
      if (!pdfUrl) continue;
      const date = post.date ? new Date(post.date) : null;
      if (!date || Number.isNaN(date.getTime())) continue;

      if (!best || date > best.date) {
        const title = post.title?.rendered || symbol;
        best = { date, pdfUrl, title, periodType: classifyPeriod(title) };
      }
    }
  }
  return best;
}

// Lightweight version of findMostRecentFiling: one search per ticker instead of nine,
// metadata only (no PDF download). Used to give the market-wide dashboard scan a
// "has this company filed something newer than our baseline?" signal for all 39
// GSE tickers at once without the cost of fetching every PDF on every scan.
export async function checkLatestFilingDate(ticker) {
  const symbol = ticker.replace(/\.GH$/i, '').toUpperCase();
  const posts = await searchPosts(`${symbol} financial statement`);

  let best = null;
  for (const post of posts) {
    if (!extractPdfUrl(post.content?.rendered || '')) continue; // skip non-filing posts
    const date = post.date ? new Date(post.date) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    if (!best || date > best.date) {
      const title = post.title?.rendered || symbol;
      best = { date, periodType: classifyPeriod(title) };
    }
  }
  if (!best) return null;
  return { periodType: best.periodType, filedDate: best.date.toISOString().slice(0, 10) };
}

// Primary: search gse.com.gh live for the most recent filing (interim or annual).
// Fallback: our pre-built static map of annual report PDF URLs scraped from the sitemap,
// used only if the live search fails or finds nothing.
export async function fetchGseReportPdf(ticker) {
  const symbol = ticker.replace(/\.GH$/i, '').toUpperCase();

  const best = await findMostRecentFiling(symbol);
  if (best) {
    try {
      const base64 = await fetchPdfAsBase64(best.pdfUrl);
      return {
        base64,
        title: best.title,
        url: best.pdfUrl,
        periodType: best.periodType,
        filedDate: best.date.toISOString().slice(0, 10),
      };
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

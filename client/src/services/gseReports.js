import REPORT_URLS from '../data/gse-report-urls.json';

const PROXY = 'https://corsproxy.io/?url=';
const WP_POSTS = 'https://gse.com.gh/wp-json/wp/v2/posts';

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

// Primary: use our pre-built static map of PDF URLs scraped from gse.com.gh sitemap.
// Fallback: search the WP REST API (covers any new filings added after the map was built).
export async function fetchGseReportPdf(ticker) {
  const entry = REPORT_URLS[ticker];

  // ── Static map lookup ─────────────────────────────────────────────────────
  if (entry?.pdfUrl) {
    try {
      const base64 = await fetchPdfAsBase64(entry.pdfUrl);
      return {
        base64,
        title: `${ticker} Annual Report FY${entry.fiscalYear}`,
        url: entry.pdfUrl,
        fiscalYear: entry.fiscalYear,
      };
    } catch { /* fall through to REST API */ }
  }

  // ── Fallback: WP REST API search ──────────────────────────────────────────
  const symbol = ticker.replace(/\.GH$/i, '').toUpperCase();
  const terms = [`${symbol} annual`, `${symbol} audited`, `${symbol} financial`];

  for (const term of terms) {
    const apiUrl = `${WP_POSTS}?search=${encodeURIComponent(term)}&per_page=5&categories=21&_fields=id,title,content`;
    let posts;
    try {
      const r = await fetch(PROXY + encodeURIComponent(apiUrl));
      if (!r.ok) continue;
      posts = await r.json();
    } catch { continue; }

    if (!Array.isArray(posts) || posts.length === 0) continue;

    for (const post of posts) {
      const content = post.content?.rendered || '';
      const title = post.title?.rendered || symbol;

      // href may be missing https:// prefix
      const m = content.match(/href=["']((?:https?:\/\/)?gse\.com\.gh\/wp-content\/uploads\/[^"']+\.pdf)/i);
      if (!m) continue;

      let pdfUrl = m[1];
      if (!pdfUrl.startsWith('http')) pdfUrl = 'https://' + pdfUrl;

      try {
        const base64 = await fetchPdfAsBase64(pdfUrl);
        return { base64, title, url: pdfUrl, fiscalYear: null };
      } catch { continue; }
    }
  }

  return null;
}

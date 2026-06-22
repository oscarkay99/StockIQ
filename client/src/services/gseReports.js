const PROXY = 'https://corsproxy.io/?url=';
const WP_POSTS = 'https://gse.com.gh/wp-json/wp/v2/posts';

// Convert ArrayBuffer to base64 in chunks to handle large PDFs efficiently
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

// Search gse.com.gh WP REST API for a financial statement post for this ticker,
// extract PDF URL (fixing missing https:// prefix), fetch and return as base64.
// Returns null if nothing is found or fetch fails.
export async function fetchGseReportPdf(ticker) {
  const symbol = ticker.replace(/\.GH$/i, '').toUpperCase();

  const terms = [
    `${symbol} annual`,
    `${symbol} audited`,
    `${symbol} financial`,
  ];

  for (const term of terms) {
    const apiUrl = `${WP_POSTS}?search=${encodeURIComponent(term)}&per_page=5&categories=21&_fields=id,title,content`;
    let posts;
    try {
      const r = await fetch(PROXY + encodeURIComponent(apiUrl));
      if (!r.ok) continue;
      posts = await r.json();
    } catch {
      continue;
    }

    if (!Array.isArray(posts) || posts.length === 0) continue;

    for (const post of posts) {
      const content = post.content?.rendered || '';
      const title = post.title?.rendered || symbol;

      // PDF href may be missing https:// prefix
      const m = content.match(/href=["']((?:https?:\/\/)?gse\.com\.gh\/wp-content\/uploads\/[^"']+\.pdf)/i);
      if (!m) continue;

      let pdfUrl = m[1];
      if (!pdfUrl.startsWith('http')) pdfUrl = 'https://' + pdfUrl;

      try {
        const pdfRes = await fetch(PROXY + encodeURIComponent(pdfUrl));
        if (!pdfRes.ok) continue;
        const buffer = await pdfRes.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        return { base64, title, url: pdfUrl };
      } catch {
        continue;
      }
    }
  }

  return null;
}

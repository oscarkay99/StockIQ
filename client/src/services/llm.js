// AI calls now go through the backend (server/), which owns the Gemini key and
// caches/dedupes results across every visitor — see server/services/llm.js and
// server/services/cache.js. This file is just an SSE-consuming thin client.

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function streamSSE(url, options, onChunk, signal) {
  const res = await fetch(url, { ...options, signal });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* body wasn't JSON */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const events = buf.split('\n\n');
    buf = events.pop(); // last, possibly-incomplete event stays in the buffer

    for (const event of events) {
      if (!event.startsWith('data: ')) continue;
      const payload = event.slice(6);
      if (payload === '[DONE]') return;

      const data = JSON.parse(payload);
      if (data.error) throw new Error(data.error);
      if (data.text) onChunk(data.text);
    }
  }
}

export async function streamAnalysis(analysisType, stockData, extraContext, onChunk, signal) {
  const ticker = stockData?.quote?.symbol || '';
  await streamSSE(
    `${API_BASE}/api/analysis/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, analysisType, extraContext }),
    },
    onChunk,
    signal,
  );
}

export async function streamMarketDashboard({ market }, onChunk, signal) {
  await streamSSE(
    `${API_BASE}/api/analysis/dashboard?market=${encodeURIComponent(market)}`,
    {},
    onChunk,
    signal,
  );
}

export async function streamSignalScan({ market }, onChunk, signal) {
  await streamSSE(
    `${API_BASE}/api/analysis/signal-scan?market=${encodeURIComponent(market)}`,
    {},
    onChunk,
    signal,
  );
}

export async function streamScreener({ query, market, type }, onChunk, signal) {
  await streamSSE(
    `${API_BASE}/api/screener/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, market, type }),
    },
    onChunk,
    signal,
  );
}

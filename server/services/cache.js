// Shares one upstream Gemini call across every concurrent/near-concurrent caller
// for the same key — this is the whole point of moving calls server-side: a
// 15-minute dashboard refresh or a repeat stock-analysis click should hit the
// cache, not the model, regardless of how many browsers are asking.

const store = new Map(); // key -> { text, expiresAt }
const inflight = new Map(); // key -> Promise<string>

// run(onChunk) must call onChunk(text) for each streamed piece and resolve when done.
export async function cachedStream(key, ttlMs, run, onChunk) {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    onChunk(cached.text);
    return;
  }

  if (inflight.has(key)) {
    const text = await inflight.get(key);
    onChunk(text);
    return;
  }

  let full = '';
  const promise = (async () => {
    await run((chunk) => {
      full += chunk;
      onChunk(chunk);
    });
    return full;
  })();

  inflight.set(key, promise);
  try {
    await promise;
    store.set(key, { text: full, expiresAt: Date.now() + ttlMs });
  } finally {
    inflight.delete(key);
  }
}

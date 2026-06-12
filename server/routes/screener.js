import { Router } from 'express';
import { MARKETS } from '../data/markets.js';
import { streamScreener } from '../services/claude.js';

const router = Router();

// Build a flat text list of all stocks for the prompt
function buildStockList(marketFilter) {
  const entries = [];
  for (const [key, market] of Object.entries(MARKETS)) {
    if (marketFilter && marketFilter !== 'ALL' && key !== marketFilter) continue;
    for (const s of market.stocks) {
      entries.push(`${s.ticker} | ${s.name} | ${s.sector} | ${market.name} (${market.currency})`);
    }
  }
  return entries.join('\n');
}

router.post('/search', async (req, res) => {
  const { query = '', market = 'ALL', type = 'ANY' } = req.body;

  if (!query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const stockList = buildStockList(market === 'ALL' ? null : market);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    await streamScreener({ query, market, type, stockList }, (chunk) => {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

export default router;

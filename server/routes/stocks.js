import { Router } from 'express';
import { searchStocks, getFullStockData, getHistoricalData } from '../services/stockData.js';
import { MARKETS } from '../data/markets.js';

const router = Router();

router.get('/markets', (req, res) => {
  res.json(MARKETS);
});

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) {
    return res.status(400).json({ error: 'Query required' });
  }
  try {
    const results = await searchStocks(q.trim());
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quote/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const data = await getFullStockData(decodeURIComponent(ticker));
    if (!data.quote) {
      return res.status(404).json({ error: 'Stock not found or no data available' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const { period = '6mo' } = req.query;
  try {
    const history = await getHistoricalData(decodeURIComponent(ticker), period);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

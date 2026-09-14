import { Router } from 'express';
import { getFullStockData } from '../services/stockData.js';
import { streamAnalysis, streamMarketDashboard, streamSignalScan, getAnalysisTypes } from '../services/llm.js';

const router = Router();

router.get('/types', (req, res) => {
  res.json(getAnalysisTypes());
});

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

router.get('/dashboard', async (req, res) => {
  const { market = 'ALL' } = req.query;
  sseHeaders(res);
  try {
    await streamMarketDashboard(market, (chunk) => {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

router.get('/signal-scan', async (req, res) => {
  const { market = 'ALL' } = req.query;
  sseHeaders(res);
  try {
    await streamSignalScan(market, (chunk) => {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

router.post('/generate', async (req, res) => {
  const { ticker, analysisType, extraContext = '' } = req.body;

  if (!ticker || !analysisType) {
    return res.status(400).json({ error: 'ticker and analysisType are required' });
  }

  try {
    const stockData = await getFullStockData(decodeURIComponent(ticker));

    if (!stockData.quote) {
      return res.status(404).json({ error: 'Could not retrieve stock data for this ticker' });
    }

    // Stream SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await streamAnalysis(analysisType, stockData, extraContext, (chunk) => {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

export default router;

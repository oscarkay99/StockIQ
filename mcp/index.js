#!/usr/bin/env node
// StockIQ MCP server: exposes StockIQ's market-data layer as tools so Claude
// (or any MCP client) can look up stocks and do the analysis itself.
//
// It reuses the same services the StockIQ web app uses (server/services), so
// Ghana Stock Exchange and NSE Nigeria tickers go through their own exchange
// feeds and everything else goes through Yahoo Finance.
//
// Transport is stdio, which is what Claude Desktop and Claude Code expect for
// local servers. stdout carries the protocol, so all logging goes to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// The shared services log with console.log/warn. Anything on stdout would
// corrupt the JSON-RPC stream, so send it all to stderr before importing them.
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);

const { searchStocks, getFullStockData, getHistoricalData } = await import('../server/services/stockData.js');
const { MARKETS } = await import('../server/data/markets.js');

const server = new McpServer({ name: 'stockiq', version: '0.1.0' });

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

server.registerTool(
  'list_markets',
  {
    title: 'List markets',
    description:
      'List the stock exchanges StockIQ covers (Ghana GSE, NYSE/NASDAQ, NSE Nigeria, JSE South Africa) and the stocks it tracks on each. Use this to find valid tickers before calling other tools.',
    inputSchema: {
      market: z
        .enum(Object.keys(MARKETS))
        .optional()
        .describe('Only return this market. Omit to list every market.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ market }) => {
    const keys = market ? [market] : Object.keys(MARKETS);
    return json(
      keys.map((key) => ({
        market: key,
        name: MARKETS[key].name,
        currency: MARKETS[key].currency,
        stocks: MARKETS[key].stocks,
      })),
    );
  },
);

server.registerTool(
  'search_stocks',
  {
    title: 'Search stocks',
    description: 'Find stocks by company name or ticker across all covered exchanges. Returns tickers to pass to get_stock_data.',
    inputSchema: { query: z.string().min(1).max(60).describe('Company name or ticker, e.g. "MTN" or "Apple"') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query }) => {
    try {
      const results = await searchStocks(query.trim());
      if (!results?.length) return fail(`No stocks matched "${query}". Try list_markets to browse tracked tickers.`);
      return json(results.slice(0, 15));
    } catch (err) {
      return fail(`Search failed: ${err.message}`);
    }
  },
);

server.registerTool(
  'get_stock_data',
  {
    title: 'Get stock data',
    description:
      'Get the live (or latest end-of-day) price and fundamentals for one ticker: valuation ratios, margins, returns, debt, dividends and company profile. GSE tickers end in .GH and NSE Nigeria tickers end in .LG.',
    inputSchema: { ticker: z.string().min(1).max(20).describe('Ticker symbol, e.g. "AAPL", "MTNGH.GH", "NPN.JO"') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ ticker }) => {
    try {
      const data = await getFullStockData(ticker.trim().toUpperCase());
      if (!data?.quote || data.quote.dataSource === 'ai-only') {
        return fail(`No live market data is available for ${ticker} right now. Check the ticker with search_stocks, or try again later.`);
      }
      return json(data);
    } catch (err) {
      return fail(`Could not load ${ticker}: ${err.message}`);
    }
  },
);

server.registerTool(
  'get_price_history',
  {
    title: 'Get price history',
    description: 'Get daily closing prices for a ticker over 1, 3, 6 or 12 months, for trend and performance questions.',
    inputSchema: {
      ticker: z.string().min(1).max(20),
      period: z.enum(['1mo', '3mo', '6mo', '1y']).default('6mo'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ ticker, period }) => {
    try {
      const history = await getHistoricalData(ticker.trim().toUpperCase(), period);
      if (!history?.length) return fail(`No price history available for ${ticker} (${period}).`);
      const first = history[0];
      const last = history[history.length - 1];
      const changePct = first.close ? +(((last.close - first.close) / first.close) * 100).toFixed(2) : null;
      return json({ ticker, period, points: history.length, changePct, history });
    } catch (err) {
      return fail(`Could not load history for ${ticker}: ${err.message}`);
    }
  },
);

server.registerTool(
  'compare_stocks',
  {
    title: 'Compare stocks',
    description: 'Fetch price and fundamentals for 2 to 5 tickers side by side, for comparison questions.',
    inputSchema: { tickers: z.array(z.string().min(1).max(20)).min(2).max(5) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ tickers }) => {
    const rows = await Promise.all(
      tickers.map(async (raw) => {
        const ticker = raw.trim().toUpperCase();
        try {
          const data = await getFullStockData(ticker);
          if (!data?.quote || data.quote.dataSource === 'ai-only') return { ticker, error: 'no live data available' };
          return { ticker, liveData: data.liveData, quote: data.quote };
        } catch (err) {
          return { ticker, error: err.message };
        }
      }),
    );
    return json(rows);
  },
);

await server.connect(new StdioServerTransport());
console.error('StockIQ MCP server running on stdio');

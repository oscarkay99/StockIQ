// Smoke test: starts the server over stdio, lists its tools and calls each one.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'stockiq-smoke-test', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['index.js'], stderr: 'ignore' }));

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const calls = [
  ['list_markets', { market: 'GSE' }],
  ['search_stocks', { query: 'MTN' }],
  ['get_stock_data', { ticker: 'AAPL' }],
  ['get_stock_data', { ticker: 'MTNGH.GH' }],
  ['get_price_history', { ticker: 'AAPL', period: '1mo' }],
  ['compare_stocks', { tickers: ['AAPL', 'MSFT'] }],
  ['get_stock_data', { ticker: 'NOTAREALTICKER123' }],
];
for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  console.log(`\n${name} ${JSON.stringify(args)} -> ${res.isError ? 'ERROR' : 'ok'} (${text.length} chars)`);
  console.log(text.slice(0, 220).replace(/\s+/g, ' '));
}
await client.close();

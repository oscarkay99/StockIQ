# StockIQ MCP Server

An [MCP](https://modelcontextprotocol.io) server that turns StockIQ's market-data layer into tools Claude can call. Ask Claude about a stock and it looks up live prices and fundamentals through StockIQ, then does the analysis itself.

It reuses the same services as the StockIQ web app (`server/services`). Ghana Stock Exchange and NSE Nigeria tickers come from those exchanges' own feeds, and other markets come from Yahoo Finance.

## Tools

| Tool | What it does |
|---|---|
| `list_markets` | Lists the covered exchanges (GSE, NYSE/NASDAQ, NSE Nigeria, JSE) and the stocks tracked on each |
| `search_stocks` | Finds tickers by company name or symbol |
| `get_stock_data` | Live or latest end-of-day price, valuation ratios, margins, returns, debt, dividends and company profile |
| `get_price_history` | Daily closes over 1, 3, 6 or 12 months, with the percentage change |
| `compare_stocks` | Price and fundamentals for 2 to 5 tickers side by side |

Every tool is read-only. When live data isn't available, the tool returns a clear error so Claude doesn't guess.

## Setup

```bash
cd server && npm install   # the shared data services
cd ../mcp && npm install
npm test                   # starts the server, lists the tools and calls each one
```

### Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "stockiq": {
      "command": "node",
      "args": ["/absolute/path/to/StockIQ/mcp/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add stockiq -- node /absolute/path/to/StockIQ/mcp/index.js
```

## Example prompts

- "What GSE banking stocks does StockIQ track? Compare GCB and SCB on valuation."
- "Get MTN Ghana's latest data and tell me if it looks cheap."
- "How has NPN.JO moved over the last 3 months?"

## Design notes

- **Transport:** stdio, which local Claude clients expect. The protocol uses stdout, so all logging goes to stderr. The shared services' `console.log` calls are redirected for the same reason.
- **Input validation:** every tool validates its input with zod schemas before anything runs.
- **Errors:** errors come back as MCP tool errors (`isError: true`) with a next step Claude can act on, for example "check the ticker with search_stocks".

import Anthropic from '@anthropic-ai/sdk';

// Lazy-initialize so dotenv has time to populate process.env before first use
let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function fmt(val, prefix = '', suffix = '', decimals = 2) {
  if (val == null || val === undefined) return 'N/A';
  if (typeof val === 'number') {
    if (Math.abs(val) >= 1e9) return `${prefix}${(val / 1e9).toFixed(decimals)}B${suffix}`;
    if (Math.abs(val) >= 1e6) return `${prefix}${(val / 1e6).toFixed(decimals)}M${suffix}`;
    return `${prefix}${val.toFixed(decimals)}${suffix}`;
  }
  return String(val);
}

function buildStockContext(stockData, extraContext = '') {
  const { quote: q, liveData } = stockData;
  if (!q) return 'No stock data available.';

  const hasLive = liveData && q.regularMarketPrice != null;
  const hasFund = q.marketCap != null || q.trailingPE != null;

  const priceSection = hasLive ? `
LIVE PRICE DATA:
- Current Price: ${fmt(q.regularMarketPrice, q.currency ? q.currency + ' ' : '')}
- Day Change: ${q.regularMarketChange != null ? `${q.regularMarketChange >= 0 ? '+' : ''}${fmt(q.regularMarketChange)} (${fmt(q.regularMarketChangePercent, '', '%')})` : 'N/A'}
- Day High / Low: ${fmt(q.regularMarketDayHigh)} / ${fmt(q.regularMarketDayLow)}
- Volume: ${fmt(q.regularMarketVolume)}
- 52-Week High: ${fmt(q.fiftyTwoWeekHigh)}  |  52-Week Low: ${fmt(q.fiftyTwoWeekLow)}
- Previous Close: ${fmt(q.chartPreviousClose)}` : `
NOTE: Live price data is not available for this ticker via the current data provider.`;

  const fundSection = hasFund ? `
FUNDAMENTAL DATA (from data provider):
- Market Cap: ${fmt(q.marketCap, '$')}
- P/E Ratio (TTM): ${fmt(q.trailingPE)}
- Forward P/E: ${fmt(q.forwardPE)}
- EPS (TTM): ${fmt(q.trailingEps)}
- Dividend Yield: ${q.dividendYield != null ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'}
- Beta: ${fmt(q.beta)}
- Revenue (TTM): ${fmt(q.revenueTotal, '$')}
- Profit Margin: ${q.profitMargin != null ? (q.profitMargin * 100).toFixed(2) + '%' : 'N/A'}
- Operating Margin: ${q.operatingMargin != null ? (q.operatingMargin * 100).toFixed(2) + '%' : 'N/A'}
- Return on Equity: ${q.returnOnEquity != null ? (q.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}
- Analyst Rating: ${q.analystRating || 'N/A'}  |  Target Price: ${fmt(q.analystTargetPrice)}` : `
NOTE: Detailed fundamental metrics are not available via the data provider for this ticker. Use your training knowledge for fundamentals, noting the approximate data period.`;

  return `
STOCK: ${q.longName || q.symbol} (${q.symbol})
Exchange: ${q.exchange || q.fullExchangeName || 'N/A'}
Sector: ${q.sector || 'N/A'}  |  Industry: ${q.industry || 'N/A'}
Country: ${q.country || 'N/A'}
${priceSection}
${fundSection}
${q.description ? `\nBUSINESS SUMMARY:\n${q.description.slice(0, 400)}...` : ''}
${extraContext ? `\nADDITIONAL CONTEXT:\n${extraContext}` : ''}
`.trim();
}

// Shared instruction prepended to all prompts
const DIRECT = `Be direct. No intros, no padding, no "In conclusion". Lead with the verdict. Use bullet points. Max 220 words total.\n\n`;

const ANALYSES = {
  fundamental: {
    label: 'Fundamental Analysis',
    icon: '📊',
    description: 'Valuation verdict, key metrics & financial health',
    buildPrompt: (ctx) => `${DIRECT}You are an equity analyst. Give a direct fundamental verdict on this stock.

${ctx}

Output format — use exactly this structure:

**[STRONG BUY / BUY / HOLD / SELL / AVOID]**

| Metric | Value | Signal |
|--------|-------|--------|
| P/E (TTM) | X | Cheap / Fair / Expensive |
| ROE | X% | Strong / Weak |
| Profit Margin | X% | — |
| Dividend Yield | X% | — |
| Debt/Equity | X | Safe / High |

**Why:** [2 sentences max — the #1 reason to buy or avoid]

**Key risk:** [1 sentence]`,
  },

  technical: {
    label: 'Technical Analysis',
    icon: '📈',
    description: 'Entry, targets, support & resistance levels',
    buildPrompt: (ctx) => `${DIRECT}You are a technical analyst. Give direct trade levels for this stock.

${ctx}

Output format:

**Trend:** [Uptrend / Downtrend / Sideways]

| Level | Price |
|-------|-------|
| Resistance | X |
| Current | X |
| Support | X |
| Stop-Loss | X |
| Target | X |

**Setup:** [1-2 sentences — what the chart is saying right now]

**Entry signal to watch:** [1 sentence — what event/price would confirm entry]`,
  },

  portfolio: {
    label: 'Portfolio Fit',
    icon: '🗂️',
    description: 'Role in a portfolio, allocation & diversification',
    buildPrompt: (ctx) => `${DIRECT}You are a portfolio manager. Tell me directly how this stock fits in a portfolio.

${ctx}

Output format:

**Role:** [Core holding / Satellite / Speculative]
**Allocation:** [X–Y% of portfolio] for [conservative / moderate / aggressive] investors
**Correlation:** [Low / Medium / High] correlation to [index]

**Best paired with:** [1–2 complementary assets or sectors]

**In one sentence:** [Why own this vs cash or an index fund right now]`,
  },

  strategies: {
    label: 'Investment Strategies',
    icon: '🎯',
    description: 'Best strategy match: value, growth, income or momentum',
    buildPrompt: (ctx) => `${DIRECT}You are an investment strategist. Tell me which strategy fits this stock best.

${ctx}

Output format:

**Best fit:** [Value / Growth / Dividend / Momentum / Contrarian]

**Score by strategy:**
- Value Investing: [★★★ / ★★☆ / ★☆☆] — [10-word reason]
- Growth Investing: [★★★ / ★★☆ / ★☆☆] — [10-word reason]
- Dividend/Income: [★★★ / ★★☆ / ★☆☆] — [10-word reason]
- Momentum: [★★★ / ★★☆ / ★☆☆] — [10-word reason]

**Bottom line:** [1–2 sentences — who should own this and why]`,
  },

  trends: {
    label: 'Market Trends',
    icon: '🌊',
    description: 'Macro tailwinds, headwinds & 6–12 month outlook',
    buildPrompt: (ctx) => `${DIRECT}You are a macro analyst. Give me the key trends affecting this stock right now.

${ctx}

Output format:

**Macro stance:** [Tailwind / Neutral / Headwind]

**Top 3 tailwinds:**
- [brief point]
- [brief point]
- [brief point]

**Top 2 headwinds:**
- [brief point]
- [brief point]

**6–12 month outlook:** [1–2 sentences — direction and key catalyst to watch]`,
  },

  sector: {
    label: 'Sector Analysis',
    icon: '🏭',
    description: 'Competitive position, peers & sector rating',
    buildPrompt: (ctx) => `${DIRECT}You are a sector analyst. Tell me where this company stands in its sector.

${ctx}

Output format:

**Sector rating:** [Overweight / Neutral / Underweight]
**Company position:** [Leader / Mid-tier / Laggard] in its sector

**vs. Peers:**
- Valuation: [Cheaper / In-line / Expensive]
- Growth: [Faster / Similar / Slower]
- Margins: [Better / Similar / Worse]

**Biggest competitive edge:** [1 sentence]
**Biggest competitive threat:** [1 sentence]

**Verdict:** [Buy this or the sector ETF? 1 sentence]`,
  },

  risk: {
    label: 'Risk Management',
    icon: '🛡️',
    description: 'Risk rating, top threats & position sizing',
    buildPrompt: (ctx) => `${DIRECT}You are a risk analyst. Rate this stock's risk and tell me how to size the position.

${ctx}

Output format:

**Risk level:** [LOW / MEDIUM / HIGH / VERY HIGH]

**Top 3 risks:**
1. [Risk name]: [1 sentence]
2. [Risk name]: [1 sentence]
3. [Risk name]: [1 sentence]

**Position sizing:**
- Conservative: [X% of portfolio]
- Moderate: [X% of portfolio]
- Aggressive: [X% of portfolio]

**Stop-loss suggestion:** [price or % below entry]

**One thing that would make me exit immediately:** [1 sentence]`,
  },

  results: {
    label: 'Results Report',
    icon: '📋',
    description: 'Key earnings metrics, what beat/miss means & what to watch',
    buildPrompt: (ctx) => `${DIRECT}You are an earnings analyst. Tell me what to watch in this company's results.

${ctx}

Output format:

**#1 metric that moves the stock:** [metric name and why]

**Watch these numbers:**
| Metric | What's good | What's bad |
|--------|-------------|------------|
| Revenue | >X% growth | <X% growth |
| Margin | >X% | <X% |
| [Key KPI] | X | X |

**If they beat:** [What typically happens to price — 1 sentence]
**If they miss:** [What typically happens to price — 1 sentence]

**Red flag to watch:** [1 sentence — the thing that would be a serious warning sign]`,
  },

  growth_dividend: {
    label: 'Growth vs Dividend',
    icon: '⚖️',
    description: 'Is this a growth stock or income stock? Who should own it?',
    buildPrompt: (ctx) => `${DIRECT}You are an investment advisor. Classify this stock and tell me who should own it.

${ctx}

Output format:

**Classification:** [Pure Growth / Growth + Income / Pure Income / Value]

| | Growth | Dividend |
|---|--------|---------|
| Score | X/10 | X/10 |
| Key evidence | [brief] | [brief] |

**Best investor profile:** [1 sentence — "This stock is for someone who..."]

**Avoid if:** [1 sentence — who should NOT own this]

**In numbers:** For every GHS 10,000 / $5,000 invested: expected ~[X]% annual return from [growth/dividends/both]`,
  },

  world_events: {
    label: 'World Events Impact',
    icon: '🌍',
    description: 'Geopolitical & macro events impact on this stock',
    buildPrompt: (ctx) => `${DIRECT}You are a geopolitical investment analyst. Tell me how world events affect this stock right now.

${ctx}

Output format:

**Net impact of current world events:** [Positive / Neutral / Negative]

**What's affecting it most:**
1. [Event/Factor]: [impact in 1 sentence]
2. [Event/Factor]: [impact in 1 sentence]
3. [Event/Factor]: [impact in 1 sentence]

**Scenario:**
- Best case: [1 sentence]
- Base case: [1 sentence]
- Worst case: [1 sentence]

**Hedge:** [What to own alongside this to protect against the main risk]`,
  },

  trade_signal: {
    label: 'Trade Signal',
    icon: '🚦',
    description: 'AI BUY/SELL/HOLD verdict with entry price, targets & stop-loss',
    buildPrompt: (ctx) => `You are a professional trading analyst. Generate a trade signal for the following stock.

${ctx}

IMPORTANT: Your response MUST begin with this exact block (fill in real numbers):

===SIGNAL===
VERDICT: BUY
CONFIDENCE: HIGH
ENTRY_LOW: 0.00
ENTRY_HIGH: 0.00
TARGET_1M: 0.00
TARGET_3M: 0.00
TARGET_12M: 0.00
STOP_LOSS: 0.00
CURRENCY: USD
UPSIDE_PCT: 0.0
===END===

Rules:
- VERDICT must be exactly: BUY, SELL, or HOLD
- CONFIDENCE must be exactly: HIGH, MEDIUM, or LOW
- All prices must be numbers (no currency symbols)
- For AI-mode stocks without live price, use your best estimate from training knowledge
- CURRENCY: GHS for Ghana, NGN for Nigeria, ZAR for South Africa, USD for US
- UPSIDE_PCT = expected % gain/loss to 12-month target from entry midpoint

After the signal block, be brief — max 150 words:

**Why [BUY/SELL/HOLD]:** [2 sentences — the core thesis]

**Bull:** [2 bullet points]
**Bear:** [2 bullet points]

**Timing:** [When to enter — 1 sentence]`,
  },

  dividend_analysis: {
    label: 'Dividend Analysis',
    icon: '💰',
    description: 'Dividend safety score, yield quality & income suitability',
    buildPrompt: (ctx) => `${DIRECT}You are a dividend investing specialist. Give me a direct dividend verdict on this stock.

${ctx}

Output format:

**Dividend Safety:** [SAFE / MODERATE / AT RISK / DOES NOT PAY]

| Metric | Value | Signal |
|--------|-------|--------|
| Dividend Yield | X% | High / Fair / Low |
| Payout Ratio | X% | Safe (<60%) / High / Risky |
| Consecutive years | X yrs | — |
| Dividend growth | X% /yr | Growing / Flat / Declining |

**Income verdict:** [YES — good income stock / MAYBE — some caveats / NO — not for income]

**Why:** [1–2 sentences max]

**Income estimate:** GHS/$/R [X] invested → ~[X] per year in dividends

**Better alternative (if any):** [1 stock name with higher/safer yield in same market]`,
  },
};

export function getAnalysisTypes() {
  return Object.entries(ANALYSES).map(([key, val]) => ({
    key,
    label: val.label,
    icon: val.icon,
    description: val.description,
  }));
}

export async function generateAnalysis(analysisType, stockData, extraContext = '') {
  const analysis = ANALYSES[analysisType];
  if (!analysis) throw new Error(`Unknown analysis type: ${analysisType}`);

  const stockContext = buildStockContext(stockData, extraContext);
  const prompt = analysis.buildPrompt(stockContext);

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

export async function streamAnalysis(analysisType, stockData, extraContext, onChunk) {
  const analysis = ANALYSES[analysisType];
  if (!analysis) throw new Error(`Unknown analysis type: ${analysisType}`);

  const stockContext = buildStockContext(stockData, extraContext);
  const prompt = analysis.buildPrompt(stockContext);

  const stream = getClient().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta?.type === 'text_delta'
    ) {
      onChunk(chunk.delta.text);
    }
  }

  const final = await stream.finalMessage();
  return final;
}

export async function streamScreener({ query, market, type, stockList }, onChunk) {
  const marketLabel = market === 'ALL' ? 'all markets (Ghana GSE, US NYSE/NASDAQ, Nigeria NSE, South Africa JSE)' : market;
  const typeLabel = type === 'ANY' ? 'any investment type' : type;

  const prompt = `You are a stock screener AI. The user wants specific stocks. Be direct and concise — no intros, no padding.

USER QUERY: "${query}"
MARKET FILTER: ${marketLabel}
TYPE FILTER: ${typeLabel}

AVAILABLE STOCKS DATABASE (ticker | name | sector | exchange | currency):
${stockList}

Recommend the best matching stocks. For each stock use this format:

### [Rank]. [Company Name] ([TICKER]) — [★★★ Strong Match / ★★☆ Good Match / ★☆☆ Partial]

- **Why it fits:** [2–3 bullets, specific reasons]
- **Key stat:** [Dividend yield / P/E / growth rate — whichever is most relevant]
- **Risk:** [1 line]

---

After the list (max 5 stocks), add one short paragraph on how to research them further in this app.

Rules:
- Only recommend stocks that genuinely match — don't pad the list
- For dividend queries, only list stocks with known dividend history
- If fewer than 3 match, say so honestly
- Max 350 words total`;

  const stream = getClient().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      onChunk(chunk.delta.text);
    }
  }
  await stream.finalMessage();
}

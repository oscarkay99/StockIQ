import { getClient } from './anthropic.js';
import MARKETS from '../data/markets.json';

function fmt(val, prefix = '', suffix = '', decimals = 2) {
  if (val == null) return 'N/A';
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
  const hasFund = q.marketCap != null || q.trailingPE != null || q.trailingEps != null;
  const cur = q.currency || 'USD';

  const priceSection = hasLive ? `
LIVE PRICE DATA (source: ${q.dataSource || 'live'}):
- Current Price: ${fmt(q.regularMarketPrice, cur + ' ')}
- Day Change: ${q.regularMarketChange != null ? `${q.regularMarketChange >= 0 ? '+' : ''}${fmt(q.regularMarketChange)} (${q.regularMarketChangePercent != null ? (q.regularMarketChangePercent * 100).toFixed(2) + '%' : 'N/A'})` : 'N/A'}
- Day High / Low: ${fmt(q.regularMarketDayHigh)} / ${fmt(q.regularMarketDayLow)}
- Volume: ${fmt(q.regularMarketVolume)}
- 52-Week High: ${fmt(q.fiftyTwoWeekHigh)}  |  52-Week Low: ${fmt(q.fiftyTwoWeekLow)}
- Previous Close: ${fmt(q.chartPreviousClose, cur + ' ')}` : `
NOTE: Live price data is not available for this ticker via the current data provider.`;

  const fundSection = hasFund ? `
FUNDAMENTAL DATA:
- Market Cap: ${fmt(q.marketCap, cur + ' ')}
- P/E Ratio (TTM): ${fmt(q.trailingPE)}
- Forward P/E: ${fmt(q.forwardPE)}
- EPS (TTM): ${fmt(q.trailingEps, cur + ' ')}
- Dividend Yield: ${q.dividendYield != null ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'}
- Beta: ${fmt(q.beta)}
- Revenue (TTM): ${fmt(q.revenueTotal, cur + ' ')}
- Profit Margin: ${q.profitMargin != null ? (q.profitMargin * 100).toFixed(2) + '%' : 'N/A'}
- Operating Margin: ${q.operatingMargin != null ? (q.operatingMargin * 100).toFixed(2) + '%' : 'N/A'}
- Return on Equity: ${q.returnOnEquity != null ? (q.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}
- Analyst Rating: ${q.analystRating || 'N/A'}  |  Target Price: ${fmt(q.analystTargetPrice)}` : `
NOTE: Detailed fundamental metrics are not available. Use your training knowledge for fundamentals.`;

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

const DIRECT = `Be direct. No intros, no padding, no "In conclusion". Lead with the verdict. Use bullet points. Max 220 words total.\n\n`;

const ANALYSES = {
  fundamental: {
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
    buildPrompt: (ctx) => `You are a quantitative trading analyst. Score this stock across three pillars and produce a precise trade signal.

${ctx}

---
SCORING FRAMEWORK

Score each pillar 1–10 using only the data provided above:

TECHNICAL (40% weight)
- Trend: where is current price in 52-week range? (>70% = bullish, 30–70% = neutral, <30% = bearish)
- Momentum: day change direction and magnitude
- Volume: above/below average (estimate if not given)
- Key levels: distance to 52W high (resistance) and 52W low (support)

FUNDAMENTAL (40% weight)
- Valuation: P/E vs sector norm (low P/E = more points)
- Quality: ROE, profit margin, operating margin
- Analyst consensus: rating and gap between target and current price
- Dividend yield (bonus points if >3%)

MOMENTUM (20% weight)
- Recent price trend (positive/negative change %)
- Analyst target upside (if available)
- Sector momentum and macro tailwinds

COMPOSITE SCORE = (TECH × 0.40 + FUND × 0.40 + MOM × 0.20) × 10  → round to integer (0–100)

VERDICT RULES (based on composite score):
- Score ≥ 72 → BUY
- Score 50–71 → HOLD
- Score < 50 → SELL

CONFIDENCE RULES:
- HIGH: composite score ≥ 75 or ≤ 30 (strong signal, multiple factors agree)
- LOW: mixed signals or very limited data
- MEDIUM: everything else

RISK/REWARD: (TARGET_12M − ENTRY_MID) / (ENTRY_MID − STOP_LOSS)  → round to 1 decimal
TIME_HORIZON: SHORT (1–4 weeks) if momentum-driven | MEDIUM (1–3 months) if technical | LONG (6–12 months) if fundamental

---
IMPORTANT: Begin your response with EXACTLY this block (no extra text before it):

===SIGNAL===
VERDICT: BUY
CONFIDENCE: HIGH
TECH_SCORE: 0
FUND_SCORE: 0
MOM_SCORE: 0
SIGNAL_SCORE: 0
ENTRY_LOW: 0.00
ENTRY_HIGH: 0.00
TARGET_1M: 0.00
TARGET_3M: 0.00
TARGET_12M: 0.00
STOP_LOSS: 0.00
RISK_REWARD: 0.0
CURRENCY: USD
UPSIDE_PCT: 0.0
TIME_HORIZON: MEDIUM
===END===

Rules:
- VERDICT: BUY, SELL, or HOLD (use the scoring framework above — do NOT override with gut feel)
- CONFIDENCE: HIGH, MEDIUM, or LOW
- TECH_SCORE / FUND_SCORE / MOM_SCORE: integers 1–10
- SIGNAL_SCORE: integer 0–100 (composite from formula above)
- RISK_REWARD: decimal e.g. 2.5 (reward-to-risk ratio)
- TIME_HORIZON: SHORT | MEDIUM | LONG
- All prices: plain numbers, no currency symbols
- CURRENCY: GHS for Ghana, NGN for Nigeria, ZAR for South Africa, USD for US
- UPSIDE_PCT: % gain/loss from entry midpoint to 12M target
- NEVER output 0.00 for price fields. If live data is missing, you MUST estimate from your training knowledge using the company name, sector, exchange, and currency provided. Use realistic price ranges for the market (e.g. GHS 0.10–50 for small GSE stocks, NGN 1–500 for NSE). If genuinely unknown, use a conservative sector-average estimate and flag it in your thesis.

After the signal block, max 180 words:

**Thesis:** [2 sentences — the single most important reason for this verdict]

**Bulls say:**
- [strongest technical or fundamental supporting factor]
- [key catalyst or value argument]

**Bears say:**
- [biggest risk to the thesis]
- [what could go wrong]

**Entry trigger:** [exact price level or event that confirms the entry]
**Cut position if:** [specific condition that invalidates the thesis]`,
  },
  dividend_analysis: {
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

export async function streamAnalysis(analysisType, stockData, extraContext, onChunk, signal) {
  const analysis = ANALYSES[analysisType];
  if (!analysis) throw new Error(`Unknown analysis type: ${analysisType}`);

  const ctx = buildStockContext(stockData, extraContext);
  const prompt = analysis.buildPrompt(ctx);

  const stream = getClient().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });

  if (signal) signal.addEventListener('abort', () => stream.abort());

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      onChunk(chunk.delta.text);
    }
  }
}

export async function streamSignalScan({ market }, onChunk, signal) {
  const entries = [];
  for (const [key, mkt] of Object.entries(MARKETS)) {
    if (market && market !== 'ALL' && key !== market) continue;
    for (const s of mkt.stocks) {
      entries.push(`${s.ticker} | ${s.name} | ${s.sector} | ${mkt.currency}`);
    }
  }
  const stockList = entries.join('\n');
  const marketLabel = market === 'ALL' ? 'all markets (Ghana GSE, US, Nigeria, South Africa)' : market;

  const prompt = `You are a quantitative equity analyst. Rate every stock in the list below using your training knowledge. Be direct — no intros.

MARKET: ${marketLabel}

STOCKS TO RATE (ticker | name | sector | currency):
${stockList}

RATING CRITERIA:
- STRONG BUY: Compelling value, strong fundamentals, positive momentum — high conviction
- BUY: Good fundamentals, reasonable valuation, moderate upside
- HOLD: Fair value or mixed signals — no urgent action needed
- IGNORE: Overvalued, weak fundamentals, high risk, or insufficient data to rate with confidence

OUTPUT FORMAT — use exactly these four sections, include every stock in exactly one section:

## 🟢 Strong Buy
| Ticker | Name | Reason (10 words max) |
|--------|------|----------------------|
| TICKER | Name | reason |

## 🔵 Buy
| Ticker | Name | Reason (10 words max) |
|--------|------|----------------------|
| TICKER | Name | reason |

## 🟡 Hold
| Ticker | Name | Reason (10 words max) |
|--------|------|----------------------|
| TICKER | Name | reason |

## 🔴 Ignore
| Ticker | Name | Reason (10 words max) |
|--------|------|----------------------|
| TICKER | Name | reason |

---
**Top pick:** [Name (TICKER)] — [1 sentence why it stands out above all others]

Rules:
- Every stock must appear in exactly one section
- Use sector knowledge and company fundamentals from your training data
- For African markets (GSE, NSE), weight liquidity and dividend history more heavily
- Be decisive — if in doubt between HOLD and IGNORE, use HOLD
- No padding, no explanations beyond the table and top pick`;

  const stream = getClient().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  if (signal) signal.addEventListener('abort', () => stream.abort());

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      onChunk(chunk.delta.text);
    }
  }
}

export async function streamScreener({ query, market, type }, onChunk, signal) {
  const entries = [];
  for (const [key, mkt] of Object.entries(MARKETS)) {
    if (market && market !== 'ALL' && key !== market) continue;
    for (const s of mkt.stocks) {
      entries.push(`${s.ticker} | ${s.name} | ${s.sector} | ${mkt.name} (${mkt.currency})`);
    }
  }
  const stockList = entries.join('\n');
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

  if (signal) signal.addEventListener('abort', () => stream.abort());

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      onChunk(chunk.delta.text);
    }
  }
}

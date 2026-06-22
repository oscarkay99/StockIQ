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

  const has52W = q.fiftyTwoWeekHigh != null && q.fiftyTwoWeekLow != null;
  const rangePctStr = has52W && q.regularMarketPrice != null
    ? `${(((q.regularMarketPrice - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100).toFixed(1)}% of 52W range`
    : null;

  const priceSection = hasLive ? `
LIVE PRICE DATA (source: ${q.dataSource || 'live'}):
- Current Price: ${fmt(q.regularMarketPrice, cur + ' ')}
- Day Change: ${q.regularMarketChange != null ? `${q.regularMarketChange >= 0 ? '+' : ''}${fmt(q.regularMarketChange)} (${q.regularMarketChangePercent != null ? (q.regularMarketChangePercent * 100).toFixed(2) + '%' : 'N/A'})` : 'N/A'}
- Volume (today): ${fmt(q.regularMarketVolume)}
- Previous Close: ${fmt(q.chartPreviousClose, cur + ' ')}
- 52-Week High: ${fmt(q.fiftyTwoWeekHigh, cur + ' ')}  |  52-Week Low: ${fmt(q.fiftyTwoWeekLow, cur + ' ')}${rangePctStr ? `  (currently at ${rangePctStr})` : ''}
${q.yearlyChangePercent != null ? `- 1-Year Price Change: ${q.yearlyChangePercent >= 0 ? '+' : ''}${q.yearlyChangePercent.toFixed(2)}% (from ${cur} ${fmt(q.yearlyOpenPrice)} one year ago)` : ''}
${q.momentum30Pct != null ? `- 30-Day Momentum: ${q.momentum30Pct >= 0 ? '+' : ''}${q.momentum30Pct.toFixed(2)}%` : ''}
${q.bidPrice != null ? `- Bid: ${cur} ${fmt(q.bidPrice)}  |  Ask: ${cur} ${fmt(q.askPrice)}` : ''}` : `
NOTE: Live price data is not available for this ticker via the current data provider.`;

  const fundSection = hasFund ? `
FUNDAMENTAL DATA:
- Market Cap: ${fmt(q.marketCap, cur + ' ')}
- P/E Ratio (TTM): ${q.trailingPE != null ? fmt(q.trailingPE) : 'N/A'}
- EPS (TTM): ${q.trailingEps != null ? fmt(q.trailingEps, cur + ' ') : 'N/A'}
- Dividend Yield: ${q.dividendYield != null ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A'}
- Beta: ${q.beta != null ? fmt(q.beta) : 'N/A'}
- Revenue (TTM): ${q.revenueTotal != null ? fmt(q.revenueTotal, cur + ' ') : 'N/A'}
- Profit Margin: ${q.profitMargin != null ? (q.profitMargin * 100).toFixed(2) + '%' : 'N/A'}
- Operating Margin: ${q.operatingMargin != null ? (q.operatingMargin * 100).toFixed(2) + '%' : 'N/A'}
- Return on Equity: ${q.returnOnEquity != null ? (q.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}
- Analyst Rating: ${q.analystRating || 'N/A'}  |  Target Price: ${q.analystTargetPrice != null ? fmt(q.analystTargetPrice) : 'N/A'}` : `
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

const DIRECT = `Be direct and confident. No intros, no padding, no hedging. Lead with the verdict. Give real numbers and specific projections — the user wants to know if they will make or lose money. Max 220 words total.\n\n`;

const ANALYSES = {
  fundamental: {
    buildPrompt: (ctx) => `${DIRECT}You are an equity analyst. Run this stock through a 6-point fundamental checklist and give a decisive verdict.

${ctx}

Use the data above plus your training knowledge about this specific company. Be specific with numbers.

---

**VERDICT: [STRONG BUY / BUY / HOLD / SELL / AVOID]**

**6-Point Checklist:**

**① Business clarity** — Do you understand what this company does and how it makes money?
[1 sentence: business model in plain English + is it easy to understand Y/N]

**② Balance sheet health**
| | Value | Signal |
|---|---|---|
| Cash vs Short-term Debt | X vs X | Covered / At Risk |
| Current Ratio | X.X | Safe (>1) / Risky (<1) |
| Long-term Debt | X | Manageable / Heavy |

**③ Profit quality**
| | Value | Signal |
|---|---|---|
| Net Profit Margin | X% | Excellent (>20%) / Good (>10%) / Weak (<10%) |
| Revenue Growth (YoY) | X% | Accelerating / Flat / Declining |
| Free Cash Flow | Positive / Negative / Growing | — |

**④ Valuation vs peers**
| | Value | vs. Sector Avg | Signal |
|---|---|---|---|
| P/E Ratio | X | Sector avg: X | Cheap / Fair / Expensive |
| P/S Ratio | X | — | — |
| Dividend Yield | X% | — | — |

**⑤ Management & track record**
[1–2 sentences: CEO tenure, major decisions, any red flags or strong leadership signals]

**⑥ Competitive moat**
[1–2 sentences: what makes this company hard to compete with — brand, patents, market share, switching costs, network effects, or none]

---

**Bottom line:** [2 sentences — would you invest your own money here and why/why not]
**Biggest risk:** [1 sentence — what would make this a bad investment]`,
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
    buildPrompt: (ctx) => `${DIRECT}You are a risk analyst. Assess this stock's risk across financial, business and market dimensions.

${ctx}

Output format:

**Risk level:** [LOW / MEDIUM / HIGH / VERY HIGH]

**Balance sheet risk:**
| | Value | Red flag? |
|---|---|---|
| Current Ratio | X.X | Yes / No |
| Debt coverage (cash vs debt) | X | Yes / No |
| Free cash flow | Positive / Negative | Yes / No |

**Top 3 risks (be specific to this company):**
1. [Risk name]: [1 sentence — name the actual threat, not a generic one]
2. [Risk name]: [1 sentence]
3. [Risk name]: [1 sentence]

**Moat durability:** [Strong / Moderate / Weak / None] — [1 sentence: what could erode it]

**Position sizing:**
- Conservative investor: [X% of portfolio]
- Moderate investor: [X% of portfolio]
- Aggressive investor: [X% of portfolio]

**Stop-loss:** [specific price or % below entry]
**Exit immediately if:** [1 specific condition — not a generic "if fundamentals deteriorate"]`,
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
    buildPrompt: (ctx) => `${DIRECT}You are an investment advisor. Classify this stock using Warren Buffett's framework: buy good businesses at fair prices and hold long-term.

${ctx}

Output format:

**Classification:** [Pure Growth / Growth + Income / Pure Income / Value / Speculative]

**Business quality check:**
- Understandable business model: [Yes / No] — [5 words why]
- Competitive moat: [Strong / Moderate / Weak] — [5 words what it is]
- FCF positive & growing: [Yes / No / Unknown]
- Profitable (net margin >10%): [Yes / No / Marginal]

| | Growth Score | Income Score |
|---|---|---|
| Score | X/10 | X/10 |
| Key evidence | [specific metric or fact] | [specific metric or fact] |

**Buffett test:** Would a long-term investor be happy holding this for 10 years if the market closed tomorrow? [Yes / No / Maybe] — [1 sentence why]

**Best for:** [1 sentence — type of investor and time horizon]
**Avoid if:** [1 sentence — who should NOT touch this]

**In numbers:** Investing GHS 10,000 / $5,000 today — realistic expectation in 5 years: [range] from [growth/dividends/both], assuming [key assumption]`,
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
    buildPrompt: (ctx) => {
      const now = new Date();
      const fmtDate = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      // Use day=1 to avoid JS setMonth overflow on month-end dates (e.g. Jan 31 + 1M → Mar, not Feb)
      const addMonths = (n) => new Date(now.getFullYear(), now.getMonth() + n, 1);
      const analysisDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      const date1M  = fmtDate(addMonths(1));
      const date3M  = fmtDate(addMonths(3));
      const date6M  = fmtDate(addMonths(6));
      const date12M = fmtDate(addMonths(12));
      return `You are a quantitative trading analyst with deep knowledge of global equities. Produce a decisive, differentiated trade signal for this specific stock.

${ctx}

ANALYSIS DATE: ${analysisDate}
TARGET DATES: 1M = ${date1M} | 3M = ${date3M} | 6M = ${date6M} | 12M = ${date12M}

---
SCORING FRAMEWORK

Score each pillar 1–10. Use the live data above when available. For any missing metrics, DRAW ON YOUR TRAINING KNOWLEDGE of this specific company — its financial history, sector standing, competitive position, earnings track record, and macro context. Every stock is different. Do NOT default to middle scores.

TECHNICAL (40% weight)
- Price position: if live price given, where is it in 52-week range? (>70% = bullish, <30% = bearish)
- If no live price: assess recent price trend from your knowledge (momentum, 52W range estimates)
- Volume and volatility profile vs. sector peers
- Key support/resistance from known price history

FUNDAMENTAL (40% weight) — score using this 6-point framework, BE SPECIFIC:
① Business model clarity: is it a simple, proven business? (+1 if yes)
② Balance sheet: current ratio >1? Cash > short-term debt? Low long-term debt? (up to +3)
③ Profit quality: net margin >20% = +2, >10% = +1, <0% = -2. Free cash flow positive & growing = +1
④ Valuation vs sector peers: P/E below sector average = +2, in-line = +1, expensive = 0
⑤ Management: long-tenured CEO, consistent strategy, no major scandals = +1
⑥ Competitive moat: strong moat (brand/patents/network effects) = +2, some = +1, none = 0
→ Tally gives 0–10. A sector leader with strong moat & healthy balance sheet = 8–10. A loss-making, debt-heavy company with no moat = 1–3.

MOMENTUM (20% weight)
- Recent earnings trend: beats or misses? Revenue growth accelerating or slowing?
- Analyst consensus and price target direction (upgrade/downgrade cycle)
- Sector and macro tailwinds or headwinds specific to this company
- Any known catalysts (product launch, policy change, commodity price move, etc.)

COMPOSITE SCORE = (TECH × 0.40 + FUND × 0.40 + MOM × 0.20) × 10  → round to integer (0–100)

VERDICT RULES (strict — follow the score, do not soften):
- Score ≥ 82 → STRONG_BUY  (multiple pillars aligned, high conviction)
- Score 65–81 → BUY         (positive bias, clear upside)
- Score 40–64 → HOLD        (mixed signals, wait for catalyst)
- Score 22–39 → SELL        (negative bias, reduce exposure)
- Score < 22  → STRONG_SELL (multiple pillars negative, avoid)

CONFIDENCE RULES:
- HIGH: score ≥ 82 or ≤ 22 (strong signal, factors strongly agree)
- LOW: score 45–59 (genuinely mixed — rare, justify it) or truly insufficient data
- MEDIUM: everything else

RISK/REWARD: (TARGET_12M − ENTRY_MID) / (ENTRY_MID − STOP_LOSS)  → round to 1 decimal
TIME_HORIZON: SHORT (1–4 weeks) | MEDIUM (1–3 months) | LONG (6–12 months)

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
- VERDICT: STRONG_BUY, BUY, HOLD, SELL, or STRONG_SELL — follow the score strictly
- CONFIDENCE: HIGH, MEDIUM, or LOW
- TECH_SCORE / FUND_SCORE / MOM_SCORE: integers 1–10 — differentiate, do NOT score everything 5
- SIGNAL_SCORE: integer 0–100
- All prices: plain numbers, no currency symbols
- CURRENCY: GHS for Ghana, NGN for Nigeria, ZAR for South Africa, USD for US
- UPSIDE_PCT: % from entry midpoint to 12M target (can be negative for SELL/STRONG_SELL)
- NEVER output 0.00 for price fields. Estimate from your knowledge of the stock's typical price range. For GSE stocks use GHS 0.10–50 range; for NSE use NGN 1–1000; for JSE use ZAR 5–5000.

After the signal block, max 200 words. Be bold and specific — do not hedge everything. Use the exact target dates provided above.

**Verdict:** [Restate STRONG BUY / BUY / HOLD / SELL / STRONG SELL with one sharp sentence explaining why]

**Outlook by ${date12M}:** [State a clear price target and expected return %. e.g. "Expect 35% upside to GHS X.XX by ${date12M} driven by..."]

**Bulls say:**
- [specific fundamental or technical argument with actual figures you know]
- [key catalyst that could accelerate the move]

**Bears say:**
- [biggest company-specific risk — be specific, not generic]
- [exact condition that would flip this signal]

**Entry:** [specific price level]
**Stop-loss:** [specific price level — if breached, exit immediately]
**Cut if:** [one specific event or condition that invalidates the thesis completely]`;
    },
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

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import stocksRouter from './routes/stocks.js';
import analysisRouter from './routes/analysis.js';
import screenerRouter from './routes/screener.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/stocks', stocksRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/screener', screenerRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Vercel runs the Express app as a serverless function. Local and Render
// deployments still start the regular HTTP listener.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Stock Research Server running on http://localhost:${PORT}`);
  });
}

export default app;

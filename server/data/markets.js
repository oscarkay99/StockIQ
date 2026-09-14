import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MARKETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'markets.json'), 'utf8'));

import { GoogleGenAI } from '@google/genai';

let _client = null;

export function getClient() {
  if (!_client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not set. Add it to server/.env');
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

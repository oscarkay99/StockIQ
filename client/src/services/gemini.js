import { GoogleGenAI } from '@google/genai';

let _client = null;

export function getClient() {
  if (!_client) {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('VITE_GEMINI_API_KEY is not set. Add it to client/.env');
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

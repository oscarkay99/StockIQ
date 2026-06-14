import Anthropic from '@anthropic-ai/sdk';

let _client = null;

export function getClient() {
  if (!_client) {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!key) throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to client/.env');
    _client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }
  return _client;
}

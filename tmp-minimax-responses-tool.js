const fs = require('fs');
const env = fs.readFileSync('apps/api/.env.local', 'utf8');
const match = env.match(/^GATEWAY_API_KEY="?([^\n"]+)"?/m);
const key = match && match[1];
const body = {
  model: 'minimax/minimax-m2',
  input: 'Call get_weather for London and return a tool call.',
  tools: [{ type: 'function', function: { name: 'get_weather', description: 'Get weather for a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }],
  tool_choice: { type: 'function', function: { name: 'get_weather' } }
};
(async () => {
  const r = await fetch('http://127.0.0.1:8787/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  console.log('status', r.status);
  console.log(t);
})();

const fs = require('fs');
const env = fs.readFileSync('apps/api/.env.local', 'utf8');
const key = (env.match(/^GATEWAY_API_KEY="?([^\n"]+)"?/m)||[])[1];
const body = {
  model: 'deepseek/deepseek-v3.2',
  messages: [{ role: 'user', content: 'Return JSON only with keys city and weather, where city is London.' }],
  response_format: { type: 'json_schema', json_schema: { name: 'weather_schema', strict: true, schema: { type: 'object', properties: { city: { type: 'string' }, weather: { type: 'string' } }, required: ['city', 'weather'] } } },
  echo_upstream_request: true
};
(async () => {
  const r = await fetch('http://127.0.0.1:8787/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  console.log('status', r.status);
  console.log(t);
})();

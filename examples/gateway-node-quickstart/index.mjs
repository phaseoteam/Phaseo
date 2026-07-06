import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();

const BASE_URL = (process.env.PHASEO_BASE_URL || 'https://api.phaseo.ai/v1').replace(/\/+$/, '');
const API_KEY = process.env.PHASEO_API_KEY;
const MODEL = process.env.PHASEO_MODEL || process.env.PHASEO_MODEL || 'openai/gpt-5-nano-2025-08-07';
const APP_TITLE = process.env.PHASEO_APP_TITLE || process.env.PHASEO_APP_TITLE || 'Phaseo Node Quickstart';
const REFERER = process.env.PHASEO_HTTP_REFERER || process.env.PHASEO_HTTP_REFERER || 'http://localhost';
const IS_SMOKE = process.argv.includes('--smoke');

if (!API_KEY) {
  console.error('Missing PHASEO_API_KEY. Copy .env.example to .env.local and set credentials.');
  process.exit(1);
}

function buildHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'x-title': APP_TITLE,
    'http-referer': REFERER,
    ...extra,
  };
}

async function request(method, route, body) {
  const response = await fetch(`${BASE_URL}/${route.replace(/^\/+/, '')}`, {
    method,
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return { status: response.status, ok: response.ok, payload };
}

function print(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`HTTP ${result.status}`);
  if (typeof result.payload === 'string') {
    console.log(result.payload);
  } else {
    console.log(JSON.stringify(result.payload, null, 2));
  }
}

async function run() {
  const health = await request('GET', 'health');
  print('Health', health);

  const models = await request('GET', 'models');
  print('Models', models);

  if (IS_SMOKE) return;

  const prompt = 'Return exactly: integration_ok';

  const responses = await request('POST', 'responses', {
    model: MODEL,
    input: prompt,
  });
  print('Responses API', responses);

  const chatCompletions = await request('POST', 'chat/completions', {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
  });
  print('Chat Completions', chatCompletions);

  const embeddings = await request('POST', 'embeddings', {
    model: 'openai/text-embedding-3-small',
    input: 'hello world',
  });
  print('Embeddings', embeddings);
}

run().catch((error) => {
  console.error('\nQuickstart failed:', error);
  process.exit(1);
});

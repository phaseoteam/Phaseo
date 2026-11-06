import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserCollector, privatePath, sanitizeFaroItem } from './browser.mjs';

const meta = { app: { name: 'phaseo-web' }, user: { email: 'private@example.com' }, session: { id: 'anonymous', attributes: { email: 'secret', isSampled: 'true' } }, page: { url: 'https://phaseo.app/chat/private-conversation?prompt=private#secret' }, browser: { name: 'Chrome', userAgent: 'private' } };
test('browser monitoring restricts collector endpoints and normalizes customer path segments', () => {
  assert.equal(browserCollector('https://faro-collector-prod-eu-west-0.grafana.net/collect/abc-123'), 'https://faro-collector-prod-eu-west-0.grafana.net/collect/abc-123');
  for (const url of ['https://example.com/collect/abc', 'https://faro-collector-prod-eu-west-0.grafana.net/collect/abc?token=x', 'http://faro-collector-prod-eu-west-0.grafana.net/collect/abc']) assert.equal(browserCollector(url), null);
  assert.equal(privatePath(meta.page.url), '/chat/:id');
});
test('browser exceptions exclude messages, identities and custom metadata, while retaining source map coordinates', () => {
  const item = sanitizeFaroItem({ type: 'exception', meta, payload: { timestamp: 'now', type: 'TypeError', value: 'private prompt', context: { private: 'secret' }, stacktrace: { frames: [
    { filename: 'https://phaseo.app/assets/abc.js?token=secret', function: 'private name', lineno: 1, colno: 2 },
    { filename: 'https://external.example/private/path.js', function: 'secret', lineno: 3 },
  ] } } });
  const encoded = JSON.stringify(item);
  for (const value of ['private', 'secret', 'example.com', 'external.example', 'userAgent', '?token']) assert.ok(!encoded.includes(value), value);
  assert.equal(item.payload.stacktrace.frames[0].filename, 'https://phaseo.app/assets/abc.js');
  assert.equal(item.payload.stacktrace.frames[0].colno, 2);
  assert.equal(item.meta.session.attributes.isSampled, 'true');
});
test('browser traces remove span events, URLs, bodies and arbitrary attributes at every depth', () => {
  const result = sanitizeFaroItem({ type: 'trace', meta, payload: { resourceSpans: [{ resource: { attributes: [{ key: 'user.id', value: { stringValue: 'secret' } }] }, scopeSpans: [{ spans: [{ name: 'GET https://private?token=secret', traceId: 'a', spanId: 'b', status: { code: 2, message: 'secret' }, events: [{ name: 'secret' }], attributes: [{ key: 'http.url', value: { stringValue: 'secret' } }, { key: 'http.method', value: { stringValue: 'GET' } }] }] }] }] } });
  const encoded = JSON.stringify(result);
  assert.ok(!encoded.includes('secret'));
  assert.ok(!encoded.includes('private'));
  assert.ok(encoded.includes('GET'));
  assert.equal(sanitizeFaroItem({ type: 'log', meta, payload: { message: 'private' } }), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHttp, checkBrowser, publishAxiom } from './health-pilot.mjs';

test('HTTP outage is retried and does not expose response contents', async () => {
  let calls = 0;
  const result = await checkHttp({ id: 'api', url: 'https://example.test', json: true }, async () => {
    calls++;
    return new Response('private-token', { status: 503 });
  });
  assert.equal(calls, 2);
  assert.equal(result.success, false);
  assert.equal(result.status_code, 503);
  assert.ok(!JSON.stringify(result).includes('private-token'));
});

test('healthy retry recovers and invalid 200 content fails', async () => {
  let calls = 0;
  const check = { id: 'page', url: 'https://example.test', text: 'Models' };
  const recovered = await checkHttp(check, async () => new Response(++calls === 1 ? 'Error' : 'Models'));
  assert.equal(recovered.success, true);
  assert.equal(calls, 2);
  const failed = await checkHttp(check, async () => new Response('Application error'));
  assert.equal(failed.success, false);
  assert.equal(failed.failure_reason, 'unexpected_content');
});

test('API must return the expected JSON contract', async () => {
  const check = { id: 'api', url: 'https://example.test', json: true };
  assert.equal((await checkHttp(check, async () => Response.json({ message: 'Welcome to the Phaseo Gateway API!' }))).success, true);
  assert.equal((await checkHttp(check, async () => Response.json({ message: 'Unavailable' }))).success, false);
  assert.equal((await checkHttp(check, async () => new Response('not-json'))).success, false);
});

test('timeouts are failures and browser setup failure remains a check result', async () => {
  const result = await checkHttp({ id: 'timeout', url: 'https://example.test' }, async () => { throw new Error('secret'); });
  assert.equal(result.success, false);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal((await checkBrowser(() => { throw new Error('missing browser'); })).success, false);
});

test('Axiom credentials are required and rejected delivery fails without logging the body', async () => {
  await assert.rejects(publishAxiom([], {}), /requires/);
  await assert.rejects(publishAxiom([], { HEALTH_AXIOM_TOKEN: 'secret', HEALTH_AXIOM_DATASET: 'events' }, async () => new Response('secret', { status: 403 })), /HTTP 403/);
});

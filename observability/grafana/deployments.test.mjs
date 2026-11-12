import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentMarkers, syncDeployments } from './deployments.mjs';
import { dashboards } from './definitions.mjs';

const run = { id: 123, run_attempt: 2, event: 'push', head_branch: 'main', head_sha: 'a'.repeat(40), repository: { full_name: 'phaseoteam/Phaseo' }, head_repository: { full_name: 'phaseoteam/Phaseo' }, conclusion: 'failure' };
const job = (target, name, conclusion = 'success') => ({ id: 456, name: `deploy (${target}, Deploy)`, conclusion: 'failure', steps: [{ number: 7, name, conclusion, completed_at: '2026-11-09T12:34:56Z' }] });

test('markers represent actual successful deploy steps, including partial releases', () => {
  const jobs = [job('api', 'Deploy API app to Cloudflare'), job('web', 'Deploy web Worker to Cloudflare', 'skipped'), job('api-eu', 'Deploy regional API Worker to Cloudflare', 'failure'), job('docs', 'Docs (Mintlify deploy is handled by GitHub App)')];
  const markers = deploymentMarkers(run, jobs);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].time, Date.parse('2026-11-09T12:34:56Z'));
  assert.ok(markers[0].tags.includes('service:gateway'));
  assert.ok(markers[0].tags.includes('service:jobs'));
  assert.ok(markers[0].tags.includes('deployment:123:2:456:7'));
  assert.ok(markers[0].text.includes(`/commit/${run.head_sha}`));
  assert.ok(markers[0].text.includes('/actions/runs/123/job/456'));
  assert.equal(deploymentMarkers(run, [{ ...job('ignored', 'Deploy phaseo-realtime'), name: 'Deploy realtime relay' }]).length, 1);
});

test('untrusted runs cannot use either credential and malformed metadata is rejected', async () => {
  const fetcher = () => { throw Error('Unexpected network'); };
  for (const changed of [{ event: 'pull_request' }, { head_branch: 'feature' }, { head_repository: { full_name: 'fork/Phaseo' } }]) {
    assert.deepEqual(deploymentMarkers({ ...run, ...changed }, []), []);
    await syncDeployments({ run: { ...run, ...changed }, fetcher, env: {} });
  }
  assert.throws(() => deploymentMarkers({ ...run, head_sha: '<script>' }, []), /Invalid/);
  assert.throws(() => deploymentMarkers(run, [{ ...job('api', 'Deploy API app to Cloudflare'), steps: [{ number: 7, name: 'Deploy API app to Cloudflare', conclusion: 'success', completed_at: 'invalid' }] }]), /Invalid/);
});

test('sync paginates jobs, authenticates each host separately and avoids duplicate annotations', async () => {
  const annotations = [];
  const existing = new Set();
  const fetcher = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(init.redirect, 'error');
    if (parsed.hostname === 'api.github.com') {
      assert.equal(init.headers.Authorization, 'Bearer github-fixture');
      assert.ok(parsed.pathname.endsWith('/123/attempts/2/jobs'));
      return Response.json({ total_count: 2, jobs: parsed.searchParams.get('page') === '1' ? [job('web', 'Deploy web Worker to Cloudflare', 'skipped')] : [job('api', 'Deploy API app to Cloudflare')] });
    }
    assert.equal(parsed.origin, 'https://phaseo.grafana.net');
    assert.equal(init.headers.Authorization, 'Bearer grafana-fixture');
    if (init.method === 'POST') { const body = JSON.parse(init.body); annotations.push(body); existing.add(body.tags.find(tag => tag.startsWith('deployment:'))); return Response.json({ id: 1 }); }
    return Response.json(existing.has(parsed.searchParams.get('tags')) ? [{ id: 1 }] : []);
  };
  const options = { run, fetcher, env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_ANNOTATIONS_TOKEN: 'grafana-fixture', GH_TOKEN: 'github-fixture' }, log: () => {} };
  await syncDeployments(options);
  await syncDeployments(options);
  assert.equal(annotations.length, 1);
  await assert.rejects(syncDeployments({ ...options, env: { ...options.env, GRAFANA_URL: 'https://attacker.example' } }), /Invalid/);
  await assert.rejects(syncDeployments({ ...options, fetcher: async () => new Response('', { status: 403 }) }), /HTTP 403/);
});

test('deployment overlays preserve environment and specialist service scope', () => {
  for (const dashboard of dashboards().filter(d => d.uid !== 'phaseo-free-tier')) {
    const query = dashboard.annotations.list.find(a => a.name === 'Deployments');
    assert.equal(query.enable, true);
    assert.equal(query.hide, false);
    assert.equal(query.target.matchAny, false);
    assert.ok(query.target.tags.includes('environment:$environment'));
    const service = { 'phaseo-gateway': 'gateway', 'phaseo-web': 'web', 'phaseo-jobs': 'jobs' }[dashboard.uid];
    if (service) assert.ok(query.target.tags.includes(`service:${service}`));
  }
});

test('rate limits respect Retry-After without real waits and stop after bounded retries', async () => {
  const delays = [];
  let calls = 0;
  const options = { run, env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_ANNOTATIONS_TOKEN: 'fixture', GH_TOKEN: 'fixture' }, wait: async ms => delays.push(ms), log: () => {} };
  await syncDeployments({ ...options, fetcher: async () => ++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '3' } }) : Response.json({ total_count: 0, jobs: [] }) });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [3000]);
  calls = 0;
  await assert.rejects(syncDeployments({ ...options, fetcher: async () => { calls++; return new Response('', { status: 429 }); } }), /HTTP 429/);
  assert.equal(calls, 4);
});

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const repository = 'phaseoteam/Phaseo';
const targets = {
  api: ['Gateway', 'Deploy API app to Cloudflare', ['gateway', 'jobs']],
  'api-eu': ['Gateway (EU)', 'Deploy regional API Worker to Cloudflare', ['gateway', 'jobs']],
  'api-us': ['Gateway (US)', 'Deploy regional API Worker to Cloudflare', ['gateway', 'jobs']],
  web: ['Website', 'Deploy web Worker to Cloudflare', ['web']],
  'web-api': ['Web API', 'Deploy Web API Worker to Cloudflare', ['web', 'jobs']],
  mcp: ['MCP', 'Deploy MCP Worker to Cloudflare', []],
  slack: ['Slack agent', 'Deploy Slack agent Worker to Cloudflare', []],
  realtime: ['Realtime relay', 'Deploy phaseo-realtime', ['gateway']],
};
const trustedRun = run => ['push', 'workflow_dispatch'].includes(run?.event) && run.head_branch === 'main'
  && run.repository?.full_name === repository && run.head_repository?.full_name === repository;

export function deploymentQuery(service) {
  return { name: 'Deployments', type: 'tags', datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: false, iconColor: '#FFB357',
    target: { type: 'tags', limit: 500, matchAny: false, tags: ['phaseo-deployment', 'environment:$environment', ...(service ? [`service:${service}`] : [])] } };
}

export function deploymentMarkers(run, jobs) {
  if (!trustedRun(run)) return [];
  if (!/^[a-f0-9]{40}$/.test(run.head_sha) || !Number.isSafeInteger(run.id) || run.id <= 0 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) throw Error('Invalid deployment run metadata');
  return jobs.flatMap(job => {
    const target = job.name === 'Deploy realtime relay' ? 'realtime' : /^deploy \(([^,]+), /.exec(job.name)?.[1];
    const definition = targets[target];
    if (!definition) return [];
    const [title, stepName, services] = definition;
    const step = job.steps?.find(step => step.name === stepName && step.conclusion === 'success');
    if (!step) return [];
    const time = Date.parse(step.completed_at);
    if (!Number.isFinite(time) || !Number.isSafeInteger(job.id) || !Number.isSafeInteger(step.number)) throw Error('Invalid deployment completion metadata');
    return [{ time, tags: ['phaseo-deployment', 'environment:production', `target:${target}`, `release:${run.head_sha}`, `deployment:${run.id}:${run.run_attempt}:${job.id}:${step.number}`, ...services.map(service => `service:${service}`)],
      text: `<b>${title} deployed</b><br/>Commit <a href="https://github.com/${repository}/commit/${run.head_sha}">${run.head_sha.slice(0, 7)}</a> · <a href="https://github.com/${repository}/actions/runs/${run.id}/job/${job.id}">Deployment run</a>` }];
  });
}

export async function syncDeployments({ run, env = process.env, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log } = {}) {
  // A workflow_run can originate from a fork or a pull request. Reject those
  // before reading jobs or sending credentials; never execute the run's code.
  if (!trustedRun(run)) return;
  deploymentMarkers(run, []);
  const origin = new URL(env.GRAFANA_URL);
  if (origin.protocol !== 'https:' || !/^[a-z0-9-]+\.grafana\.net$/.test(origin.hostname) || origin.username || origin.password || origin.port || origin.search || origin.hash || origin.pathname !== '/') throw Error('Invalid Grafana stack origin');
  if (!env.GRAFANA_ANNOTATIONS_TOKEN || !env.GH_TOKEN) throw Error('Missing annotation or GitHub credential');
  const request = async (url, token, body) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (r.status === 429 && attempt < 3) {
        const retry = r.headers.get('retry-after');
        const seconds = retry === null ? 2 ** (attempt + 1) : /^\d+$/.test(retry) ? Number(retry) : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
        await r.body?.cancel();
        if (!Number.isFinite(seconds) || seconds > 30) throw Error('Deployment marker rate limit requires a later retry');
        await wait(Math.max(1, seconds) * 1000);
        continue;
      }
      if (!r.ok) { await r.body?.cancel(); throw Error(`Deployment marker API returned HTTP ${r.status}`); }
      return r.json();
    }
  };
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const data = await request(`https://api.github.com/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`, env.GH_TOKEN);
    if (!Array.isArray(data.jobs)) throw Error('Invalid jobs response');
    jobs.push(...data.jobs);
    if (jobs.length >= data.total_count) break;
    if (page === 10) throw Error('Too many deployment jobs');
  }
  let created = 0;
  for (const marker of deploymentMarkers(run, jobs)) {
    const tag = marker.tags.find(tag => tag.startsWith('deployment:'));
    const query = new URLSearchParams({ tags: tag, from: String(marker.time - 1), to: String(marker.time + 1), limit: '1' });
    const existing = await request(`${origin.origin}/api/annotations?${query}`, env.GRAFANA_ANNOTATIONS_TOKEN);
    if (!Array.isArray(existing)) throw Error('Invalid annotation response');
    if (existing.length) continue;
    await request(`${origin.origin}/api/annotations`, env.GRAFANA_ANNOTATIONS_TOKEN, marker);
    created++;
  }
  log(`Created ${created} deployment markers; successful deploy steps only.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).join(' ') !== '--send') throw Error('Use --send with a workflow_run event');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  syncDeployments({ run: event.workflow_run }).catch(() => { console.error('Deployment marker delivery failed; check Grafana access and workflow configuration.'); process.exitCode = 1; });
}

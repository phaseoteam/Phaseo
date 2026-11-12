import { mkdir, writeFile } from 'node:fs/promises';
import { dashboards, alertRules } from './definitions.mjs';
await mkdir(new URL('./dashboards/', import.meta.url), { recursive: true });
for (const dashboard of dashboards()) {
  await writeFile(new URL(`./dashboards/${dashboard.uid}.json`, import.meta.url), `${JSON.stringify(dashboard, null, 2)}\n`);
}
await writeFile(new URL('./alerts.json', import.meta.url), `${JSON.stringify(alertRules({ lokiUid: 'SET_LOKI_DATASOURCE_UID' }), null, 2)}\n`);
console.log('Generated five dashboards and five paused alert rules.');

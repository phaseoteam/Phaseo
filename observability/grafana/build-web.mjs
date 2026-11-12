import { spawn } from 'node:child_process';
import { readdir, stat, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const maxMapBytes = 30_000_000;
export async function sourceMapFiles(root) {
  const found = [];
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      // Never follow links out of the build tree.
      if (entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name.endsWith('.map')) found.push(file);
    }
  };
  try { await walk(path.resolve(root)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return found;
}
export async function validateSourceMaps(root) {
  const maps = await sourceMapFiles(root);
  if (!maps.length) throw new Error('Build produced no browser source maps; refusing to report a successful upload');
  for (const map of maps) {
    if ((await stat(map)).size > maxMapBytes) throw new Error(`Source map exceeds the 30 MB upload limit: ${path.basename(map)}`);
  }
}
async function run(bin, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: web, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Build/upload process exited ${code}`)));
  });
}
export async function buildWeb(env = process.env) {
  const keys = ['PUBLIC_RELEASE', 'FARO_SOURCEMAP_API_KEY', 'FARO_SOURCEMAP_ENDPOINT', 'FARO_SOURCEMAP_APP_ID', 'FARO_SOURCEMAP_STACK_ID'];
  if (keys.some(key => !env[key])) throw new Error(`Set private source-map configuration before building: ${keys.join(', ')}`);
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(env.PUBLIC_RELEASE)) throw new Error('PUBLIC_RELEASE must be a stable release identifier');
  const endpoint = new URL(env.FARO_SOURCEMAP_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.grafana\.net$/.test(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port) throw new Error('Use the HTTPS source-map endpoint from Grafana');
  const root = path.join(web, 'dist', 'client');
  try {
    const { FARO_SOURCEMAP_API_KEY, ...buildEnv } = env;
    await run(path.join(web, 'scripts/generate-docs-search.mjs'), [], buildEnv);
    await run(path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), ['build'], { ...buildEnv, PHASEO_PRIVATE_SOURCEMAPS: 'true' });
    await validateSourceMaps(root);
    await run(require.resolve('@grafana/faro-cli/cli'), [
      'upload', '--endpoint', endpoint.href, '--app-id', env.FARO_SOURCEMAP_APP_ID,
      '--stack-id', env.FARO_SOURCEMAP_STACK_ID, '--bundle-id', env.PUBLIC_RELEASE,
      '--output-path', root, '--recursive', '--max-upload-size', String(maxMapBytes),
    ], env);
  } finally {
    // Remove individual map files even after upload or build failure. The caller
    // must deploy this exact build artifact only after the command succeeds.
    for (const map of await sourceMapFiles(root)) await unlink(map);
    if ((await sourceMapFiles(root)).length) throw new Error('Browser source maps remain in the deployment artifact');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildWeb().catch(error => { console.error(error.message); process.exitCode = 1; });
}

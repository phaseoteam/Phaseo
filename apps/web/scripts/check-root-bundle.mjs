// Checks the JavaScript every page preloads after `vite build`.
// The root route's preloads are downloaded on every page, so a route file that
// imports a page module from its loader, beforeLoad or pendingComponent quietly
// adds that whole page here. Run after the build: `pnpm run check:root-bundle`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budgetKB = Number(process.env.ROOT_BUNDLE_BUDGET_KB ?? 850);
const serverAssets = path.join(webRoot, 'dist/server/assets');
const clientRoot = path.join(webRoot, 'dist/client');

const manifestFile = fs.existsSync(serverAssets)
	? fs.readdirSync(serverAssets).find((file) => file.startsWith('_tanstack-start-manifest'))
	: undefined;
if (!manifestFile) {
	console.error('check-root-bundle: no TanStack Start manifest in dist/server/assets. Run the build first.');
	process.exit(1);
}

const source = fs.readFileSync(path.join(serverAssets, manifestFile), 'utf8');
const start = source.indexOf('var tsrStartManifest');
const end = source.lastIndexOf('//#endregion');
if (start < 0 || end < start) {
	console.error(`check-root-bundle: could not read ${manifestFile}; the manifest format may have changed.`);
	process.exit(1);
}
const routes = new Function(`${source.slice(start, end)}; return tsrStartManifest();`)().routes;
const preloads = routes.__root__?.preloads ?? [];
if (preloads.length === 0) {
	console.error('check-root-bundle: the root route has no preloads; the manifest format may have changed.');
	process.exit(1);
}

const chunks = preloads.map((file) => {
	const bytes = fs.readFileSync(path.join(clientRoot, file));
	return { file, rawKB: bytes.length / 1024, brotliKB: zlib.brotliCompressSync(bytes).length / 1024 };
});
const totalKB = chunks.reduce((sum, chunk) => sum + chunk.brotliKB, 0);
const largest = [...chunks].sort((a, b) => b.brotliKB - a.brotliKB).slice(0, 8);

console.log(`Every page preloads ${chunks.length} JavaScript files, ${Math.round(totalKB)} KB brotli (budget ${budgetKB} KB).`);
for (const chunk of largest) {
	console.log(`  ${chunk.brotliKB.toFixed(0).padStart(5)} KB  ${chunk.file}`);
}
if (totalKB > budgetKB) {
	console.error(
		`\ncheck-root-bundle: ${Math.round(totalKB - budgetKB)} KB over budget. Look for a route file whose loader, beforeLoad ` +
			'or pendingComponent imports from a page module, and move what it needs into a small module.',
	);
	process.exit(1);
}

import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "packages", "shared", "brand-assets", "assets");
const destinations = [
	path.join(root, "apps", "web", "public"),
	path.join(root, "packages", "devtools", "raycast-extension", "assets"),
];
const checkOnly = process.argv.includes("--check");

async function filesIn(directory, prefix = "") {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const relative = path.join(prefix, entry.name);
		if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative));
		else files.push(relative);
	}
	return files;
}

async function sameFile(left, right) {
	try {
		const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
		if (leftStat.size !== rightStat.size) return false;
		const [leftContent, rightContent] = await Promise.all([readFile(left), readFile(right)]);
		return leftContent.equals(rightContent);
	} catch {
		return false;
	}
}

const sourceFiles = await filesIn(source);
let differences = 0;

for (const destination of destinations) {
		if (!checkOnly) await mkdir(destination, { recursive: true });
		for (const relative of sourceFiles) {
			const from = path.join(source, relative);
			const to = path.join(destination, relative);
			if (checkOnly) {
				if (!(await sameFile(from, to))) {
					console.error(`Brand asset out of sync: ${path.relative(root, to)}`);
					differences += 1;
				}
			} else {
				await mkdir(path.dirname(to), { recursive: true });
				await cp(from, to, { force: true });
			}
		}
}

if (checkOnly && differences > 0) {
	process.exitCode = 1;
} else if (checkOnly) {
	console.log(`Brand assets are in sync (${sourceFiles.length} files, ${destinations.length} consumers).`);
} else {
	console.log(`Synced ${sourceFiles.length} brand assets to ${destinations.length} consumers.`);
}

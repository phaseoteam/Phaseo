// Link apps/web-start/messages to apps/web/messages so translations stay in one
// place. The copied source imports them relatively (including templated
// dynamic imports that bundler aliases cannot rewrite).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const link = path.join(root, "messages");
const target = path.resolve(root, "../web/messages");

try {
	const stat = fs.lstatSync(link);
	if (stat.isSymbolicLink() || stat.isDirectory()) {
		const resolved = fs.realpathSync(link);
		if (resolved === fs.realpathSync(target)) process.exit(0);
	}
	throw new Error(`${link} exists and does not point at ${target}`);
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}
fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
console.log(`linked ${path.relative(process.cwd(), link)} -> ${path.relative(process.cwd(), target)}`);

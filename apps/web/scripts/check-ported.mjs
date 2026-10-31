// Cheap per-file checks for ported components (no full build needed).
// usage: node scripts/check-ported.mjs <file> [file...]
// Fails when a component is still async, awaits inside a component body, or a
// file does not parse as TSX.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const problems = [];
for (const file of process.argv.slice(2)) {
	const code = fs.readFileSync(file, "utf8");
	const rel = path.relative(process.cwd(), file);
	const parsed = ts.transpileModule(code, { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
	const syntax = (parsed.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
	if (syntax.length) {
		problems.push(`${rel}: does not parse: ${ts.flattenDiagnosticMessageText(syntax[0].messageText, " ")}`);
		continue;
	}
	for (const m of code.matchAll(/(?:export\s+default\s+)?async\s+function\s+([A-Z][\w$]*)\s*\(/g)) {
		problems.push(`${rel}: component ${m[1]} is still async`);
	}
	if (/export\s+default\s+async\s+function\s*\(/.test(code)) problems.push(`${rel}: default export component is still async`);
	if (/from\s+["']next-intl\/server["']/.test(code) && !/generateMetadata|createServerFn|"use server"/.test(code)) {
		problems.push(`${rel}: imports next-intl/server outside metadata/server functions`);
	}
	if (/from\s+["']next\/headers["']/.test(code) && !/createServerFn|"use server"|import "server-only"/.test(code)) {
		problems.push(`${rel}: imports next/headers in a module that also renders in the browser`);
	}
}
if (problems.length) {
	console.log(problems.join("\n"));
	process.exit(1);
}
console.log(`ok (${process.argv.length - 2} files)`);

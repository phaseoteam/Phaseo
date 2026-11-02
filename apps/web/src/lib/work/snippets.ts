// Setup snippets shown once, when an intake form, error project or GitHub repo is created.
// The endpoints are served by apps/web-api under /api/_web/work.

export const WORK_PUBLIC_ORIGIN = "https://phaseo.app";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export function intakeFormUrl(token: string, origin = WORK_PUBLIC_ORIGIN): string {
	return `${origin}/api/_web/work/asks/${encodeURIComponent(token)}`;
}

export function errorIngestUrl(key: string, origin = WORK_PUBLIC_ORIGIN): string {
	return `${origin}/api/_web/work/errors/${encodeURIComponent(key)}`;
}

export function errorScriptUrl(origin = WORK_PUBLIC_ORIGIN): string {
	return `${origin}/api/_web/work/errors.js`;
}

/** A plain HTML form that posts an ask. Labels are left for the page owner to translate. */
export function intakeFormHtml(token: string, options: { redirect?: string; origin?: string } = {}): string {
	const lines = [
		`<form method="post" action="${escapeHtml(intakeFormUrl(token, options.origin))}">`,
		`  <input name="name" placeholder="Name" autocomplete="name">`,
		`  <input name="email" type="email" placeholder="Email" autocomplete="email">`,
		`  <input name="subject" placeholder="Subject">`,
		`  <textarea name="body" required placeholder="How can we help?"></textarea>`,
	];
	if (options.redirect) lines.push(`  <input type="hidden" name="redirect" value="${escapeHtml(options.redirect)}">`);
	lines.push(`  <button type="submit">Send</button>`, `</form>`);
	return lines.join("\n");
}

export function intakeCurlExample(token: string, origin?: string): string {
	const body = JSON.stringify({ subject: "Export fails", body: "The CSV export times out for large workspaces.", email: "someone@example.com" });
	return [`curl -X POST ${shellQuote(intakeFormUrl(token, origin))} \\`, `  -H 'content-type: application/json' \\`, `  -d ${shellQuote(body)}`].join("\n");
}

export function errorScriptTag(key: string, options: { release?: string; environment?: string; origin?: string } = {}): string {
	const attributes = [`src="${escapeHtml(errorScriptUrl(options.origin))}"`, `data-key="${escapeHtml(key)}"`, `data-release="${escapeHtml(options.release ?? "1.0.0")}"`, `data-environment="${escapeHtml(options.environment ?? "production")}"`];
	return `<script ${attributes.join(" ")}></script>`;
}

export function errorFetchExample(key: string, origin?: string): string {
	return [
		`await fetch(${JSON.stringify(errorIngestUrl(key, origin))}, {`,
		`  method: "POST",`,
		`  headers: { "content-type": "application/json" },`,
		`  body: JSON.stringify({`,
		`    type: error.name,`,
		`    message: error.message,`,
		`    stack: error.stack,`,
		`    release: process.env.RELEASE,`,
		`    environment: process.env.NODE_ENV,`,
		`    user: currentUser?.id, // optional: counts people affected; only a hash is kept`,
		`    timestamp: new Date().toISOString(),`,
		`  }),`,
		`});`,
	].join("\n");
}

/** A Node.js server: report uncaught errors (then exit, as Node would) and unhandled rejections. */
export function errorNodeExample(key: string, origin?: string): string {
	return [
		`const PHASEO_ERRORS = ${JSON.stringify(errorIngestUrl(key, origin))};`,
		`function reportError(error) {`,
		`  const err = error instanceof Error ? error : new Error(String(error));`,
		`  return fetch(PHASEO_ERRORS, {`,
		`    method: "POST",`,
		`    headers: { "content-type": "application/json" },`,
		`    body: JSON.stringify({ type: err.name, message: err.message, stack: err.stack, release: process.env.RELEASE, environment: process.env.NODE_ENV }),`,
		`  }).catch(() => {});`,
		`}`,
		`process.on("uncaughtException", (error) => { reportError(error).finally(() => process.exit(1)); });`,
		`process.on("unhandledRejection", (reason) => { reportError(reason); });`,
	].join("\n");
}

export function sourcemapUploadUrl(origin = WORK_PUBLIC_ORIGIN): string {
	return `${origin}/api/_web/work/sourcemaps`;
}

/** Uploads every .map in a build folder for a release, from CI. The token goes in a CI secret. */
export function sourcemapUploadExample(token: string, origin?: string): string {
	return [
		`# In CI after the build. Keep the token in a secret (PHASEO_SOURCEMAP_TOKEN).`,
		`export PHASEO_SOURCEMAP_TOKEN=${shellQuote(token)}`,
		`RELEASE="$(git rev-parse --short HEAD)"   # the same release your app reports`,
		`for map in dist/assets/*.js.map; do`,
		`  file="$(basename "$map" .map)"`,
		`  curl -sS --fail -X POST "${sourcemapUploadUrl(origin)}?release=$RELEASE&file=$file" \\`,
		`    -H "authorization: Bearer $PHASEO_SOURCEMAP_TOKEN" \\`,
		`    -H "content-type: application/json" --data-binary "@$map"`,
		`done`,
	].join("\n");
}

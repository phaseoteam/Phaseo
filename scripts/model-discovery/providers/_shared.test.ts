import assert from "node:assert/strict";
import { fetchJson } from "./_shared";

async function withMockFetch(response: Response, run: () => Promise<void>): Promise<void> {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () => response) as typeof fetch;
	try {
		await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

async function main(): Promise<void> {
	await withMockFetch(
		new Response(JSON.stringify({ error: { message: "fireworks upstream failure" } }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
		async () => {
			await assert.rejects(
				fetchJson({ url: "https://example.com/models" }),
				/fireworks upstream failure/i,
			);
		}
	);

	await withMockFetch(
		new Response(JSON.stringify({ base_resp: { status_code: 123 }, msg: "rate limited" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
		async () => {
			await assert.rejects(
				fetchJson({ url: "https://example.com/models" }),
				/status_code 123: rate limited/i,
			);
		}
	);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});

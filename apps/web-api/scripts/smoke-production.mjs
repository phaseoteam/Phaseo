import { createHmac, randomUUID } from "node:crypto";

const origin = (process.env.PHASEO_WEB_ORIGIN ?? "https://phaseo.app").replace(/\/$/, "");
const includeLegacyApiSmokes = process.env.INCLUDE_LEGACY_API_SMOKES === "1";
const includeSignedStripeWebhookSmoke = process.env.SIGNED_STRIPE_WEBHOOK_SMOKE === "1";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function request(name, path, options = {}) {
	const response = await fetch(`${origin}${path}`, {
		redirect: "manual",
		...options,
	});

	return { name, response };
}

function requireVercel(response, name) {
	assert(response.headers.has("x-vercel-id"), `${name} was not served by Vercel.`);
}

async function main() {
	const { response: models } = await request("models", "/api/_web/models?limit=1");
	assert(models.status === 200, `Models endpoint returned ${models.status}, expected 200.`);
	assert(!models.headers.has("x-vercel-id"), "Models endpoint unexpectedly reached Vercel.");
	assert(
		models.headers.get("server")?.toLowerCase().includes("cloudflare"),
		"Models endpoint did not report a Cloudflare response.",
	);

	const cacheControl = models.headers.get("cache-control") ?? "";
	assert(cacheControl.includes("s-maxage=300"), "Models response is missing s-maxage=300.");
	assert(
		cacheControl.includes("stale-while-revalidate=300"),
		"Models response is missing stale-while-revalidate=300.",
	);
	console.log("PASS models: Cloudflare route and cache contract");

	const { response: search } = await request("search", "/api/_web/search");
	assert(search.status === 200, `Search endpoint returned ${search.status}, expected 200.`);
	assert(!search.headers.has("x-vercel-id"), "Search endpoint unexpectedly reached Vercel.");
	const searchCacheControl = search.headers.get("cache-control") ?? "";
	assert(searchCacheControl.includes("s-maxage=900"), "Search response is missing s-maxage=900.");
	assert(
		searchCacheControl.includes("stale-while-revalidate=3600"),
		"Search response is missing stale-while-revalidate=3600.",
	);
	console.log("PASS search: Cloudflare route and cache contract");

	if (!includeLegacyApiSmokes) {
		console.log("SKIP legacy API checks (set INCLUDE_LEGACY_API_SMOKES=1 to verify checkout and Stripe routing).");
		return;
	}

	const jsonHeaders = { "content-type": "application/json" };
	const { response: checkout } = await request("checkout", "/api/checkout/create", {
		method: "POST",
		headers: jsonHeaders,
		body: "{}",
	});
	assert(checkout.status === 401, `Checkout returned ${checkout.status}, expected 401 without a session.`);
	requireVercel(checkout, "Checkout");
	console.log("PASS checkout: Vercel route rejects an unauthenticated request");

	const { response: webhook } = await request("Stripe webhook", "/api/webhooks/stripe-checkout", {
		method: "POST",
		headers: jsonHeaders,
		body: "{}",
	});
	assert(webhook.status === 400, `Stripe webhook returned ${webhook.status}, expected 400 for an unsigned event.`);
	requireVercel(webhook, "Stripe webhook");
	console.log("PASS Stripe webhook: Vercel route rejects an unsigned event");

	if (!includeSignedStripeWebhookSmoke) return;

	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
	assert(webhookSecret, "SIGNED_STRIPE_WEBHOOK_SMOKE=1 requires STRIPE_WEBHOOK_SECRET.");
	const timestamp = Math.floor(Date.now() / 1_000);
	const payload = JSON.stringify({
		id: `evt_phaseo_smoke_${randomUUID().replaceAll("-", "")}`,
		object: "event",
		api_version: "2025-09-30.clover",
		created: timestamp,
		livemode: false,
		type: "customer.created",
		data: { object: { id: `cus_phaseo_smoke_${randomUUID().replaceAll("-", "")}`, object: "customer" } },
	});
	const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
	const { response: signedWebhook } = await request("signed Stripe webhook", "/api/webhooks/stripe-checkout", {
		method: "POST",
		headers: { ...jsonHeaders, "stripe-signature": `t=${timestamp},v1=${signature}` },
		body: payload,
	});
	assert(signedWebhook.status === 200, `Signed Stripe webhook returned ${signedWebhook.status}, expected 200.`);
	requireVercel(signedWebhook, "Signed Stripe webhook");
	console.log("PASS Stripe webhook: Vercel accepts a signed no-op event");
}

main().catch((error) => {
	console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});

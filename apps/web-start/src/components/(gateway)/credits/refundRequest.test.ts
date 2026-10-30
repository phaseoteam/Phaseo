import { requestCreditRefund } from "./refundRequest";

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

it("waits for and returns the actual refund status", async () => {
	let finish!: (response: Response) => void;
	global.fetch = jest.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
	let completed = false;
	const request = requestCreditRefund("pi_fixture", "test reason").then((result) => { completed = true; return result; });
	await Promise.resolve();
	expect(completed).toBe(false);
	finish(new Response(JSON.stringify({ status: "succeeded", message: "Refund submitted" })));
	await expect(request).resolves.toEqual({ status: "succeeded", message: "Refund submitted" });
	expect(global.fetch).toHaveBeenCalledWith("/api/stripe/refunds/request", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ paymentIntentId: "pi_fixture", reason: "test reason" }),
	});
});

it("rejects failed refunds instead of treating a toast ID as success", async () => {
	global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: "Not eligible" }), { status: 400 }));
	await expect(requestCreditRefund("pi_fixture", "test reason")).rejects.toThrow("Not eligible");
});

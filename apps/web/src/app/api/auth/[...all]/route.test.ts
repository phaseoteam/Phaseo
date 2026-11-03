const handler = jest.fn(async () => new Response("ok"));

jest.mock("better-auth/next-js", () => ({
	toNextJsHandler: (fn: (request: Request) => Promise<Response>) => ({ GET: fn, POST: fn, PATCH: fn, PUT: fn, DELETE: fn }),
}));
jest.mock("@/lib/auth/better-auth/server", () => ({ getAuth: () => ({ handler }) }));

import { GET, POST } from "./route";

describe("/api/auth/[...all]", () => {
	const original = { ...process.env };
	afterEach(() => {
		process.env = { ...original };
		handler.mockClear();
	});

	it("is a 404 while Supabase Auth is selected, without touching Better Auth", async () => {
		delete process.env.AUTH_PROVIDER;
		const response = await POST(new Request("https://phaseo.app/api/auth/sign-up/email", { method: "POST" }));
		expect(response.status).toBe(404);
		expect(handler).not.toHaveBeenCalled();
	});

	it("hands requests to Better Auth when AUTH_PROVIDER=better-auth", async () => {
		process.env.AUTH_PROVIDER = "better-auth";
		process.env.DATABASE_PROVIDER = "planetscale";
		const response = await GET(new Request("https://phaseo.app/api/auth/get-session"));
		expect(response.status).toBe(200);
		expect(handler).toHaveBeenCalledTimes(1);
	});
});

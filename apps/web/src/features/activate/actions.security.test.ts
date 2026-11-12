// CLI device activation: a code from a link is never used. The person types the code from their
// own terminal, it is kept in an httpOnly cookie between "Continue" and "Approve", and only that
// reviewed code (and only when the form shows it) can be approved or denied.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("@/lib/server/currentRequest", () => ({
	currentRequestCookie: vi.fn((name: string) => cookieJar.get(name)),
	setResponseCookie: vi.fn((name: string, value: string) => { cookieJar.set(name, value); }),
	deleteResponseCookie: vi.fn((name: string) => { cookieJar.delete(name); }),
}));
vi.mock("@/utils/supabase/server", () => ({
	createClient: vi.fn(),
}));
vi.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: vi.fn(async () => ({ workspaces: [{ id: "ws_1", name: "Team", role: "owner" }] })),
}));
vi.mock("@/lib/oauth/apiBaseUrl", () => ({ apiBaseUrl: () => "https://api.example" }));

import { approveDeviceAction, denyDeviceAction, reviewDeviceAction } from "./actions";
import { getActivatePageData, getActivateSignInRedirect } from "./page.functions";
import { setResponseCookie } from "@/lib/server/currentRequest";
import { createClient } from "@/utils/supabase/server";

const mockCreateClient = vi.mocked(createClient);

function signedIn(aal = { currentLevel: "aal1", nextLevel: "aal1" }) {
	mockCreateClient.mockResolvedValue({
		auth: {
			getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user_1" } }, error: null }),
			getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } }, error: null }),
			mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: aal, error: null }) },
		},
	} as never);
}

function form(fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

// redirect() from @/lib/navigation throws a TanStack redirect. serverRedirectAction passes it
// through to the caller, which navigates with the app router and resolves with no result.
const router = vi.hoisted(() => ({
	navigate: vi.fn(async (_options: unknown) => undefined),
	resolveRedirect: (redirect: { options: unknown }) => ({ options: redirect.options }),
}));
(globalThis as { __phaseoRouter?: typeof router }).__phaseoRouter = router;

async function expectRedirect(run: () => Promise<unknown>, href: string) {
	router.navigate.mockClear();
	await expect(run()).resolves.toBeUndefined();
	expect(router.navigate).toHaveBeenCalledTimes(1);
	expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({ href }));
}

function requestBody(call: number) {
	return JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body));
}

const fetchMock = vi.fn<typeof fetch>();

describe("CLI device activation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		cookieJar.clear();
		globalThis.fetch = fetchMock;
	});

	it("never uses a code from the link: a signed-in visitor without a typed code gets the empty entry form", async () => {
		signedIn();

		// The page data takes no input, so a user_code in the link has no way in.
		await expect(getActivatePageData()).resolves.toEqual({ userCode: "", request: null, workspaces: [] });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not carry the code from the link through sign-in", async () => {
		mockCreateClient.mockResolvedValue({
			auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
		} as never);

		await expect(getActivateSignInRedirect()).resolves.toBe("/sign-in?returnUrl=%2Factivate");
	});

	it("approves only the code the person typed, after showing what it asks for", async () => {
		signedIn();
		await expectRedirect(() => reviewDeviceAction({ data: form({ user_code: " WXYZ-1234 " }) }), "/activate");
		expect(setResponseCookie).toHaveBeenCalledWith(
			"phaseo_device_code",
			"WXYZ-1234",
			expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/" }),
		);
		expect(cookieJar.get("phaseo_device_code")).toBe("WXYZ-1234");

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ client: { name: "Phaseo CLI" }, scopes: ["keys:write", "workspaces:write"] }), { status: 200 }));
		const page = await getActivatePageData();
		expect(requestBody(0)).toEqual({ action: "lookup", user_code: "WXYZ-1234" });
		expect(page).toEqual({
			userCode: "WXYZ-1234",
			request: { client: { name: "Phaseo CLI" }, scopes: ["keys:write", "workspaces:write"] },
			workspaces: [{ id: "ws_1", name: "Team", role: "owner" }],
		});

		// A code in the submitted form is ignored: only the reviewed code is approved.
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
		await expectRedirect(
			() => approveDeviceAction({ data: form({ reviewed_code: "WXYZ-1234", user_code: "EVIL-CODE", workspace_id: "ws_1" }) }),
			"/activate?approved=1",
		);
		expect(requestBody(1)).toEqual({ action: "approve", user_code: "WXYZ-1234", workspace_id: "ws_1" });
		expect(cookieJar.size).toBe(0);
	});

	it("approves only the request shown in the form, not one reviewed in another tab", async () => {
		signedIn();
		// Tab A reviewed AAAA-AAAA, then tab B reviewed BBBB-BBBB (the cookie now holds B).
		cookieJar.set("phaseo_device_code", "BBBB-BBBB");
		await expectRedirect(() => approveDeviceAction({ data: form({ reviewed_code: "AAAA-AAAA", workspace_id: "ws_1" }) }), "/activate?error=1");
		await expectRedirect(() => denyDeviceAction({ data: form({ reviewed_code: "AAAA-AAAA" }) }), "/activate?error=1");
		await expectRedirect(() => approveDeviceAction({ data: form({ workspace_id: "ws_1" }) }), "/activate?error=1");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("cannot approve a code that was never typed on this page", async () => {
		signedIn();
		await expectRedirect(
			() => approveDeviceAction({ data: form({ reviewed_code: "ABCD-EFGH", user_code: "ABCD-EFGH", workspace_id: "ws_1" }) }),
			"/activate?error=1",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps requiring MFA before approving", async () => {
		signedIn({ currentLevel: "aal1", nextLevel: "aal2" });
		cookieJar.set("phaseo_device_code", "WXYZ-1234");

		await expectRedirect(() => approveDeviceAction({ data: form({ reviewed_code: "WXYZ-1234", workspace_id: "ws_1" }) }), "/activate?error=1");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(cookieJar.get("phaseo_device_code")).toBe("WXYZ-1234");
	});

	it("shows an error instead of failing when a typed code is wrong, or missing", async () => {
		signedIn();
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }));

		cookieJar.set("phaseo_device_code", "NOPE-NOPE");
		await expectRedirect(() => denyDeviceAction({ data: form({ reviewed_code: "NOPE-NOPE" }) }), "/activate?error=1");
		expect(requestBody(0)).toEqual({ action: "deny", user_code: "NOPE-NOPE" });
		await expectRedirect(() => approveDeviceAction({ data: form({ user_code: "", workspace_id: "ws_1" }) }), "/activate?error=1");
		await expectRedirect(() => reviewDeviceAction({ data: form({ user_code: "   " }) }), "/activate?error=1");
	});

	it("shows the entry form again when the reviewed code's lookup fails", async () => {
		signedIn();
		cookieJar.set("phaseo_device_code", "NOPE-NOPE");
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }));
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			await expect(getActivatePageData()).resolves.toEqual({ userCode: "NOPE-NOPE", request: null, workspaces: [] });
		} finally {
			log.mockRestore();
		}
	});
});

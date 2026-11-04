jest.mock("next-intl/server", () => ({
	getTranslations: jest.fn(async () => (key: string) => key),
}));
jest.mock("next/navigation", () => ({
	redirect: jest.fn((url: string) => {
		throw Object.assign(new Error("NEXT_REDIRECT"), { url });
	}),
}));
jest.mock("@/utils/supabase/server", () => ({
	createClient: jest.fn(),
}));
jest.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: jest.fn(async () => ({ workspaces: [{ id: "ws_1", name: "Team", role: "owner" }] })),
}));
jest.mock("@/lib/oauth/apiBaseUrl", () => ({ apiBaseUrl: () => "https://api.example" }));
const cookieJar = new Map<string, string>();
jest.mock("next/headers", () => ({
	cookies: jest.fn(async () => ({
		get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
		set: (name: string, value: string) => { cookieJar.set(name, value); },
		delete: (name: string) => { cookieJar.delete(name); },
	})),
}));
jest.mock("./WorkspaceSelectField", () => ({
	WorkspaceSelectField: () => null,
}));

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import ActivatePage from "./page";
import { approveDeviceAction, denyDeviceAction, reviewDeviceAction } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function signedIn(aal = { currentLevel: "aal1", nextLevel: "aal1" }) {
	mockCreateClient.mockResolvedValue({
		auth: {
			getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user_1" } }, error: null }),
			getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "token" } }, error: null }),
			mfa: { getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data: aal, error: null }) },
		},
	} as never);
}

async function renderPage(searchParams: Record<string, string>) {
	const suspense = ActivatePage({ searchParams: Promise.resolve(searchParams) }) as ReactElement<{ children: ReactElement }>;
	const content = suspense.props.children as ReactElement<Record<string, unknown>>;
	const render = content.type as (props: Record<string, unknown>) => Promise<ReactElement>;
	return renderToStaticMarkup(await render(content.props));
}

function form(fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe("CLI device activation", () => {
	const fetchMock = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		fetchMock.mockReset();
		cookieJar.clear();
		global.fetch = fetchMock as never;
	});

	it("never pre-fills a code from the link, and warns about codes from someone else", async () => {
		signedIn();
		const html = await renderPage({ user_code: "ABCD-EFGH" });

		expect(html).not.toContain("ABCD-EFGH");
		expect(html).toMatch(/<input[^>]*name="user_code"[^>]*>/);
		expect(html).not.toMatch(/<input[^>]*name="user_code"[^>]*value=/);
		expect(html).not.toMatch(/type="hidden"[^>]*name="user_code"/);
		expect(html).toContain("phishingWarning");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not carry the code from the link through sign-in", async () => {
		mockCreateClient.mockResolvedValue({
			auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
		} as never);

		await expect(renderPage({ user_code: "ABCD-EFGH" })).rejects.toMatchObject({ url: "/sign-in?returnUrl=%2Factivate" });
	});

	it("approves only the code the person typed, after showing what it asks for", async () => {
		signedIn();
		await expect(reviewDeviceAction(form({ user_code: " WXYZ-1234 " }))).rejects.toMatchObject({ url: "/activate" });

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ client: { name: "Phaseo CLI" }, scopes: ["keys:write", "workspaces:write"] }), { status: 200 }));
		const html = await renderPage({});
		expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ action: "lookup", user_code: "WXYZ-1234" });
		expect(html).toContain("requestedScopes");
		expect(html).toContain("keys:write");
		expect(html).toContain("workspaces:write");
		expect(html).toContain("WXYZ-1234");
		expect(html).toContain("phishingWarning");

		// A code in the submitted form is ignored: only the reviewed code is approved.
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
		expect(html).toMatch(/name="reviewed_code"[^>]*value="WXYZ-1234"|value="WXYZ-1234"[^>]*name="reviewed_code"/);
		await expect(approveDeviceAction(form({ reviewed_code: "WXYZ-1234", user_code: "EVIL-CODE", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?approved=1" });
		expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ action: "approve", user_code: "WXYZ-1234", workspace_id: "ws_1" });
		expect(cookieJar.size).toBe(0);
	});

	it("approves only the request shown in the form, not one reviewed in another tab", async () => {
		signedIn();
		// Tab A reviewed AAAA-AAAA, then tab B reviewed BBBB-BBBB (the cookie now holds B).
		cookieJar.set("phaseo_device_code", "BBBB-BBBB");
		await expect(approveDeviceAction(form({ reviewed_code: "AAAA-AAAA", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		await expect(denyDeviceAction(form({ reviewed_code: "AAAA-AAAA" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		await expect(approveDeviceAction(form({ workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("cannot approve a code that was never typed on this page", async () => {
		signedIn();
		await expect(approveDeviceAction(form({ reviewed_code: "ABCD-EFGH", user_code: "ABCD-EFGH", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps requiring MFA before approving", async () => {
		signedIn({ currentLevel: "aal1", nextLevel: "aal2" });
		cookieJar.set("phaseo_device_code", "WXYZ-1234");
		const mfaForm = form({ reviewed_code: "WXYZ-1234", workspace_id: "ws_1" });

		await expect(approveDeviceAction(mfaForm)).rejects.toMatchObject({ url: "/activate?error=1" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("shows an error instead of failing when a typed code is wrong, or missing", async () => {
		signedIn();
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }));

		cookieJar.set("phaseo_device_code", "NOPE-NOPE");
		await expect(denyDeviceAction(form({ reviewed_code: "NOPE-NOPE" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		await expect(approveDeviceAction(form({ user_code: "", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		expect(redirect).toHaveBeenCalledWith("/activate?error=1");
	});
});

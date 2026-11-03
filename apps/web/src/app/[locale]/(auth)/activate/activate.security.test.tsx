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
jest.mock("./WorkspaceSelectField", () => ({
	WorkspaceSelectField: () => null,
}));

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import ActivatePage from "./page";
import { approveDeviceAction, denyDeviceAction } from "./actions";
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

	it("approves only the code the person typed", async () => {
		signedIn();
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		await expect(approveDeviceAction(form({ user_code: " WXYZ-1234 ", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?approved=1" });

		expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ action: "approve", user_code: "WXYZ-1234", workspace_id: "ws_1" });
	});

	it("keeps requiring MFA before approving", async () => {
		signedIn({ currentLevel: "aal1", nextLevel: "aal2" });

		await expect(approveDeviceAction(form({ user_code: "WXYZ-1234", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("shows an error instead of failing when a typed code is wrong, or missing", async () => {
		signedIn();
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }));

		await expect(denyDeviceAction(form({ user_code: "NOPE-NOPE" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		await expect(approveDeviceAction(form({ user_code: "", workspace_id: "ws_1" }))).rejects.toMatchObject({ url: "/activate?error=1" });
		expect(redirect).toHaveBeenCalledWith("/activate?error=1");
	});
});

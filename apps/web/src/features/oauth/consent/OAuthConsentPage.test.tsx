import { describe, it, expect, vi } from "vitest";
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));

import { createClient } from "@/utils/supabase/server";
import { resolveOAuthConsent } from "./page.functions";

// The page renders ConsentForm only for an "ok" resolution; every other kind
// renders an error card instead.
describe("desktop consent page", () => {
	it("renders consent for the registered desktop callback with its temporary port", async () => {
		const metadata = { client_id: "phaseo_desktop", name: "Phaseo Desktop", is_first_party: true, registration_source: "first_party", redirect_uris: ["http://127.0.0.1/callback"] };
		const missing = { data: null, error: { message: "No legacy app" } };
		const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue(missing) };
		vi.mocked(createClient).mockResolvedValue({ auth: {
			getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owned-user" } }, error: null }),
			getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "owned-session" } } }),
		}, from: vi.fn((table: string) => table === "workspace_members" ? { select: () => ({ eq: async () => ({ data: [{ teams: { id: "owned-workspace", name: "Owned" } }], error: null }) }) } : query) } as never);
		const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify(metadata)));
		try {
			for (const redirectUri of ["http://127.0.0.1:30397/callback", "https://example.com/callback"]) {
				const resolution = await resolveOAuthConsent({ data: { client_id: "phaseo_desktop", redirect_uri: redirectUri, scope: "gateway:access models:read", state: "owned-state", code_challenge: "A".repeat(43), code_challenge_method: "S256" } });
				if (redirectUri.startsWith("http://127.0.0.1")) {
					expect(resolution).toMatchObject({ kind: "ok", resolvedRedirectUri: redirectUri, resolvedClientId: "phaseo_desktop" });
				} else expect(resolution.kind).not.toBe("ok");
			}
		} finally { fetchMock.mockRestore(); }
	});
});

describe("OAuth app metadata on the consent page", () => {
	// What the consent page needs; never the secret hash, creator or workspace.
	const CONSENT_COLUMNS = ["client_id", "name", "description", "logo_url", "homepage_url", "privacy_policy_url", "terms_of_service_url", "allowed_scopes", "redirect_uris", "is_first_party", "status"];
	const stored = {
		client_id: "client-1", name: "Example", description: "An app", logo_url: null, homepage_url: "https://example.com",
		privacy_policy_url: null, terms_of_service_url: null, allowed_scopes: ["models:read"], redirect_uris: ["https://example.com/cb"],
		is_first_party: false, status: "active",
		client_secret_hash: "do-not-send-hash", created_by: "do-not-send-creator", workspace_id: "do-not-send-workspace",
	};

	/** A Supabase client whose oauth_app_metadata reads return only the selected columns, as PostgREST does. */
	function fakeSupabase(selected: string[]) {
		const row = () => {
			const columns = selected.at(-1)!.split(",").map((column) => column.trim());
			return columns.includes("*") ? { ...stored } : Object.fromEntries(Object.entries(stored).filter(([key]) => columns.includes(key)));
		};
		const metadata = {
			select: vi.fn((columns: string) => { selected.push(columns); return metadata; }),
			eq: vi.fn(() => metadata),
			maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
			single: vi.fn(async () => ({ data: row(), error: null })),
		};
		return {
			auth: {
				getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
				getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "session" } } }),
				oauth: { getAuthorizationDetails: vi.fn().mockResolvedValue({ data: { client: { id: "client-1", name: "Example" }, redirect_uri: "https://example.com/cb", scope: "models:read" }, error: null }) },
			},
			from: vi.fn((table: string) => table === "workspace_members"
				? { select: () => ({ eq: async () => ({ data: [{ teams: { id: "workspace-a", name: "Mine" } }], error: null }) }) }
				: metadata),
		};
	}

	it.each([
		["an authorization id", { authorization_id: "authorization-1" }],
		["direct parameters", { client_id: "client-1", redirect_uri: "https://example.com/cb", scope: "models:read", code_challenge: "A".repeat(43), code_challenge_method: "S256" }],
	])("reads only the display columns with %s, and sends no secret or ownership fields", async (_label, params) => {
		const selected: string[] = [];
		vi.mocked(createClient).mockResolvedValue(fakeSupabase(selected) as never);
		const resolution = await resolveOAuthConsent({ data: params as never });
		expect(resolution).toMatchObject({ kind: "ok", oauthApp: { client_id: "client-1", name: "Example" } });
		expect(selected).toHaveLength(1);
		expect(selected[0].split(",").map((column) => column.trim()).sort()).toEqual([...CONSENT_COLUMNS].sort());
		const serialized = JSON.stringify(resolution);
		expect(serialized).not.toMatch(/do-not-send|client_secret_hash|created_by/);
		expect(Object.keys((resolution as { oauthApp: Record<string, unknown> }).oauthApp)).not.toContain("workspace_id");
	});
});

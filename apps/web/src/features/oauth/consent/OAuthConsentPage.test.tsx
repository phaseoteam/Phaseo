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

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
jest.mock("@/components/(gateway)/oauth/ConsentForm", () => ({ __esModule: true, default: jest.fn() }));

import { createClient } from "@/utils/supabase/server";
import ConsentForm from "@/components/(gateway)/oauth/ConsentForm";
import ConsentPage from "./page";

describe("desktop consent page", () => {
	it("renders consent for the registered desktop callback with its temporary port", async () => {
		const metadata = { client_id: "phaseo_desktop", name: "Phaseo Desktop", is_first_party: true, registration_source: "first_party", redirect_uris: ["http://127.0.0.1/callback"] };
		const missing = { data: null, error: { message: "No legacy app" } };
		const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(missing) };
		jest.mocked(createClient).mockResolvedValue({ auth: {
			getUser: jest.fn().mockResolvedValue({ data: { user: { id: "owned-user" } }, error: null }),
			getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "owned-session" } } }),
		}, from: jest.fn((table: string) => table === "workspace_members" ? { select: () => ({ eq: async () => ({ data: [{ teams: { id: "owned-workspace", name: "Owned" } }], error: null }) }) } : query) } as never);
		const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify(metadata)));
		try {
			for (const redirectUri of ["http://127.0.0.1:30397/callback", "https://example.com/callback"]) {
				const shell = await ConsentPage({ searchParams: Promise.resolve({ client_id: "phaseo_desktop", redirect_uri: redirectUri, scope: "gateway:access models:read", state: "owned-state", code_challenge: "A".repeat(43), code_challenge_method: "S256" }) });
				const contentComponent = shell.props.children;
				const content = await contentComponent.type(contentComponent.props);
				if (redirectUri.startsWith("http://127.0.0.1")) {
					expect(content.props.children.type).toBe(ConsentForm);
					expect(content.props.children.props.redirectUri).toBe(redirectUri);
					expect(content.props.children.props.clientId).toBe("phaseo_desktop");
				} else expect(content.props.children.type).not.toBe(ConsentForm);
			}
		} finally { fetchMock.mockRestore(); }
	});
});

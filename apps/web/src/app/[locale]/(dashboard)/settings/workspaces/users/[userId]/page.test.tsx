import Page from "./page";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchWorkspaceUser } from "@/lib/fetchers/internal/fetchWorkspaceUser";
import { redirect } from "@/i18n/navigation";

jest.mock("next-intl/server", () => ({ getLocale: async () => "en-GB", getTranslations: async () => (key: string) => key }));
jest.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
jest.mock("@/i18n/navigation", () => ({ redirect: jest.fn(() => { throw new Error("redirect"); }) }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchWorkspaceUser", () => ({ fetchWorkspaceUser: jest.fn() }));
jest.mock("@/components/(gateway)/settings/SettingsSectionFallback", () => () => null);
jest.mock("@/components/(gateway)/settings/workspaces/WorkspaceUserView", () => ({ WorkspaceUserView: () => null }));

beforeEach(() => { jest.clearAllMocks(); });

it("redirects a self-profile URL before calling the workspace API", async () => {
	jest.mocked(getServerAccountContext).mockResolvedValue({ userId: "self", accessToken: null, obfuscateInfo: null, workspaceId: null });
	const child = Page({ params: Promise.resolve({ userId: "self" }), searchParams: Promise.resolve({}) }).props.children;
	await expect(child.type(child.props)).rejects.toThrow("redirect");
	expect(redirect).toHaveBeenCalledWith({ href: "/settings/profile", locale: "en-GB" });
	expect(fetchWorkspaceUser).not.toHaveBeenCalled();
});

it("retains workspace-scoped reads for another user's profile", async () => {
	jest.mocked(getServerAccountContext).mockResolvedValue({ userId: "self", accessToken: null, obfuscateInfo: null, workspaceId: null });
	const child = Page({ params: Promise.resolve({ userId: "other" }), searchParams: Promise.resolve({ workspaceId: "workspace", keyPage: "2" }) }).props.children;
	await child.type(child.props);
	expect(fetchWorkspaceUser).toHaveBeenCalledWith("other", "workspace", "2");
	expect(redirect).not.toHaveBeenCalled();
});

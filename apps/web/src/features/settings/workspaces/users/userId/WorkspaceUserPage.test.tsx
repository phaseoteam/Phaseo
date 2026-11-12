import { it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { workspaceUserQuery } from "./workspaceUser.functions";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchWorkspaceUser } from "@/lib/fetchers/internal/fetchWorkspaceUser";

vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));
vi.mock("@/lib/fetchers/internal/fetchWorkspaceUser", () => ({ fetchWorkspaceUser: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

// The page and the route's beforeLoad redirect a "self" result to /settings/profile.
it("redirects a self-profile URL before calling the workspace API", async () => {
	vi.mocked(getServerAccountContext).mockResolvedValue({ userId: "self", accessToken: null, obfuscateInfo: null, workspaceId: null });
	await expect(new QueryClient().fetchQuery(workspaceUserQuery("self", undefined, undefined))).resolves.toEqual({ kind: "self" });
	expect(fetchWorkspaceUser).not.toHaveBeenCalled();
});

it("retains workspace-scoped reads for another user's profile", async () => {
	vi.mocked(getServerAccountContext).mockResolvedValue({ userId: "self", accessToken: null, obfuscateInfo: null, workspaceId: null });
	vi.mocked(fetchWorkspaceUser).mockResolvedValue({} as never);
	await expect(new QueryClient().fetchQuery(workspaceUserQuery("other", "workspace", "2"))).resolves.toMatchObject({ kind: "ok" });
	expect(fetchWorkspaceUser).toHaveBeenCalledWith("other", "workspace", "2");
});

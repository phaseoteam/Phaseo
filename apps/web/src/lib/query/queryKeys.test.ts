import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	toAccountQueryScope,
	webQueryKeys,
} from "./queryKeys";

describe("web query keys", () => {
	it("separates account data by user and workspace", () => {
		const first = toAccountQueryScope({ userId: "user-1", workspaceId: "workspace-1" });
		const second = toAccountQueryScope({ userId: "user-1", workspaceId: "workspace-2" });
		const third = toAccountQueryScope({ userId: "user-2", workspaceId: "workspace-1" });

		expect(webQueryKeys.account.scope(first)).not.toEqual(
			webQueryKeys.account.scope(second),
		);
		expect(webQueryKeys.account.scope(first)).not.toEqual(
			webQueryKeys.account.scope(third),
		);
	});

	it("never places an access token in a private key", () => {
		const token = "eyJhbGciOiJIUzI1NiJ9.private-secret";
		const key = webQueryKeys.account.catalogue({
			scope: toAccountQueryScope({ userId: "user-1", workspaceId: "workspace-1" }),
			catalogueVersion: "v1",
			previewCacheScope: "preview-1",
		});

		expect(JSON.stringify(key)).not.toContain(token);
	});

	it("normalizes signed-out scope to an anonymous key", () => {
		expect(webQueryKeys.account.scope(ANONYMOUS_ACCOUNT_QUERY_SCOPE)).toEqual([
			"phaseo-web",
			"account",
			"scope",
			"anonymous",
			"none",
		]);
		expect(toAccountQueryScope({ userId: null, workspaceId: "ignored" })).toEqual(
			ANONYMOUS_ACCOUNT_QUERY_SCOPE,
		);
	});
});

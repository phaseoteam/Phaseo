import { describe, expect, it } from "vitest";

import {
	connectionKeyringFromEnv,
	connectionSecretKeyVersion,
	decryptConnectionSecret,
	encryptConnectionSecret,
	hashOAuthState,
	hubToolName,
	labelSlugFromName,
} from "./mcp-connections-shared";

const KEY_V1 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const KEY_V2 = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
const context = { recordId: "conn_1", field: "access_token" as const, workspaceId: "ws_1", userId: "user_1" };

describe("connection secrets", () => {
	it("round-trips and never stores the plaintext", async () => {
		const keyring = connectionKeyringFromEnv({ MCP_CONNECTIONS_KEY_V1: KEY_V1 });
		const sealed = await encryptConnectionSecret(keyring, "lin_oauth_secret", context);
		expect(sealed).toMatch(/^mcpv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		expect(sealed).not.toContain("lin_oauth_secret");
		await expect(decryptConnectionSecret(keyring, sealed, context)).resolves.toBe("lin_oauth_secret");
	});

	it("refuses a secret moved to another row, owner or field", async () => {
		const keyring = connectionKeyringFromEnv({ MCP_CONNECTIONS_KEY_V1: KEY_V1 });
		const sealed = await encryptConnectionSecret(keyring, "secret", context);
		for (const moved of [
			{ ...context, recordId: "conn_2" },
			{ ...context, userId: "user_2" },
			{ ...context, workspaceId: "ws_2" },
			{ ...context, field: "refresh_token" as const },
		]) {
			await expect(decryptConnectionSecret(keyring, sealed, moved)).rejects.toThrow("mcp_connection_secret_undecryptable");
		}
		await expect(decryptConnectionSecret(keyring, "not-a-secret", context)).rejects.toThrow("mcp_connection_secret_malformed");
	});

	it("keeps reading old secrets after the active key rotates", async () => {
		const before = connectionKeyringFromEnv({ MCP_CONNECTIONS_KEY_V1: KEY_V1 });
		const old = await encryptConnectionSecret(before, "old", context);
		const after = connectionKeyringFromEnv({ MCP_CONNECTIONS_KEY_V1: KEY_V1, MCP_CONNECTIONS_KEY_V2: KEY_V2, MCP_CONNECTIONS_ACTIVE_KEY_VERSION: "2" });
		const fresh = await encryptConnectionSecret(after, "new", context);
		expect(connectionSecretKeyVersion(old)).toBe(1);
		expect(connectionSecretKeyVersion(fresh)).toBe(2);
		await expect(decryptConnectionSecret(after, old, context)).resolves.toBe("old");
		await expect(decryptConnectionSecret(before, fresh, context)).rejects.toThrow("mcp_connections_key_v2_missing");
	});

	it("rejects keys that are not 32 bytes", async () => {
		const keyring = connectionKeyringFromEnv({ MCP_CONNECTIONS_KEY_V1: btoa("short") });
		await expect(encryptConnectionSecret(keyring, "x", context)).rejects.toThrow("mcp_connections_key_v1_must_be_32_bytes");
	});
});

describe("connection naming", () => {
	it("hashes OAuth state", async () => {
		expect(await hashOAuthState("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	});

	it("makes label slugs that satisfy the table check", () => {
		expect(labelSlugFromName("Linear")).toBe("linear");
		expect(labelSlugFromName("Linear (work)")).toBe("linear_work");
		expect(labelSlugFromName("Résumé tools")).toBe("resume_tools");
		expect(labelSlugFromName("42 Stripe")).toBe("stripe");
		expect(labelSlugFromName("!!!")).toBe("server");
		expect(labelSlugFromName("a".repeat(40))).toHaveLength(24);
	});

	it("keeps hub tool names within 64 characters and unique", () => {
		expect(hubToolName("linear", "list_issues")).toBe("linear__list_issues");
		expect(hubToolName("notion", "notion-search")).toBe("notion__notion-search");
		expect(hubToolName("x", "a tool/with:odd chars")).toBe("x__a_tool_with_odd_chars");
		const long = hubToolName("atlassian_work", `get_${"confluence_".repeat(8)}page`);
		const other = hubToolName("atlassian_work", `get_${"confluence_".repeat(8)}pages`);
		expect(long).toHaveLength(64);
		expect(other).toHaveLength(64);
		expect(long).not.toBe(other);
	});
});

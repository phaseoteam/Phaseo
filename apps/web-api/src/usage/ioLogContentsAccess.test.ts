import { describe, expect, it } from "vitest";
import { canReadIoLogContents, readIoLogContentsAccess } from "./ioLogContentsAccess";

function settingsClient(result: { data: unknown; error: unknown }) {
	const query: Record<string, unknown> = {};
	query.select = () => query;
	query.eq = () => query;
	query.maybeSingle = async () => result;
	return { from: () => query };
}

describe("canReadIoLogContents", () => {
	it("lets every member read when the workspace allows members", () => {
		expect(canReadIoLogContents("members", "member")).toBe(true);
	});

	it("limits reading to owners and admins when the workspace asks", () => {
		expect(canReadIoLogContents("admins", "member")).toBe(false);
		expect(canReadIoLogContents("admins", "admin")).toBe(true);
		expect(canReadIoLogContents("admins", "Owner")).toBe(true);
	});

	it("hides contents when the setting is unknown", () => {
		expect(canReadIoLogContents(null, "admin")).toBe(false);
	});
});

describe("readIoLogContentsAccess", () => {
	it("reads the workspace setting", async () => {
		await expect(readIoLogContentsAccess(settingsClient({ data: { io_logging_contents_access: "admins" }, error: null }), "ws")).resolves.toBe("admins");
	});

	it("defaults to members when the workspace has no settings row", async () => {
		await expect(readIoLogContentsAccess(settingsClient({ data: null, error: null }), "ws")).resolves.toBe("members");
	});

	it("treats a missing column as the default before the migration lands", async () => {
		const error = { code: "42703", message: "column workspace_settings.io_logging_contents_access does not exist" };
		await expect(readIoLogContentsAccess(settingsClient({ data: null, error }), "ws")).resolves.toBe("members");
	});

	it("returns null on other errors so callers fail closed", async () => {
		const error = { code: "57014", message: "canceling statement due to statement timeout" };
		await expect(readIoLogContentsAccess(settingsClient({ data: null, error }), "ws")).resolves.toBeNull();
	});
});

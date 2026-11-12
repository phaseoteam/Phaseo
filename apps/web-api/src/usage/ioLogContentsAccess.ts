// Who may read stored request and response payloads in a workspace.
export type IoLogContentsAccess = "members" | "admins";

export function normalizeIoLogContentsAccess(value: unknown): IoLogContentsAccess {
	return value === "admins" ? "admins" : "members";
}

export function canReadIoLogContents(access: IoLogContentsAccess | null, role: string): boolean {
	if (access === "members") return true;
	return access === "admins" && ["owner", "admin"].includes(role.trim().toLowerCase());
}

type SettingsClient = {
	from: (table: "workspace_settings") => any;
};

// Returns null when the setting can't be read, so callers can fail closed.
// A missing column (before the migration is applied) reads as the default.
export async function readIoLogContentsAccess(
	client: SettingsClient,
	workspaceId: string,
): Promise<IoLogContentsAccess | null> {
	const { data, error } = await client
		.from("workspace_settings")
		.select("io_logging_contents_access")
		.eq("workspace_id", workspaceId)
		.maybeSingle();
	if (error) {
		const missingColumn = String(error.code ?? "") === "42703"
			|| String(error.message ?? "").includes("io_logging_contents_access");
		return missingColumn ? "members" : null;
	}
	return normalizeIoLogContentsAccess(data?.io_logging_contents_access);
}

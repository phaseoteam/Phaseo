/** A Claude Code or Codex conversation found on this computer, offered for import as a chat that continues it. */
export type NativeSession = {
	harness: "claude" | "codex"; sessionId: string; title: string; updatedAt: string; cwd?: string;
	/** The Phaseo account whose folder it was in; absent for the default login. */ accountId?: string;
	/** A chat already has this session, imported or run from Phaseo. */ imported: boolean;
};
export type NativeSessionImport = { harness: "claude" | "codex"; sessionId: string };

export function validateNativeSessionImport(value: unknown): NativeSessionImport[] {
	if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("Choose up to 100 conversations to import.");
	return value.map(item => {
		const entry = item as Record<string, unknown> | null;
		if (!entry || (entry.harness !== "claude" && entry.harness !== "codex") || typeof entry.sessionId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(entry.sessionId)) throw new Error("Invalid conversation.");
		return { harness: entry.harness, sessionId: entry.sessionId };
	});
}

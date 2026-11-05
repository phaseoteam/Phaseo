export type Flags = Record<string, string | boolean>;

export function flagString(flags: Flags, key: string): string | undefined {
	const value = flags[key];
	return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: Flags, key: string): boolean {
	return flags[key] === true || flags[key] === "true" || flags[key] === "1";
}

export function flagNumber(flags: Flags, key: string): number | undefined {
	const value = flagString(flags, key);
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
	return parsed;
}

const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns `--workspace <id-or-slug>` into a workspace id, or undefined when the flag is absent. An id is used
 * as given. A slug is looked up among the signed-in person's workspaces (`loadWorkspaces`, from /me), so the
 * API only ever receives ids.
 */
export async function resolveWorkspaceFlag(
	flags: Flags,
	loadWorkspaces: () => Promise<Array<{ id?: unknown; slug?: unknown }>>,
): Promise<string | undefined> {
	if (flags.workspace === true) throw new Error("--workspace needs a workspace id or slug");
	const wanted = flagString(flags, "workspace")?.trim();
	if (!wanted) return undefined;
	if (WORKSPACE_ID_PATTERN.test(wanted)) return wanted;
	const match = (await loadWorkspaces()).find((workspace) => workspace?.slug === wanted);
	if (!match?.id) throw new Error(`None of your workspaces has the slug ${wanted}. Run phaseo whoami to list them.`);
	return String(match.id);
}

export function appendQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
	const [base, existingQuery] = path.split("?", 2);
	const query = new URLSearchParams(existingQuery ?? "");
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === "") continue;
		query.set(key, String(value));
	}
	const text = query.toString();
	return text ? `${base}?${text}` : base;
}

export function parseJsonFlag(flags: Flags, key: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
	const raw = flagString(flags, key);
	if (!raw) return fallback;
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`--${key} must be a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

export function compact(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function parseCsvFlag(flags: Flags, key: string): string[] {
	return (flagString(flags, key) ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

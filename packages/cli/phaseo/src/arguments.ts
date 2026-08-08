export type ParsedArgs = {
	command: string[];
	flags: Record<string, string | boolean>;
};

export function parseArgs(argv: string[]): ParsedArgs {
	const command: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "-h") {
			flags.help = true;
			continue;
		}
		if (arg === "-v") {
			flags.version = true;
			continue;
		}
		if (arg.startsWith("--")) {
			const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
			if (inlineValue !== undefined) {
				flags[rawKey] = inlineValue;
				continue;
			}
			const next = argv[i + 1];
			if (next && !next.startsWith("-")) {
				flags[rawKey] = next;
				i += 1;
			} else {
				flags[rawKey] = true;
			}
			continue;
		}
		command.push(arg);
	}
	return { command, flags };
}

export function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
	const value = flags[key];
	return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
	return flags[key] === true || flags[key] === "true" || flags[key] === "1";
}

export function flagNumber(flags: Record<string, string | boolean>, key: string): number | undefined {
	const value = flagString(flags, key);
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
	return parsed;
}


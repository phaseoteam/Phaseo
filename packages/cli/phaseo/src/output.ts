export type OutputOptions = {
	json: boolean;
};

export function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printError(error: unknown, options: OutputOptions): void {
	const message = error instanceof Error ? error.message : String(error);
	if (options.json) {
		printJson({ ok: false, error: message });
		return;
	}
	process.stderr.write(`Error: ${message}\n`);
}

export type OutputOptions = {
	json: boolean;
};

export function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function sanitizeTerminalText(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}

export function printError(error: unknown, options: OutputOptions): void {
	const message = error instanceof Error ? error.message : String(error);
	if (options.json) {
		printJson({ ok: false, error: message });
		return;
	}
	process.stderr.write(`Error: ${sanitizeTerminalText(message)}\n`);
}

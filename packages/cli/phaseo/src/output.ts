export type OutputOptions = {
	json: boolean;
};

export type TerminalOptions = {
	isTTY?: boolean;
	env?: NodeJS.ProcessEnv;
};

export type SpinnerOptions = TerminalOptions & {
	enabled?: boolean;
	frames?: string[];
	intervalMs?: number;
	stream?: Pick<NodeJS.WriteStream, "write">;
};

const ANSI = {
	reset: "\u001b[0m",
	bold: "\u001b[1m",
	dim: "\u001b[2m",
	purple: "\u001b[38;5;141m",
	cyan: "\u001b[38;5;81m",
	green: "\u001b[38;5;78m",
	yellow: "\u001b[38;5;221m",
};

export function terminalSupportsColor(options: TerminalOptions = {}): boolean {
	const env = options.env ?? process.env;
	if (env.FORCE_COLOR === "0") return false;
	if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
	if ("NO_COLOR" in env || env.TERM === "dumb") return false;
	return options.isTTY ?? Boolean(process.stdout.isTTY);
}

export function terminalUi(options: TerminalOptions = {}) {
	const color = terminalSupportsColor(options);
	const paint = (code: string, value: string) => color ? `${code}${value}${ANSI.reset}` : value;
	return {
		color,
		brand: (value: string) => paint(`${ANSI.bold}${ANSI.purple}`, value),
		heading: (value: string) => paint(ANSI.bold, value),
		dim: (value: string) => paint(ANSI.dim, value),
		accent: (value: string) => paint(ANSI.cyan, value),
		success: (value: string) => `${paint(ANSI.green, "✓")} ${value}`,
		progress: (value: string) => `${paint(ANSI.purple, "◆")} ${value}`,
		info: (value: string) => `${paint(ANSI.cyan, "◇")} ${value}`,
		warning: (value: string) => `${paint(ANSI.yellow, "!")} ${value}`,
	};
}

export function createSpinner(label: string, options: SpinnerOptions = {}) {
	const stream = options.stream ?? process.stderr;
	const env = options.env ?? process.env;
	const enabled = (options.enabled ?? Boolean(process.stderr.isTTY)) && env.TERM !== "dumb";
	const frames = options.frames?.length ? options.frames : ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	const ui = terminalUi({ ...options, isTTY: enabled });
	let index = 0;
	let timer: NodeJS.Timeout | undefined;
	let stopped = false;
	const clear = () => { if (enabled) stream.write("\r\u001b[2K"); };
	const render = () => {
		if (!enabled || stopped) return;
		stream.write(`\r${ui.accent(frames[index % frames.length] ?? "-")} ${label}`);
		index += 1;
	};
	if (enabled) {
		render();
		timer = setInterval(render, options.intervalMs ?? 80);
		timer.unref?.();
	}
	const stop = () => {
		if (stopped) return;
		stopped = true;
		if (timer) clearInterval(timer);
		clear();
	};
	return {
		active: enabled,
		stop,
		succeed(message = label) { stop(); if (enabled) stream.write(`${ui.success(message)}\n`); },
		fail(message = label) { stop(); if (enabled) stream.write(`${ui.warning(message)}\n`); },
	};
}

export function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function sanitizeTerminalText(value: string): string {
	return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ");
}

export function printError(error: unknown, options: OutputOptions): void {
	const message = error instanceof Error ? error.message : String(error);
	if (options.json) {
		printJson({ ok: false, error: message });
		return;
	}
	process.stderr.write(`Error: ${sanitizeTerminalText(message)}\n`);
}

export type HyperlinkOptions = TerminalOptions;

/**
 * Whether stdout's terminal renders OSC 8 hyperlinks. Unknown terminals get plain text, because a few
 * old ones print the escape sequence. NO_HYPERLINKS turns links off; FORCE_HYPERLINK=1 turns them on.
 */
export function terminalSupportsHyperlinks(options: HyperlinkOptions = {}): boolean {
	const env = options.env ?? process.env;
	if ("NO_HYPERLINKS" in env || env.FORCE_HYPERLINK === "0") return false;
	if (env.FORCE_HYPERLINK) return true;
	if (!(options.isTTY ?? Boolean(process.stdout.isTTY)) || env.TERM === "dumb") return false;
	if (env.CI) return false;
	if (env.WT_SESSION || env.KITTY_WINDOW_ID || env.WEZTERM_PANE || env.KONSOLE_VERSION || env.GHOSTTY_RESOURCES_DIR) return true;
	if (["vscode", "iTerm.app", "WezTerm", "ghostty", "Hyper", "Tabby", "rio"].includes(env.TERM_PROGRAM ?? "")) return true;
	if (Number(env.VTE_VERSION ?? 0) >= 5000) return true;
	return /kitty|alacritty|ghostty|wezterm|foot/.test(env.TERM ?? "");
}

/** Wraps visible text in an OSC 8 hyperlink. Only https URLs are linked. */
export function hyperlink(text: string, url: string | undefined | null): string {
	if (!url) return text;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return text;
	}
	if (parsed.protocol !== "https:") return text;
	return `\u001b]8;;${parsed.toString()}\u001b\\${text}\u001b]8;;\u001b\\`;
}

export type TableColumn<T> = {
	/** Header text. */
	header: string;
	/** Cell text for one row. Server strings are sanitised before printing. */
	value: (row: T) => unknown;
	/** Right-align (numbers, money, durations). */
	align?: "left" | "right";
	/** Column that gives up width first when the table is wider than the terminal. */
	shrink?: boolean;
	/** Web page for the cell, shown as a clickable link in terminals that support it. */
	link?: (row: T) => string | undefined | null;
};

export type TableOptions = {
	/** Bold headers. Defaults to whether stdout supports colour. */
	color?: boolean;
	/** Maximum line width. Defaults to the terminal width when stdout is a TTY; no limit when piped. */
	maxWidth?: number;
	/** Clickable cells. Defaults to whether the terminal supports hyperlinks. */
	links?: boolean;
};

const TABLE_GAP = "  ";
const MIN_SHRUNK_WIDTH = 8;

function cellText(value: unknown): string {
	if (value === null || value === undefined || value === "") return "-";
	return sanitizeTerminalText(String(value)).replace(/\s+/g, " ").trim() || "-";
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
// East Asian wide/fullwidth ranges and emoji take two terminal columns.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3fffd}]|\p{Extended_Pictographic}/u;

// Flags (regional-indicator pairs), keycaps and emoji-presentation sequences also take two columns.
const EMOJI_SEQUENCE = /[\u{1f1e6}-\u{1f1ff}]|️|⃣/u;

function graphemeWidth(grapheme: string): number {
	return WIDE.test(grapheme) || EMOJI_SEQUENCE.test(grapheme) ? 2 : 1;
}

/** Terminal columns a string takes: wide characters count 2, combining marks 0. */
export function displayWidth(value: string): number {
	let width = 0;
	for (const { segment } of graphemes.segment(value)) width += graphemeWidth(segment);
	return width;
}

function truncateCell(value: string, width: number): string {
	if (displayWidth(value) <= width) return value;
	// Cut on whole characters, leaving one column for the ellipsis.
	let out = "";
	let used = 0;
	const room = width <= 1 ? width : width - 1;
	for (const { segment } of graphemes.segment(value)) {
		const next = graphemeWidth(segment);
		if (used + next > room) break;
		out += segment;
		used += next;
	}
	return width <= 1 ? out : `${out}…`;
}

/** Renders rows as an aligned table with a header row. Returns "No results.\n" when empty. */
export function renderTable<T>(rows: T[], columns: TableColumn<T>[], options: TableOptions = {}): string {
	if (!rows.length) return "No results.\n";
	const cells = rows.map((row) => columns.map((column) => cellText(column.value(row))));
	const widths = columns.map((column, index) => Math.max(column.header.length, ...cells.map((row) => displayWidth(row[index]))));
	const maxWidth = options.maxWidth ?? (process.stdout.isTTY ? process.stdout.columns : undefined);
	if (maxWidth && maxWidth > 0) {
		const total = () => widths.reduce((sum, width) => sum + width, 0) + TABLE_GAP.length * (columns.length - 1);
		// Shrink the widest shrinkable column first until the table fits.
		while (total() > maxWidth) {
			let target = -1;
			columns.forEach((column, index) => {
				if (column.shrink && widths[index] > Math.max(MIN_SHRUNK_WIDTH, column.header.length) && (target < 0 || widths[index] > widths[target])) target = index;
			});
			if (target < 0) break;
			widths[target] -= Math.min(total() - maxWidth, widths[target] - Math.max(MIN_SHRUNK_WIDTH, columns[target].header.length));
		}
	}
	const ui = terminalUi({ isTTY: options.color ?? terminalSupportsColor() });
	const links = options.links ?? terminalSupportsHyperlinks();
	const line = (values: string[], row?: T) => values
		.map((value, index) => {
			const fitted = truncateCell(value, widths[index]);
			const padding = " ".repeat(Math.max(0, widths[index] - displayWidth(fitted)));
			if (!row) return ui.heading(columns[index].align === "right" ? padding + fitted : fitted + padding);
			// The link wraps only the visible text, so padding and alignment are unchanged.
			const url = links && fitted !== "-" ? columns[index].link?.(row) : undefined;
			const text = url ? hyperlink(fitted, url) : fitted;
			return columns[index].align === "right" ? padding + text : text + padding;
		})
		.join(TABLE_GAP)
		.trimEnd();
	return [line(columns.map((column) => column.header)), ...cells.map((values, index) => line(values, rows[index]))].join("\n") + "\n";
}

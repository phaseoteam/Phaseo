/** A rendered table's cells as text, header row first, for Copy as Markdown and Copy as CSV. */
export function tableRows(table: HTMLTableElement): string[][] {
	return Array.from(table.rows, row => Array.from(row.cells, cell => (cell.textContent ?? "").replace(/\s+/g, " ").trim()));
}

/** A GitHub-flavoured table: pipes in cells are escaped and short rows are padded to the header's width. */
export function tableMarkdown(rows: readonly (readonly string[])[]): string {
	if (!rows.length) return "";
	const width = Math.max(...rows.map(row => row.length));
	const line = (row: readonly string[]) => `| ${Array.from({ length: width }, (_, index) => (row[index] ?? "").replaceAll("|", "\\|")).join(" | ")} |`;
	return [line(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

/** RFC 4180: a cell with a comma, quote or line break is quoted, with its quotes doubled. */
export function tableCsv(rows: readonly (readonly string[])[]): string {
	return rows.map(row => row.map(cell => /[",\r\n]/.test(cell) ? `"${cell.replaceAll("\"", "\"\"")}"` : cell).join(",")).join("\r\n");
}

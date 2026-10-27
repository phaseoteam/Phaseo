/**
 * A configured base URL without its trailing slashes. A loop rather than a
 * regular expression, which can take polynomial time on a long run of slashes.
 */
export function withoutTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value[end - 1] === "/") end -= 1;
	return value.slice(0, end);
}

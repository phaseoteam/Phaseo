/** A value as JavaScript source for executeJavaScript, as scripts/javascript-literal.mjs does for the smokes: JSON with <, > and the line separators escaped. */
export function javascriptLiteral(value: unknown): string {
	return (JSON.stringify(value) ?? "undefined").replace(/[<>\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

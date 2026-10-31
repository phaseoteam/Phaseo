/** Removes every match, again until none is left: one pass over "<!<!---->--" would leave a fresh "<!--". */
export function removeAll(text: string, pattern: RegExp): string {
	for (let previous = ""; previous !== text;) { previous = text; text = text.replace(pattern, ""); }
	return text;
}

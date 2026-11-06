/** phaseo://chat/<id> opens that chat in the desktop app from a browser, another app or a message. */
export const chatLinkScheme = "phaseo";
const prefix = `${chatLinkScheme}://chat/`;

export const chatLink = (id: string) => prefix + encodeURIComponent(id);

export function parseChatLink(value: string): string | undefined {
	if (value.slice(0, prefix.length).toLowerCase() !== prefix) return undefined;
	// Some launchers append a slash or a query; the id is the first path segment.
	const segment = value.slice(prefix.length).split(/[/?#]/, 1)[0];
	try { const id = decodeURIComponent(segment); return id && id.length <= 200 ? id : undefined; } catch { return undefined; }
}

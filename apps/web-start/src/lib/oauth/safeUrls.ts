export function isSafeOAuthRedirectUrl(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.username || url.password || url.hash) return false;
		if (url.protocol === "https:") return true;
		const loopback = url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]" || url.hostname === "localhost";
		return url.protocol === "http:" && loopback;
	} catch {
		return false;
	}
}

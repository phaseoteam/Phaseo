/** Short chat titles written by a model through the person's Phaseo account, as T3 Code names its threads. */

/** First line only, without quotes, Markdown or a closing full stop; up to 80 characters. */
export function cleanTitle(raw: string) {
	const line = raw.split("\n").map(value => value.trim()).find(Boolean) ?? "";
	const title = line.replace(/^(title:\s*)/i, "").replace(/^[#*_`"'“‘\s]+|[*_`"'”’\s]+$/g, "").replace(/[.。]+$/, "").replace(/\s+/g, " ").trim();
	return title ? title.slice(0, 80) : undefined;
}

/** One non-streamed `/chat/completions` call through the person's Phaseo account; the reply's text, if any. */
export async function completeChat({ endpoint, token, model, system, user, maxTokens, timeoutMs, fetcher = fetch, signal, label = "The title model" }: { endpoint: string; token: string; model: string; system: string; user: string; maxTokens: number; timeoutMs: number; fetcher?: typeof fetch; signal?: AbortSignal; label?: string }) {
	const timeout = AbortSignal.timeout(timeoutMs);
	const response = await fetcher(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
		body: JSON.stringify({ model, stream: false, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	});
	if (!response.ok) throw new Error(`${label} returned ${response.status}.`);
	const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
	const content = body.choices?.[0]?.message?.content;
	return typeof content === "string" ? content : undefined;
}

export async function generateTitle({ endpoint, token, model, text, reply, fetcher = fetch, signal }: { endpoint: string; token: string; model: string; text: string; reply?: string; fetcher?: typeof fetch; signal?: AbortSignal }) {
	const content = await completeChat({
		endpoint, token, model, fetcher, signal, maxTokens: 24, timeoutMs: 20_000,
		system: "Write a short title, two to six words, for the chat below. Reply with the title only: no quotes, no full stop.",
		user: `${text.slice(0, 4000)}${reply ? `\n\nReply so far:\n${reply.slice(0, 2000)}` : ""}`,
	});
	return content === undefined ? undefined : cleanTitle(content);
}

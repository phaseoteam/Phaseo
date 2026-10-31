import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { useTranslations } from "@/i18n/react";
import { ClientMessagesProvider, FeatureMessagesProvider } from "@/components/i18n/LocaleMessagesProvider";
import { allClientMessageScopes, clientMessagesFile, clientMessagesScopeId, selectScopeMessages } from "./client-message-files";
import { clientMessagesFallbackUrl, clientMessagesUrl, fetchClientMessages } from "./client-message-source";
import { resolveClientMessages } from "./client-messages";
import { getPublicMessages } from "./messages";
import { publicLocales } from "./routing";

// The model page boundary: the largest public route scope.
const MODEL_SCOPE = allClientMessageScopes().find((scope) => scope !== "shell" && scope.includes("Catalogue.catalogNotFound")) as readonly string[];

describe("client dictionaries", () => {
	it.each(publicLocales)("resolves the shell and every route scope in %s", async (locale) => {
		const messages = await getPublicMessages(locale) as Record<string, unknown>;
		for (const scope of allClientMessageScopes()) {
			expect(() => selectScopeMessages(messages, scope)).not.toThrow();
		}
	});

	it("gives every scope its own id", () => {
		const ids = allClientMessageScopes().map(clientMessagesScopeId);
		expect(ids[0]).toBe("shell");
		expect(new Set(ids).size).toBe(ids.length);
		expect(clientMessagesScopeId([...MODEL_SCOPE].reverse())).toBe(clientMessagesScopeId(MODEL_SCOPE));
	});

	it("names each file by its content", async () => {
		const messages = await getPublicMessages("de-DE") as Record<string, unknown>;
		const shell = clientMessagesFile("de-DE", selectScopeMessages(messages, "shell"));
		expect(clientMessagesFile("de-DE", selectScopeMessages(messages, "shell"))).toEqual(shell);
		expect(shell.key).toMatch(/^de-DE\/[0-9a-f]{16}$/);
		expect(clientMessagesFile("de-DE", { ...JSON.parse(shell.json), extra: "copy" }).key).not.toBe(shell.key);
	});

	it("hands providers a reference whose file and fallback URLs name the scope", async () => {
		const source = await resolveClientMessages("zh-Hans", MODEL_SCOPE);
		expect(source.scope).toBe(clientMessagesScopeId(MODEL_SCOPE));
		expect(clientMessagesUrl(source)).toBe(`/_i18n/${source.key}.json`);
		expect(clientMessagesFallbackUrl(source)).toBe(`/api/i18n/scope/zh-Hans/${source.scope}`);
		expect(JSON.stringify(source).length).toBeLessThan(80);
	});

	it("renders the copy prepared on the server while the props carry only references", async () => {
		const messages = await getPublicMessages("fr-FR");
		const [catalogueKey, catalogueText] = Object.entries(messages.Catalogue.catalogNotFound)
			.find(([, value]) => typeof value === "string") as [string, string];
		function Labels() {
			const nav = useTranslations("Common.nav");
			const catalogue = useTranslations("Catalogue.catalogNotFound");
			return <p>{nav("models")} · {catalogue(catalogueKey as never)}</p>;
		}
		const shell = await resolveClientMessages("fr-FR", "shell");
		const model = await resolveClientMessages("fr-FR", MODEL_SCOPE);
		const html = renderToStaticMarkup(
			<ClientMessagesProvider locale="fr-FR" source={shell} timeZone="UTC">
				<FeatureMessagesProvider source={model}>
					<Labels />
				</FeatureMessagesProvider>
			</ClientMessagesProvider>,
		);
		expect(html).toContain(messages.Common.nav.models);
		expect(html).toContain(catalogueText.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
	});
});

describe("loading dictionaries in the browser", () => {
	const source = { key: "fr-FR/0123456789abcdef", scope: "shell" };
	const realFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	// Answers requests in order; once the replies run out, the server is down.
	function respond(...replies: Array<Response | Error>) {
		const fetchMock = jest.fn(async (_url: string) => {
			const reply = replies.shift() ?? new Response("down", { status: 503 });
			if (reply instanceof Error) throw reply;
			return reply;
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		return fetchMock;
	}

	it("retries a failed load before giving up", async () => {
		const fetchMock = respond(new TypeError("Failed to fetch"), new Response("down", { status: 503 }), Response.json({ Common: { ok: "oui" } }));
		const waits: number[] = [];
		await expect(fetchClientMessages(source, async (delayMs) => { waits.push(delayMs); })).resolves.toEqual({ Common: { ok: "oui" } });
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([clientMessagesUrl(source), clientMessagesFallbackUrl(source), clientMessagesUrl(source)]);
		expect(waits).toEqual([250]);
	});

	// The browser reports itself offline; returns a function that restores the globals.
	function goOffline() {
		const scope = globalThis as { window?: EventTarget; navigator?: unknown };
		const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
		scope.window = new EventTarget();
		Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
		return () => {
			delete scope.window;
			if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
			else delete scope.navigator;
		};
	}

	it("retries as soon as an offline browser reconnects", async () => {
		jest.useFakeTimers();
		const restore = goOffline();
		try {
			const fetchMock = respond(new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), Response.json({ Common: { ok: "oui" } }));
			const loading = fetchClientMessages(source);
			await jest.advanceTimersByTimeAsync(5_000);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			(globalThis as { window?: EventTarget }).window?.dispatchEvent(new Event("online"));
			await expect(loading).resolves.toEqual({ Common: { ok: "oui" } });
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			restore();
			jest.useRealTimers();
		}
	});

	it("stops waiting for a reconnect that never comes after 30 seconds", async () => {
		jest.useFakeTimers();
		const restore = goOffline();
		try {
			const fetchMock = respond(new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), Response.json({ Common: { ok: "oui" } }));
			const loading = fetchClientMessages(source);
			await jest.advanceTimersByTimeAsync(29_999);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			await jest.advanceTimersByTimeAsync(1);
			await expect(loading).resolves.toEqual({ Common: { ok: "oui" } });
			expect(fetchMock).toHaveBeenCalledTimes(3);
		} finally {
			restore();
			jest.useRealTimers();
		}
	});

	it("gives up at once when this deployment no longer knows the scope", async () => {
		const fetchMock = respond(new Response("gone", { status: 404 }), new Response("unknown scope", { status: 404 }));
		await expect(fetchClientMessages(source, async () => {})).rejects.toThrow("could not be loaded");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("hands a dictionary that keeps failing to the error boundary instead of fetching it again", async () => {
		const fetchMock = respond();
		const scope = globalThis as { window?: unknown };
		scope.window = globalThis;
		try {
			const errors: unknown[] = [];
			await prerender(
				<ClientMessagesProvider locale="fr-FR" source={{ key: "fr-FR/fedcba9876543210", scope: "shell" }} timeZone="UTC">
					<p>copy</p>
				</ClientMessagesProvider>,
				{ onError: (error) => { errors.push(error); } },
			).catch((error: unknown) => errors.push(error));
			expect(String(errors[0])).toContain("could not be loaded");
			// Three attempts, each trying the published file and then the current copy.
			expect(fetchMock).toHaveBeenCalledTimes(6);
		} finally {
			delete scope.window;
		}
	});
});

/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import { englishCatalogueMessages, englishCommonMessages } from "@/i18n/default-messages";

const fetchPublicWebApi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/web-api/client", async (importOriginal) => ({
	...await importOriginal<typeof import("@/lib/web-api/client")>(),
	fetchPublicWebApi,
}));
// The app's Link needs a router; a plain anchor is enough here.
vi.mock("@/components/link", () => ({
	default: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean; onClick?: (event: ReactMouseEvent) => void }) => (
		<a href={href} data-prefetch={String(prefetch)} {...props}>{children}</a>
	),
	formatHref: (href: string) => href,
}));

import { WebApiError } from "@/lib/web-api/client";
import { CLOSE_DELAY_MS, EntityCardsController, OPEN_DELAY_MS, SWITCH_DELAY_MS } from "./EntityCards";
import { clearEntityCardCache, type ModelEntityCard, type OrganisationEntityCard } from "./entityCardData";

const MODEL: ModelEntityCard = {
	kind: "model",
	id: "acme/rocket-2",
	name: "Rocket 2",
	organisation: { id: "acme", name: "Acme" },
	releaseDate: "2026-11-09",
	status: "active",
	inputPrice: 8,
	outputPrice: 12.5,
	inputPriceUnit: null,
	outputPriceUnit: null,
	context: 1_000_000,
	providers: { active: 1, total: 2 },
	cheapestProvider: { id: "fastinfer", name: "FastInfer" },
	inputModalities: ["text", "image"],
	outputModalities: ["text"],
	uptimePct: 99.99,
	intelligence: null,
	features: ["reasoning", "tools"],
	tiers: ["batch", "priority"],
};

const ORGANISATION: OrganisationEntityCard = {
	kind: "organisation",
	id: "acme",
	name: "Acme",
	countryCode: "GB",
	since: "2023",
	models: 94,
	live: 41,
	openWeights: 12,
	providers: 6,
	latest: { id: "acme/rocket-2", name: "Rocket 2", date: "2026-11-10" },
	mostUsed: { id: "acme/rocket-1", name: "Rocket 1" },
	servedBy: { items: [{ id: "fastinfer", name: "FastInfer" }], more: 4 },
};

let root: Root;
let container: HTMLDivElement;
let resolvers: Map<string, (value: unknown) => void>;

beforeEach(async () => {
	vi.useFakeTimers();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	clearEntityCardCache();
	resolvers = new Map();
	fetchPublicWebApi.mockReset();
	fetchPublicWebApi.mockImplementation((path: string) => new Promise((resolve) => resolvers.set(path, resolve)));
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	// Load the lazily imported card UI up front, as the first hover would.
	await import("./EntityCardPopup");
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

function render(pathname = "/rankings") {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: englishCatalogueMessages, Common: englishCommonMessages }}>
			<main>
				<a id="model" href="/models/acme/rocket-2">Rocket 2</a>
				<a id="org" href="/organisations/acme">Acme</a>
				<a id="tab" href="/organisations/acme/models">Models tab</a>
				<nav><a id="nav" href="/models/acme/rocket-2">Rocket 2</a></nav>
			</main>
			<EntityCardsController pathname={pathname} />
		</AppIntlProvider>,
	));
}

function pointer(type: string, target: Element, options: { relatedTarget?: Element | null; pointerType?: string } = {}) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget: options.relatedTarget ?? null });
	Object.defineProperty(event, "pointerType", { value: options.pointerType ?? "mouse" });
	act(() => {
		target.dispatchEvent(event);
	});
}

const link = (id: string) => container.querySelector<HTMLAnchorElement>(`#${id}`)!;
const card = () => document.body.querySelector<HTMLElement>("[data-slot=entity-card]");
const advance = async (ms: number) => act(async () => {
	await vi.advanceTimersByTimeAsync(ms);
});
const respond = async (path: string, body: unknown) => act(async () => {
	resolvers.get(path)?.(body);
	await vi.advanceTimersByTimeAsync(0);
});

describe("EntityCards", () => {
	it("requests the card on hover intent, opens after 450 ms with a loading state, then shows the card", async () => {
		render();
		pointer("pointerover", link("model"));
		expect(fetchPublicWebApi).toHaveBeenCalledWith("/api/_web/entity-cards/model/acme/rocket-2");
		await advance(OPEN_DELAY_MS - 10);
		expect(card()).toBeNull();
		await advance(10);
		expect(card()?.querySelector("[data-slot=entity-card-loading]")?.textContent).toContain("Loading");

		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		const opened = card()!;
		expect(opened.textContent).toContain("Rocket 2");
		expect(opened.textContent).toContain("Acme · Released 9 Nov 2026 · Active");
		const stats = Array.from(opened.querySelectorAll("[data-slot=hover-card-stats] dd")).map((dd) => dd.textContent);
		expect(stats).toEqual(["$8", "$12.50", "1M", "1/2"]);
		expect(opened.textContent).toContain("99.9% over 3 days");
		expect(opened.textContent).toContain("Text, Image → Text");
		expect(opened.textContent).toContain("Not yet scored");
		expect(opened.textContent).toContain("Priority tier");
		// No all-caps labels, and no link in the card preloads its page.
		expect(opened.innerHTML).not.toContain("uppercase");
		for (const anchor of Array.from(opened.querySelectorAll("a"))) expect(anchor.dataset.prefetch).toBe("false");
	});

	it("switches to another link after 120 ms while a card is open", async () => {
		render();
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		expect(card()?.textContent).toContain("Rocket 2");

		pointer("pointerout", link("model"), { relatedTarget: link("org") });
		pointer("pointerover", link("org"), { relatedTarget: link("model") });
		await respond("/api/_web/entity-cards/organisation/acme", { card: ORGANISATION });
		await advance(SWITCH_DELAY_MS - 10);
		expect(card()?.textContent).not.toContain("Model creator since");
		await advance(10);
		expect(card()?.textContent).toContain("Model creator since 2023");
		expect(card()?.textContent).toContain("FastInfer +4 more");
	});

	it("closes 200 ms after the pointer leaves, unless it moves onto the card", async () => {
		render();
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });

		// Moving from the link onto the card keeps it open.
		pointer("pointerout", link("model"), { relatedTarget: card() });
		await advance(CLOSE_DELAY_MS - 50);
		pointer("pointerover", card()!, { relatedTarget: link("model") });
		await advance(CLOSE_DELAY_MS * 2);
		expect(card()?.hasAttribute("data-open")).toBe(true);

		// Leaving the card closes it after the delay.
		pointer("pointerout", card()!, { relatedTarget: document.body });
		await advance(CLOSE_DELAY_MS - 10);
		expect(card()?.hasAttribute("data-open")).toBe(true);
		await advance(10);
		expect(card()?.hasAttribute("data-open") ?? false).toBe(false);
	});

	it("closes at once on pointerdown and on navigation", async () => {
		render();
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		expect(card()?.hasAttribute("data-open")).toBe(true);
		pointer("pointerdown", document.body);
		await advance(0);
		expect(card()?.hasAttribute("data-open") ?? false).toBe(false);

		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		expect(card()?.hasAttribute("data-open")).toBe(true);
		render("/apps");
		await advance(0);
		expect(card()?.hasAttribute("data-open") ?? false).toBe(false);
	});

	it("keeps the card open on a pointerdown inside it, so an in-card link gets its click", async () => {
		render();
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		const inCardLink = card()!.querySelector<HTMLAnchorElement>("a[href='/organisations/acme']")!;
		expect(inCardLink).not.toBeNull();
		const clicked = vi.fn((event: Event) => event.preventDefault());
		inCardLink.addEventListener("click", clicked);

		pointer("pointerdown", inCardLink);
		await advance(0);
		expect(card()?.hasAttribute("data-open")).toBe(true);
		expect(card()?.contains(inCardLink)).toBe(true);
		pointer("click", inCardLink);
		expect(clicked).toHaveBeenCalledTimes(1);

		// The navigation the click starts closes the card.
		render("/organisations/acme");
		await advance(0);
		expect(card()?.hasAttribute("data-open") ?? false).toBe(false);
	});

	it("ignores touch, navigation links, sub-page tabs and the page's own entity", async () => {
		render("/models/acme/rocket-2");
		pointer("pointerover", link("org"), { pointerType: "touch" });
		pointer("pointerover", link("nav"));
		pointer("pointerover", link("tab"));
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS * 2);
		expect(fetchPublicWebApi).not.toHaveBeenCalled();
		expect(card()).toBeNull();
	});

	it("shows no card for an entity the endpoint does not know", async () => {
		fetchPublicWebApi.mockImplementation(async (path: string) => {
			throw new WebApiError(path, 404);
		});
		render();
		pointer("pointerover", link("org"));
		await advance(OPEN_DELAY_MS);
		await advance(0);
		expect(card()?.hasAttribute("data-open") ?? false).toBe(false);
		// The miss is cached: hovering again does not ask twice.
		pointer("pointerout", link("org"), { relatedTarget: document.body });
		pointer("pointerover", link("org"));
		expect(fetchPublicWebApi).toHaveBeenCalledTimes(1);
	});
});

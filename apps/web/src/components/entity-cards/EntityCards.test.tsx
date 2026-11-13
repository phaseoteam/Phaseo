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
import { clearEntityCardCache, MISS_TTL_MS, type ModelEntityCard, type OrganisationEntityCard } from "./entityCardData";

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
				{/* A listing box that is itself the model: its own links opt out, its organisation link does not. */}
				<div id="box">
					<a id="box-title" href="/models/acme/rocket-3" data-no-entity-card>Rocket 3</a>
					<a id="box-org" href="/organisations/acme">Acme</a>
				</div>
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
/**
 * Gives a link a box on screen; jsdom lays nothing out, so every box is 0,0 otherwise.
 * Once removed from the page it measures as an empty box at 0,0, as in a browser.
 */
function placeAt(element: Element, left: number, top: number) {
	vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => element.isConnected
		? DOMRect.fromRect({ x: left, y: top, width: 80, height: 20 })
		: DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 }));
}
/** Where the positioner put the card, from its inline style. */
function positionOf(popup: Element) {
	const style = (popup.parentElement as HTMLElement).style;
	return { left: style.left, top: style.top, transform: style.transform };
}
/** Where the card sits against a link placed at 200,300 (flipped above it in jsdom's empty layout); never 0,0. */
const PLACED = { left: "0px", top: "0px", transform: "translate(200px, 294px)" };
/** Holds the card's exit animation running, as a browser would for its 100 ms, until `finish` is called. */
function holdExitAnimation(popup: HTMLElement) {
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => { finish = resolve; });
	Object.defineProperty(popup, "getAnimations", { configurable: true, value: () => [{ finished }] });
	return async () => act(async () => {
		finish();
		await vi.advanceTimersByTimeAsync(50);
	});
}
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
		expect(opened.textContent).not.toContain("Uptime");
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

	it("keeps the open card when the pointer moves onto a link inside it, and never opens that link's card", async () => {
		render();
		placeAt(link("model"), 200, 300);
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		const opened = card()!;
		const inCardLink = opened.querySelector<HTMLAnchorElement>("a[href='/organisations/acme']")!;
		expect(inCardLink).not.toBeNull();

		pointer("pointerout", link("model"), { relatedTarget: inCardLink });
		pointer("pointerover", inCardLink, { relatedTarget: link("model") });
		await advance(OPEN_DELAY_MS + CLOSE_DELAY_MS);
		expect(resolvers.has("/api/_web/entity-cards/organisation/acme")).toBe(false);
		expect(card()).toBe(opened);
		expect(inCardLink.isConnected).toBe(true);
		expect(card()?.hasAttribute("data-open")).toBe(true);
		expect(card()?.textContent).toContain("Rocket 2");
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

	it("never opens a card on a link that opts out, but does on other entity links in the same box", async () => {
		render();
		pointer("pointerover", link("box-title"));
		await advance(OPEN_DELAY_MS * 2);
		expect(fetchPublicWebApi).not.toHaveBeenCalled();
		expect(card()).toBeNull();
		// Keyboard focus on the opted-out link does not open one either.
		const nativeMatches = Element.prototype.matches;
		const visible = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
			if (selector === ":focus-visible") return this === document.activeElement;
			return nativeMatches.call(this, selector);
		});
		try {
			act(() => link("box-title").focus());
			await advance(OPEN_DELAY_MS * 2);
			expect(fetchPublicWebApi).not.toHaveBeenCalled();
		} finally {
			visible.mockRestore();
		}

		pointer("pointerout", link("box-title"), { relatedTarget: link("box-org") });
		pointer("pointerover", link("box-org"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/organisation/acme", { card: ORGANISATION });
		expect(card()?.textContent).toContain("Model creator since 2023");
	});

	it("keeps the card at its link while it closes, until the exit animation ends", async () => {
		render();
		placeAt(link("model"), 200, 300);
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		const opened = card()!;
		expect(positionOf(opened)).toEqual(PLACED);

		const finishExit = holdExitAnimation(opened);
		pointer("pointerout", link("model"), { relatedTarget: document.body });
		await advance(CLOSE_DELAY_MS);
		await act(async () => {
			window.dispatchEvent(new Event("resize"));
			await vi.advanceTimersByTimeAsync(50);
		});
		// Closing, still mounted, still at the link and still showing the model.
		expect(card()).toBe(opened);
		expect(opened.hasAttribute("data-open")).toBe(false);
		expect(positionOf(opened)).toEqual(PLACED);
		expect(opened.textContent).toContain("Rocket 2");
		expect(opened.querySelector("[data-slot=entity-card-loading]")).toBeNull();

		await finishExit();
		expect(card()).toBeNull();
	});

	it("closes the card when the page replaces its link, without moving it to the corner", async () => {
		render();
		placeAt(link("model"), 200, 300);
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
		const opened = card()!;
		expect(opened.hasAttribute("data-open")).toBe(true);

		const finishExit = holdExitAnimation(opened);
		// A re-render swaps the hovered link for a new element.
		act(() => link("model").replaceWith(link("model").cloneNode(true)));
		await advance(50);
		expect(opened.hasAttribute("data-open")).toBe(false);
		// The positioner measures again (as on scroll or resize) while the card fades out.
		await act(async () => {
			window.dispatchEvent(new Event("resize"));
			await vi.advanceTimersByTimeAsync(50);
		});
		expect(positionOf(opened)).toEqual(PLACED);
		await finishExit();
		expect(card()).toBeNull();
	});

	it("does not open a card for a link the page replaced during the open delay", async () => {
		render();
		pointer("pointerover", link("model"));
		await advance(OPEN_DELAY_MS - 100);
		act(() => link("model").replaceWith(link("model").cloneNode(true)));
		await advance(200);
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

		// ...but only as long as the API caches its 404, so a newly published entity gets its card.
		pointer("pointerout", link("org"), { relatedTarget: document.body });
		await advance(MISS_TTL_MS + 1);
		pointer("pointerover", link("org"));
		expect(fetchPublicWebApi).toHaveBeenCalledTimes(2);
	});

	it("opens on keyboard focus, stays open when focus moves into the card, closes on blur and on Escape", async () => {
		render();
		const nativeMatches = Element.prototype.matches;
		const visible = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
			if (selector === ":focus-visible") return this === document.activeElement;
			return nativeMatches.call(this, selector);
		});
		try {
			act(() => link("model").focus());
			expect(fetchPublicWebApi).toHaveBeenCalledWith("/api/_web/entity-cards/model/acme/rocket-2");
			await advance(OPEN_DELAY_MS);
			await respond("/api/_web/entity-cards/model/acme/rocket-2", { card: MODEL });
			expect(card()?.hasAttribute("data-open")).toBe(true);

			// Focus moving into the card keeps it open.
			const inCardLink = card()!.querySelector<HTMLAnchorElement>("a[href='/organisations/acme']")!;
			act(() => inCardLink.focus());
			await advance(CLOSE_DELAY_MS * 2);
			expect(card()?.hasAttribute("data-open")).toBe(true);

			// Leaving the card for the page closes it after the delay.
			act(() => link("tab").focus());
			await advance(CLOSE_DELAY_MS);
			expect(card()?.hasAttribute("data-open") ?? false).toBe(false);

			// Escape closes a focus-opened card at once.
			act(() => link("model").focus());
			await advance(OPEN_DELAY_MS);
			expect(card()?.hasAttribute("data-open")).toBe(true);
			act(() => {
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			});
			await advance(0);
			expect(card()?.hasAttribute("data-open") ?? false).toBe(false);

			// Mouse focus (not :focus-visible) does not open a card.
			visible.mockImplementation(function (this: Element, selector: string) {
				if (selector === ":focus-visible") return false;
				return nativeMatches.call(this, selector);
			});
			fetchPublicWebApi.mockClear();
			act(() => link("org").focus());
			await advance(OPEN_DELAY_MS * 2);
			expect(fetchPublicWebApi).not.toHaveBeenCalled();
		} finally {
			visible.mockRestore();
		}
	});

	it("leaves out ZDR when the provider does not state it, and translates known categories only", async () => {
		render();
		const host = container.querySelector("main")!;
		host.insertAdjacentHTML("beforeend", "<a id=\"provider\" href=\"/api-providers/fastinfer-eu\">FastInfer EU</a><a id=\"app\" href=\"/apps/rocketchat\">RocketChat</a><a id=\"bench\" href=\"/benchmarks/swe-bench\">SWE-bench</a>");
		pointer("pointerover", link("provider"));
		await advance(OPEN_DELAY_MS);
		await respond("/api/_web/entity-cards/provider/fastinfer-eu", { card: {
			kind: "provider", id: "fastinfer-eu", name: "FastInfer", countryCode: null, totalModels: 3, activeModels: 2,
			dataPolicyTier: null, zeroDataRetention: null, byok: false, regions: [], popular: { items: [], more: 0 }, newest: null,
		} });
		const labels = Array.from(card()!.querySelectorAll("[data-slot=hover-card-stats] dt")).map((dt) => dt.textContent);
		expect(labels).not.toContain("ZDR");
		expect(labels.length).toBe(2);

		pointer("pointerout", link("provider"), { relatedTarget: link("app") });
		pointer("pointerover", link("app"));
		await respond("/api/_web/entity-cards/app/rocketchat", { card: {
			kind: "app", id: "rocketchat", name: "RocketChat", imageUrl: null, category: "chat,developer-tools,space_travel", domain: null,
			rank: null, tokenSharePct: null, models: null, rankChange: null, topModels: { items: [], more: 0 }, firstSeen: null,
		} });
		await advance(SWITCH_DELAY_MS);
		expect(card()?.textContent).toContain("Chat, Developer tools, space_travel");

		pointer("pointerout", link("app"), { relatedTarget: link("bench") });
		pointer("pointerover", link("bench"));
		await respond("/api/_web/entity-cards/benchmark/swe-bench", { card: {
			kind: "benchmark", id: "swe-bench", name: "SWE-bench", category: "long_context", models: 4, lowerIsBetter: false, leaders: [],
		} });
		await advance(SWITCH_DELAY_MS);
		expect(card()?.textContent).toContain("Long context");
	});
});

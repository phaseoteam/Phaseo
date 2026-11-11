/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import { englishCatalogueMessages, englishCommonMessages } from "@/i18n/default-messages";
import {
	ProviderByokOnlyHoverCard,
	ProviderPolicyBlockedHoverCard,
	ProviderStatusHoverCard,
	getEarliestEffectiveTo,
} from "./ProviderRowHoverCards";
import { ParameterHoverChip, formatParameterRange, mergeRouteParameterSpecs } from "./ParameterHoverChip";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	vi.useFakeTimers();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

/** Renders the node and opens its card through keyboard focus, as a keyboard user would. */
async function open(node: ReactNode) {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: englishCatalogueMessages, Common: englishCommonMessages }}>
			{node}
		</AppIntlProvider>,
	));
	const trigger = container.querySelector<HTMLElement>("[data-slot=hover-card-trigger]")!;
	await act(async () => { trigger.focus(); });
	await act(async () => { await vi.runAllTimersAsync(); });
	return { trigger, card: document.body.querySelector<HTMLElement>("[data-slot=hover-card-content]")! };
}

const rows = (card: HTMLElement) =>
	Array.from(card.querySelectorAll("dt")).map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`);

describe("ProviderStatusHoverCard", () => {
	const routes = [{ provider_availability_status: "available" as const, phaseo_status: "enabled" as const, access_scope: "public" as const }];

	it("shows the status, tier and end date, then availability, integration and access as rows", async () => {
		const { trigger, card } = await open(
			<ProviderStatusHoverCard statusKey="active" providerModels={routes} planLabel="Standard" endsOn="12 Mar 2027" />,
		);
		expect(trigger.getAttribute("aria-label")).toContain("Active");
		expect(card.querySelector("[data-slot=hover-card-header] .truncate")?.textContent).toBe("Active");
		expect(card.querySelector("[data-slot=hover-card-meta]")?.textContent).toBe("Standard tier · Ends 12 Mar 2027");
		expect(rows(card)).toEqual(["Provider=Available", "Phaseo=Enabled", "Access=Public"]);
		expect(card.querySelector("[data-slot=hover-card-links] a")?.textContent).toBe("Provider statuses");
		// One layout: nothing inside the card is boxed or titled with a native tooltip.
		expect(card.querySelector("[title]")).toBeNull();
		expect(card.querySelector(".border")).toBeNull();
	});

	it("leaves the meta line out when there is no tier or end date", async () => {
		const { card } = await open(<ProviderStatusHoverCard statusKey="coming_soon" providerModels={[{ access_scope: "public" }]} />);
		expect(card.querySelector("[data-slot=hover-card-meta]")).toBeNull();
		expect(rows(card)).toEqual(["Access=Public"]);
	});
});

it("picks the earliest end date still in the future", () => {
	const now = Date.parse("2026-11-10T00:00:00Z");
	expect(getEarliestEffectiveTo([
		{ effective_to: "2026-01-01T00:00:00Z" },
		{ effective_to: "2027-03-12T00:00:00Z" },
		{ effective_to: "2026-12-01T00:00:00Z" },
		{ effective_to: null },
	], now)).toBe("2026-12-01T00:00:00Z");
	expect(getEarliestEffectiveTo([{ effective_to: null }], now)).toBeNull();
});

it("explains the BYOK-only icon and links to the key settings", async () => {
	const { card } = await open(<ProviderByokOnlyHoverCard />);
	expect(card.querySelector("[data-slot=hover-card-header] .truncate")?.textContent).toBe("BYOK only");
	expect(card.querySelector("[data-slot=hover-card-meta]")?.textContent).toBe("Your provider key");
	expect(card.querySelector("a")?.getAttribute("href")).toContain("/settings/byok");
});

it("shows the block as an alert, then one line per reason with its link", async () => {
	const { card } = await open(
		<ProviderPolicyBlockedHoverCard
			workspaceBlocked
			reasons={[
				{ key: "zdr", label: "Does not meet the ZDR-only rule", href: "/settings/privacy", linkLabel: "Review settings" },
				{ key: "other", label: "Unmatched reason" },
			]}
		/>,
	);
	expect(card.querySelector("[role=alert]")).not.toBeNull();
	const items = Array.from(card.querySelectorAll("li"));
	expect(items.map((item) => item.textContent)).toEqual(["Does not meet the ZDR-only ruleReview settings", "Unmatched reason"]);
	expect(items[0]!.querySelector("a")?.getAttribute("href")).toContain("/settings/privacy");
});

describe("ParameterHoverChip", () => {
	const specs = mergeRouteParameterSpecs([
		{ temperature: { supported: false } },
		{
			temperature: { min: 0, max: 2, default: 1, provider_default: 0.7, upstream_parameter: "UPSTREAM_TEMP_FIELD", support_level: "native" },
			reasoning_effort: { values: ["low", "medium", "high"], provider_values: ["UPSTREAM_LOW", "UPSTREAM_MED", "UPSTREAM_HIGH"] },
		},
	]);

	it("takes each parameter's spec from a route that supports it", () => {
		expect(specs.temperature?.supported).toBe(true);
		expect(specs.temperature?.max).toBe(2);
	});

	it("is the docs link itself and shows the route's spec without the provider's own names", async () => {
		const { trigger, card } = await open(<ParameterHoverChip param="temperature" spec={specs.temperature} />);
		expect(trigger.tagName).toBe("A");
		expect(trigger.getAttribute("href")).toContain("temperature");
		expect(rows(card)).toEqual(["Range=0–2", "Default=1", "Provider default=0.7", "Support=Native"]);
		expect(card.textContent).not.toContain("UPSTREAM");
	});

	it("lists accepted values and never the provider's spelling of them", async () => {
		const { card } = await open(<ParameterHoverChip param="reasoning_effort" spec={specs.reasoning_effort} />);
		expect(rows(card)).toContain("Values=low, medium, high");
		expect(card.textContent).not.toContain("UPSTREAM");
	});

	it("falls back to the generic reference when the route documents nothing", async () => {
		const { card } = await open(<ParameterHoverChip param="temperature" />);
		expect(card.querySelector("dl")).toBeNull();
		expect(card.querySelector("[data-slot=hover-card-meta]")?.textContent).toContain("number");
	});
});

it("formats parameter bounds", () => {
	expect(formatParameterRange({ min: 0, max: 2 }, "en-GB")).toBe("0–2");
	expect(formatParameterRange({ min: 1 }, "en-GB")).toBe("≥ 1");
	expect(formatParameterRange({ max: 4096 }, "en-GB")).toBe("≤ 4,096");
	expect(formatParameterRange({}, "en-GB")).toBeNull();
});

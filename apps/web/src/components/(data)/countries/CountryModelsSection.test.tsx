/** @vitest-environment jsdom */
import { it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppIntlProvider } from "@/i18n/react";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import CountryModelsSection from "./CountryModelsSection";
import { groupCountryModels, previewCountryModels } from "./countryModelGroups";

vi.mock("@/components/(data)/models/Models/ModelCard", () => ({
	ModelCard: ({ model }: { model: { model_id: string } }) => <output>{model.model_id}</output>,
}));

const model = (id: string, organisation: string, timestamp: number) =>
	({
		model_id: id,
		name: id,
		organisation_id: organisation,
		organisation_name: organisation.toUpperCase(),
		primary_timestamp: timestamp,
	}) as unknown as ModelCard;

// "big" has 8 models (2 hidden in the preview), "small" has 1.
const allModels = [...Array.from({ length: 8 }, (_, i) => model(`big/m${i}`, "big", i)), model("small/one", "small", 1)];
const groups = groupCountryModels(allModels, "Unknown");

let root: Root;
let container: HTMLDivElement;
const originalFetch = global.fetch;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	global.fetch = vi.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => ({ country: { organisations: [{ models: allModels }] } }),
	})) as unknown as typeof fetch;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => root.render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: catalogue }}>
				<CountryModelsSection
					iso="US"
					previewModels={previewCountryModels(groups)}
					organisationModelCounts={{ big: 8, small: 1 }}
					totalModels={9}
				/>
			</AppIntlProvider>
		</QueryClientProvider>,
	));
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	global.fetch = originalFetch;
});

const shownIds = () => [...container.querySelectorAll("output")].map((node) => node.textContent);

async function flush() {
	for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

it("renders the preview with full counts and loads the rest on Show all", async () => {
	expect(shownIds()).toEqual(["big/m7", "big/m6", "big/m5", "big/m4", "big/m3", "big/m2", "small/one"]);
	expect(container.textContent).toContain("9 models");
	expect(container.textContent).toContain("8 models");
	expect(global.fetch).not.toHaveBeenCalled();

	const button = [...container.querySelectorAll("button")].find((node) => node.textContent === "Show all 8 models");
	await act(async () => { button!.click(); });
	await flush();

	expect(String((global.fetch as Mock).mock.calls[0][0])).toContain("/api/_web/countries/US");
	expect(shownIds()).toEqual([...Array.from({ length: 8 }, (_, i) => `big/m${7 - i}`), "small/one"]);
	expect([...container.querySelectorAll("button")].some((node) => node.textContent?.startsWith("Show all"))).toBe(false);
});

it("warns that a search is incomplete when the full list fails, and retries", async () => {
	// 404 isn't retried, so the query fails at once; 5xx ends the same way after its retries.
	(global.fetch as Mock).mockImplementationOnce(async () => ({ ok: false, status: 404, json: async () => ({}) }));
	const input = container.querySelector("input")!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "big/m1");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await flush();

	// Only the preview (big/m2..m7) was searched, so big/m1 is missing until the retry.
	expect(container.textContent).toContain("Couldn't load every model");
	expect(shownIds()).toEqual([]);

	const retry = [...container.querySelectorAll("button")].find((node) => node.textContent === "Try again");
	await act(async () => { retry!.click(); });
	await flush();

	expect(container.textContent).not.toContain("Couldn't load every model");
	expect(shownIds()).toEqual(["big/m1"]);
});

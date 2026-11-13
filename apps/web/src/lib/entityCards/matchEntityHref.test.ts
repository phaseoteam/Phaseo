/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { matchEntityHref } from "./matchEntityHref";
import { entityLinkFromTarget } from "./entityLink";

describe("matchEntityHref", () => {
	it.each([
		["/models/openai/gpt-5", { kind: "model", id: "openai/gpt-5" }],
		["/api-providers/venice", { kind: "provider", id: "venice" }],
		["/organisations/google", { kind: "organisation", id: "google" }],
		["/apps/example-app", { kind: "app", id: "example-app" }],
		["/benchmarks/mmmu", { kind: "benchmark", id: "mmmu" }],
		["/families/openai/gpt-5", { kind: "family", id: "openai/gpt-5" }],
		["/families/gemma", { kind: "family", id: "gemma" }],
		["/models/collections/image-generation", { kind: "collection", id: "image-generation" }],
		["/countries/gb", { kind: "country", id: "GB" }],
	])("matches %s", (href, expected) => {
		expect(matchEntityHref(href)).toEqual(expected);
	});

	it("matches with a public locale prefix, query string, hash and trailing slash", () => {
		expect(matchEntityHref("/fr-FR/models/openai/gpt-5")).toEqual({ kind: "model", id: "openai/gpt-5" });
		expect(matchEntityHref("/ja/api-providers/venice/")).toEqual({ kind: "provider", id: "venice" });
		expect(matchEntityHref("/ar-SA/countries/us?tab=x#top")).toEqual({ kind: "country", id: "US" });
		expect(matchEntityHref("/zh-Hans/families/openai/gpt-5")).toEqual({ kind: "family", id: "openai/gpt-5" });
	});

	it("decodes encoded segments", () => {
		expect(matchEntityHref("/models/acme/rocket%3Afree")).toEqual({ kind: "model", id: "acme/rocket:free" });
		expect(matchEntityHref("/models/acme/%E0%A4%A")).toBeNull();
	});

	it("ignores sub-pages, tabs and listings", () => {
		for (const href of [
			"/models/openai/gpt-5/pricing",
			"/models/openai",
			"/models",
			"/models/table",
			"/models/collections",
			"/models/collections/free/extra",
			"/api-providers/venice/models",
			"/api-providers/venice/text-models",
			"/api-providers/compare",
			"/api-providers/table",
			"/organisations/google/models",
			"/organisations",
			"/countries/gb/models",
			"/countries/united-kingdom",
			"/apps",
			"/benchmarks/mmmu/x",
			"/families",
			"/rankings",
			"/fr-FR",
		]) {
			expect(matchEntityHref(href), href).toBeNull();
		}
	});

	it("only accepts absolute URLs on the given origin", () => {
		expect(matchEntityHref("https://phaseo.app/models/openai/gpt-5", "https://phaseo.app")).toEqual({ kind: "model", id: "openai/gpt-5" });
		expect(matchEntityHref("https://example.com/models/openai/gpt-5", "https://phaseo.app")).toBeNull();
		expect(matchEntityHref("https://phaseo.app/models/openai/gpt-5")).toBeNull();
		expect(matchEntityHref("//phaseo.app/models/openai/gpt-5")).toBeNull();
		expect(matchEntityHref("mailto:hi@phaseo.app")).toBeNull();
		expect(matchEntityHref("#models")).toBeNull();
		expect(matchEntityHref("models/openai/gpt-5")).toBeNull();
		expect(matchEntityHref(null)).toBeNull();
	});
});

describe("entityLinkFromTarget", () => {
	function link(html: string) {
		document.body.innerHTML = html;
		return document.querySelector("#target")!;
	}

	it("finds the link around the hovered element", () => {
		const target = link(`<main><a href="/models/openai/gpt-5"><span id="target">GPT-5</span></a></main>`);
		expect(entityLinkFromTarget(target, "/rankings")).toMatchObject({ kind: "model", id: "openai/gpt-5" });
	});

	it("respects the opt-out attribute on the link or an ancestor", () => {
		expect(entityLinkFromTarget(link(`<a id="target" data-no-entity-card href="/models/a/b">x</a>`), "/")).toBeNull();
		expect(entityLinkFromTarget(link(`<div data-no-entity-card><a id="target" href="/models/a/b">x</a></div>`), "/")).toBeNull();
	});

	it("skips links that already open a hover card or popover", () => {
		expect(entityLinkFromTarget(link(`<a id="target" data-slot="hover-card-trigger" href="/models/a/b">x</a>`), "/")).toBeNull();
		expect(entityLinkFromTarget(link(`<span data-slot="popover-trigger"><a id="target" href="/models/a/b">x</a></span>`), "/")).toBeNull();
	});

	it("skips navigation, headers and breadcrumbs", () => {
		expect(entityLinkFromTarget(link(`<nav><a id="target" href="/models/a/b">x</a></nav>`), "/")).toBeNull();
		expect(entityLinkFromTarget(link(`<header><a id="target" href="/organisations/a">x</a></header>`), "/")).toBeNull();
		expect(entityLinkFromTarget(link(`<ol aria-label="Breadcrumb"><li><a id="target" href="/organisations/a">x</a></li></ol>`), "/")).toBeNull();
		expect(entityLinkFromTarget(link(`<a id="target" aria-current="page" href="/organisations/a">x</a>`), "/")).toBeNull();
	});

	it("skips the page's own entity, with or without a locale", () => {
		expect(entityLinkFromTarget(link(`<a id="target" href="/models/a/b">x</a>`), "/de-DE/models/a/b")).toBeNull();
		expect(entityLinkFromTarget(link(`<a id="target" href="/countries/gb">x</a>`), "/countries/GB")).toBeNull();
		expect(entityLinkFromTarget(link(`<a id="target" href="/models/a/c">x</a>`), "/models/a/b")).toMatchObject({ id: "a/c" });
	});

	it("never opens a card from a link inside a card", () => {
		expect(entityLinkFromTarget(link(`<div data-entity-card><a id="target" href="/organisations/a">x</a></div>`), "/")).toBeNull();
		expect(entityLinkFromTarget(link(`<header><div data-entity-card><a id="target" href="/organisations/a">x</a></div></header>`), "/")).toBeNull();
	});

	it("ignores elements that are not inside a link", () => {
		expect(entityLinkFromTarget(link(`<button id="target">x</button>`), "/")).toBeNull();
		expect(entityLinkFromTarget(null, "/")).toBeNull();
	});
});

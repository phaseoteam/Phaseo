import { describe, expect, it } from "vitest";
import { phaseoModelOptions, phaseoRequestSettings } from "./phaseoModelOptions";

const offer = (parameter_details: Record<string, unknown>, routable = true) => ({ routable, capabilities: { parameter_details } });
const model = (...offers: ReturnType<typeof offer>[]) => ({ id: "owned/model", capabilities: { parameter_details: {} }, offers });
const levels = (id: string, options: { id: string; isDefault?: boolean }[]) => options.find(option => option.id === id);

describe("Phaseo model option descriptors", () => {
	it("builds a Reasoning select from advertised efforts with labels and the advertised default", () => {
		const [effort] = phaseoModelOptions(model(offer({ reasoning_effort: { supported: true, values: ["none", "low", "medium", "high"], supported_values: ["none", "low", "medium", "high", "xhigh"], provider_default: "low" } })));
		expect(effort).toEqual({ id: "effort", label: "Reasoning", type: "select", options: [{ id: "none", label: "None" }, { id: "low", label: "Low", isDefault: true }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }, { id: "xhigh", label: "Extra High" }] });
	});
	it("reads nested reasoning.effort, falls back to medium and only lists instant when advertised", () => {
		const [effort] = phaseoModelOptions(model(offer({ reasoning: { supported: true, effort: { default_value: "turbo", supported_values: ["max", "low", "medium", "high", "unknown"] } } })));
		expect(effort.type === "select" && effort.options.map(option => [option.id, option.label, option.isDefault ?? false])).toEqual([["low", "Low", false], ["medium", "Medium", true], ["high", "High", false], ["max", "Max", false]]);
		const [instant] = phaseoModelOptions(model(offer({ "reasoning.effort": { enum: ["instant", "minimal", "high"], default: "high" } })));
		expect(instant.type === "select" && instant.options.map(option => option.label)).toEqual(["Instant", "Minimal", "High"]);
		expect(instant.type === "select" && levels("high", instant.options)?.isDefault).toBe(true);
	});
	it("intersects efforts across routable providers that advertise them and omits Reasoning without values", () => {
		const [effort] = phaseoModelOptions(model(offer({ reasoning: { supported_values: ["low", "medium", "high", "xhigh"], default_value: "high" } }), offer({ reasoning_effort: { supported_values: ["minimal", "low", "medium", "high"], default_value: "high" } }), offer({ reasoning_effort: { supported: true } }), offer({ reasoning: { supported_values: ["none"] } }, false)));
		expect(effort.type === "select" && effort.options).toEqual([{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High", isDefault: true }]);
		expect(phaseoModelOptions(model(offer({ reasoning: { supported: true, provider_default: "medium" }, reasoning_effort: { supported: true } })))).toEqual([]);
		expect(phaseoModelOptions(model(offer({ reasoning: { supported_values: ["low"] } }), offer({ reasoning: { supported_values: ["high"] } })))).toEqual([]);
	});
	it("uses model-level details when no routable offer carries any", () => {
		expect(phaseoModelOptions({ capabilities: { parameter_details: { reasoning: { supported_values: ["low", "high"] }, service_tier: { supported_values: ["standard", "flex"] } } }, offers: [{ routable: true }] }).map(option => option.id)).toEqual(["effort", "speed"]);
	});
	it("builds Speed from service_tier values, aliases and positive notes across routable providers", () => {
		const [speed] = phaseoModelOptions(model(offer({ service_tier: { supported: true, supported_values: ["standard", "priority"], provider_default: "standard" } }), offer({ service_tier: { supported: true, notes: "Flex processing is available at half price." } }), offer({ service_tier: { supported: true, enum: ["default", "ultrafast"] } }, false)));
		expect(speed).toEqual({ id: "speed", label: "Speed", type: "select", options: [{ id: "standard", label: "Standard", isDefault: true }, { id: "priority", label: "Fast" }, { id: "flex", label: "Flex" }] });
		const [fast] = phaseoModelOptions(model(offer({ service_tier: { values: [{ value: "fast" }, "ultrafast"] } })));
		expect(fast.type === "select" && fast.options.map(option => option.label)).toEqual(["Standard", "Fast", "Ultrafast"]);
	});
	it("omits Speed when only standard is offered or a note rules a tier out", () => {
		for (const details of [{}, { service_tier: { supported: true, enum: ["standard", "default"], provider_catalog: { name: "standard" } } }, { service_tier: { supported: true, notes: "Priority processing is not available for this model." } }, { service_tier: { supported: true } }]) expect(phaseoModelOptions(model(offer(details)))).toEqual([]);
	});
	it("prefers the service_tiers each routable offer lists over parameter hints", () => {
		const model = { offers: [{ routable: true, service_tiers: ["standard", "priority"], capabilities: { parameter_details: {} } }, { routable: true, service_tiers: ["standard", "flex"], capabilities: { parameter_details: {} } }, { routable: false, service_tiers: ["ultrafast"] }] };
		expect(phaseoModelOptions(model)).toEqual([{ id: "speed", label: "Speed", type: "select", options: [{ id: "standard", label: "Standard", isDefault: true }, { id: "priority", label: "Fast" }, { id: "flex", label: "Flex" }] }]);
		expect(phaseoModelOptions({ offers: [{ routable: true, service_tiers: ["standard"], capabilities: { parameter_details: { service_tier: { supported_values: ["standard", "priority"] } } } }] })).toEqual([]);
	});
});

describe("Phaseo request settings", () => {
	it("sends only explicit effort and non-standard speed", () => {
		expect(phaseoRequestSettings({ effort: "high", speed: "priority" })).toEqual({ reasoning: { effort: "high" }, service_tier: "priority" });
		expect(phaseoRequestSettings({ effort: "low", speed: "standard" })).toEqual({ reasoning: { effort: "low" } });
		expect(phaseoRequestSettings({ speed: "flex", effort: true })).toEqual({ service_tier: "flex" });
		expect(phaseoRequestSettings(undefined)).toEqual({});
	});
});

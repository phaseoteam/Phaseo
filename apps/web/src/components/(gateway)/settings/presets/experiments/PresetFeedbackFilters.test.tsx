// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import settings from "../../../../../../messages/en-GB/settings-ui.json";
import { PresetFeedbackFilters } from "./PresetFeedbackFilters";

vi.mock("@/components/link", () => ({ default: () => null }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => {
	let value: unknown = settings;
	for (const part of key.split(".")) value = (value as Record<string, unknown>)?.[part];
	return typeof value === "string" ? value : key;
} }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.stubGlobal("PointerEvent", MouseEvent);
	vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
	Element.prototype.scrollIntoView ??= () => {};
	container = document.createElement("div"); document.body.append(container); root = createRoot(container);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("lets a selected metadata key be cleared so the form stops submitting it", async () => {
	await act(() => root.render(<PresetFeedbackFilters
		filters={{ range: "30d", from: "", to: "", baselineId: null, metadataKey: "user_tier", metadataValue: "", rating: "all" } as never}
		presets={[]}
		baselineId={null}
		metadataKeys={["user_tier", "region"]}
	/>));
	const hidden = () => container.querySelector<HTMLInputElement>('input[type="hidden"][name="metadata_key"]')!;
	expect(hidden().value).toBe("user_tier");
	await act(() => document.querySelector<HTMLButtonElement>('[aria-label="Metadata Cohort"]')!.click());
	const none = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].find((item) => item.textContent === settings.strings.None);
	expect(none).toBeDefined();
	await act(() => none!.click());
	expect(hidden().value).toBe("");
});

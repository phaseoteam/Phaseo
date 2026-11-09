// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KeySettingsForm from "./KeySettingsForm";
import { updateApiKeyAction } from "@/features/settings/keys/actions";

vi.mock("@/features/settings/keys/actions", () => ({ updateApiKeyAction: vi.fn() }));
vi.mock("../PrivateSettingsQuery", () => ({ useInvalidatePrivateSettings: () => () => Promise.resolve() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => key }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal("PointerEvent", MouseEvent);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const key = { id: "fixture", status: "active", daily_limit_requests: 100, daily_limit_cost_nanos: 2_000_000_000, ip_allowlist: [], storage_locations: [] };
async function render() { await act(() => root.render(<KeySettingsForm k={key} />)); }
async function edit(selector: string, value: string) {
	await act(() => {
		const input = container.querySelector<HTMLInputElement>(selector)!;
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

it("Cancel restores saved limits and key status without sending a mutation", async () => {
	await render();
	await edit("#edit-key-daily-requests", "250");
	await edit("#edit-key-daily-spend", "8");
	await act(() => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
	expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
	await act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "strings.Cancel")!.click());
	expect(container.querySelector<HTMLInputElement>("#edit-key-daily-requests")!.value).toBe("100");
	expect(container.querySelector<HTMLInputElement>("#edit-key-daily-spend")!.value).toBe("2");
	expect(container.querySelector('[role="switch"]')!.getAttribute("aria-checked")).toBe("true");
	expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
	expect(updateApiKeyAction).not.toHaveBeenCalled();
});

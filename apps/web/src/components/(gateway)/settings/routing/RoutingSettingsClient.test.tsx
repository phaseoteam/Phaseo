// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../messages/en-GB/settings-ui.json";
import RoutingSettingsClient from "./RoutingSettingsClient";
import { updateRoutingSettings } from "@/features/settings/routing/actions";

vi.mock("@/features/settings/routing/actions", () => ({ updateRoutingSettings: vi.fn() }));
vi.mock("../PrivateSettingsQuery", () => ({ useInvalidatePrivateSettings: () => () => Promise.resolve() }));
vi.mock("@/components/(data)/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => Object.assign((key: string) => {
	let value: unknown = messages;
	for (const part of key.split(".")) value = (value as Record<string, unknown>)?.[part];
	return typeof value === "string" ? value : key;
}, { has: () => false }) }));
vi.mock("@/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: () => null,
}));
vi.mock("@/components/ui/switch", () => ({ Switch: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (value: boolean) => void; id: string; "aria-label": string }) =>
	<input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} {...props} /> }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.clearAllMocks();
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); });

async function render(canManage = true) {
	await act(() => root.render(<RoutingSettingsClient workspaceId="workspace-1" canManage={canManage} teamName="Fixture workspace" />));
}
async function toggle() { await act(() => container.querySelector<HTMLInputElement>("#beta-channel")!.click()); }
function button(text: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === text)!; }
async function submit() { await act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("routing policy saves", () => {
	it("keeps changes local until Save, waits for acknowledgement, and prevents duplicate submissions", async () => {
		const result = Promise.withResolvers<{ ok: true; gatewayCacheInvalidated: boolean }>();
		vi.mocked(updateRoutingSettings).mockReturnValue(result.promise);
		await render(); await toggle();
		expect(updateRoutingSettings).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Unsaved changes");
		await submit(); await submit();
		expect(updateRoutingSettings).toHaveBeenCalledTimes(1);
		expect(updateRoutingSettings).toHaveBeenCalledWith({ data: expect.objectContaining({ expectedWorkspaceId: "workspace-1", betaChannelEnabled: true }) });
		expect(container.textContent).not.toContain("Routing policy updated");
		expect(container.querySelector("fieldset")!.disabled).toBe(true);
		await act(async () => result.resolve({ ok: true, gatewayCacheInvalidated: false }));
		expect(container.textContent).toContain("Routing policy updated; gateway cache refresh pending");
		expect(button("Save changes").disabled).toBe(true);
	});

	it("keeps failed edits visible and allows an explicit retry", async () => {
		vi.mocked(updateRoutingSettings).mockResolvedValueOnce({ ok: false, error: "settings_unavailable" }).mockResolvedValueOnce({ ok: true, gatewayCacheInvalidated: true });
		await render(); await toggle(); await submit();
		expect(container.querySelector("[role=alert]")?.textContent).toBe(messages.credits["Failed to update routing policy"]);
		expect(container.querySelector<HTMLInputElement>("#beta-channel")!.checked).toBe(true);
		expect(button("Try again").disabled).toBe(false);
		await submit();
		expect(updateRoutingSettings).toHaveBeenCalledTimes(2);
		expect(container.querySelector("[role=alert]")).toBeNull();
		expect(container.textContent).toContain("Routing policy updated");
	});

	it("cancels the draft without writing and clears dependent alpha access", async () => {
		await render(); await toggle();
		await act(() => container.querySelector<HTMLInputElement>("#alpha-channel")!.click());
		await toggle(); await toggle();
		expect(container.querySelector<HTMLInputElement>("#alpha-channel")!.checked).toBe(false);
		await act(() => button("Cancel").click());
		expect(container.querySelector<HTMLInputElement>("#beta-channel")!.checked).toBe(false);
		expect(updateRoutingSettings).not.toHaveBeenCalled();
	});

	it("shows read-only policy values to members and never writes on submit", async () => {
		await render(false);
		expect(container.textContent).toContain("Only workspace owners and admins");
		expect(container.querySelector("fieldset")!.disabled).toBe(true);
		expect(button("Save changes")).toBeUndefined();
		await submit();
		expect(updateRoutingSettings).not.toHaveBeenCalled();
	});

	it("does not present invented provider traffic percentages", async () => {
		await render();
		expect(container.textContent).not.toContain("Routing Preview");
		expect(container.textContent).not.toMatch(/\d+%/);
	});
});

// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import settings from "../../../../../messages/en-GB/settings-ui.json";
import common from "../../../../../messages/en-GB/common.json";
import AccountPrivacySettingsClient from "./AccountPrivacySettingsClient";
import { updateGlobalGuardrailsSettings } from "@/features/settings/guardrails/actions";
import type { AccountPrivacyPolicy } from "@/lib/fetchers/internal/settingsTypes";

vi.mock("@/features/settings/guardrails/actions", () => ({ updateGlobalGuardrailsSettings: vi.fn() }));
vi.mock("../PrivateSettingsQuery", () => ({ useInvalidatePrivateSettings: () => () => Promise.resolve() }));
vi.mock("@/components/(data)/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/components/link", () => ({ default: () => null }));
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/i18n/react", () => ({ useTranslations: (namespace: string) => (key: string) => {
	let value: unknown = namespace === "SettingsUI" ? settings : common.ui;
	for (const part of key.split(".")) value = (value as Record<string, unknown>)?.[part];
	return typeof value === "string" ? value : key;
} }));

const policy: AccountPrivacyPolicy = {
	privacyEnablePaidMayTrain: true, privacyEnableFreeMayTrain: true, privacyEnableInputOutputLogging: true, privacyZdrOnly: false,
	providerRestrictionMode: "blocklist", providerRestrictionProviderIds: ["fixture-provider"], modelRestrictionMode: "blocklist", modelRestrictionModelIds: ["fixture-model"],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("PointerEvent", MouseEvent);
	container = document.createElement("div"); document.body.append(container); root = createRoot(container);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(section: "privacy" | "access" = "privacy", canManage = true) {
	await act(() => root.render(<AccountPrivacySettingsClient section={section} canManage={canManage} policy={policy} providers={[{ id: "fixture-provider", name: "Fixture provider" }]} models={[{ id: "fixture-model", name: "Fixture model", organisationId: "fixture-lab", organisationName: "Fixture lab", providerIds: [] }]} workspaceId="workspace-1" workspaceLogStorage={{ enabled: false, retentionDays: 90, includeProviderPayloads: true, contentsAccess: "admins" }} />));
}
async function submit() { await act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
function isDisabled(control: Element) { return control.matches(":disabled") || control.getAttribute("aria-disabled") === "true"; }

it("saves data and log settings together without replacing the separate route restrictions", async () => {
	const response = Promise.withResolvers<{ success: true }>();
	vi.mocked(updateGlobalGuardrailsSettings).mockReturnValue(response.promise);
	await render();
	expect(container.textContent).not.toContain("Route Access");
	await act(() => container.querySelector<HTMLButtonElement>("[role=switch]")!.click());
	expect(updateGlobalGuardrailsSettings).not.toHaveBeenCalled();
	await submit();
	expect(updateGlobalGuardrailsSettings).toHaveBeenCalledTimes(1);
	const input = vi.mocked(updateGlobalGuardrailsSettings).mock.calls[0][0]!.data;
	expect(input).toMatchObject({ expectedWorkspaceId: "workspace-1", payload: { privacyEnablePaidMayTrain: false, ioLoggingContentsAccess: "admins", ioLoggingEnabled: false } });
	expect(input.payload).not.toHaveProperty("providerRestrictionMode");
	expect(container.querySelector("fieldset")!.disabled).toBe(true);
	const switchControl = container.querySelector<HTMLButtonElement>("[role=switch]")!;
	expect(isDisabled(switchControl)).toBe(true);
	await act(() => switchControl.click());
	expect(switchControl.getAttribute("aria-checked")).toBe("false");
	await act(() => response.resolve({ success: true }));
	expect(container.textContent).toContain(common.ui.privacyEligibility.changesSaved);
});

it("retains failed privacy edits for retry and lets Cancel restore the saved policy", async () => {
	vi.mocked(updateGlobalGuardrailsSettings).mockRejectedValue(new Error("fixture failure"));
	await render();
	await act(() => container.querySelector<HTMLButtonElement>("[role=switch]")!.click());
	await submit();
	expect(container.querySelector("[role=alert]")?.textContent).toBe(common.ui.privacyEligibility.saveFailed);
	await act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")!.click());
	expect(container.querySelector("[role=alert]")).toBeNull();
	expect(container.querySelector("[role=switch]")?.getAttribute("aria-checked")).toBe("true");
});

it("separates route access from data handling and keeps member policies read-only", async () => {
	await render("access", false);
	expect(container.textContent).toContain("Route Access");
	expect(container.textContent).not.toContain("Data Handling");
	expect(container.textContent).not.toContain("Gateway Log Storage");
	expect(isDisabled(container.querySelector("[role=checkbox]")!)).toBe(true);
	await submit();
	expect(updateGlobalGuardrailsSettings).not.toHaveBeenCalled();
});

it("lets members browse model restrictions and availability without editing policy", async () => {
	await render("access", false);
	const modelsTab = container.querySelector<HTMLButtonElement>('[role=tab][aria-selected=false]')!;
	expect(modelsTab.matches(":disabled")).toBe(false);
	await act(() => modelsTab.click());
	expect(modelsTab.getAttribute("aria-selected")).toBe("true");
	expect(container.querySelector("input[placeholder]")!.matches(":disabled")).toBe(false);
	const modelCheckbox = container.querySelector<HTMLButtonElement>("[role=checkbox]")!;
	expect(isDisabled(modelCheckbox)).toBe(true);
	expect(modelCheckbox.getAttribute("aria-checked")).toBe("true");
	await act(() => modelCheckbox.click());
	expect(modelCheckbox.getAttribute("aria-checked")).toBe("true");
	const clearAll = [...container.querySelectorAll("button")].find((button) => button.textContent === common.ui.privacyEligibility.clearAll)!;
	expect(clearAll.matches(":disabled")).toBe(true);
	const available = [...container.querySelectorAll("button")].find((button) => button.textContent === common.ui.privacyEligibility.availableCount)!;
	expect(available.matches(":disabled")).toBe(false);
	await act(() => available.click());
	expect(container.textContent).toContain(common.ui.privacyEligibility.noItemsMatchFilters);
	const providers = [...container.querySelectorAll("button")].find((button) => !button.hasAttribute("role") && button.textContent === common.ui.privacyEligibility.providers)!;
	expect(providers.matches(":disabled")).toBe(false);
	await act(() => providers.click());
	expect(container.textContent).toContain(common.ui.privacyEligibility.providerCoverage);
	await submit();
	expect(updateGlobalGuardrailsSettings).not.toHaveBeenCalled();
});

it("keeps member data and log controls read-only while availability filters work", async () => {
	await render("privacy", false);
	for (const control of container.querySelectorAll('[role=switch], [role=combobox]')) expect(isDisabled(control)).toBe(true);
	const providers = [...container.querySelectorAll("button")].find((button) => button.textContent === common.ui.privacyEligibility.providers)!;
	expect(providers.matches(":disabled")).toBe(false);
	await act(() => providers.click());
	expect(container.textContent).toContain(common.ui.privacyEligibility.providerCoverage);
	await submit();
	expect(updateGlobalGuardrailsSettings).not.toHaveBeenCalled();
});

it("saves route restrictions without replacing the workspace's data and log settings", async () => {
	vi.mocked(updateGlobalGuardrailsSettings).mockResolvedValue({ success: true });
	await render("access");
	await act(() => container.querySelector<HTMLButtonElement>("[role=checkbox]")!.click());
	await submit();
	const payload = vi.mocked(updateGlobalGuardrailsSettings).mock.calls[0][0]!.data.payload;
	expect(payload).toMatchObject({ providerRestrictionMode: "blocklist", providerRestrictionProviderIds: [] });
	expect(payload).not.toHaveProperty("privacyZdrOnly");
	expect(payload).not.toHaveProperty("ioLoggingEnabled");
});

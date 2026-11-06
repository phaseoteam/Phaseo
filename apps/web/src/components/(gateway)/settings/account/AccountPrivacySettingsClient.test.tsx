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
	providerRestrictionMode: "blocklist", providerRestrictionProviderIds: ["fixture-provider"], modelRestrictionMode: "none", modelRestrictionModelIds: [],
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
	await act(() => root.render(<AccountPrivacySettingsClient section={section} canManage={canManage} policy={policy} providers={[{ id: "fixture-provider", name: "Fixture provider" }]} models={[]} workspaceId="workspace-1" workspaceLogStorage={{ enabled: false, retentionDays: 90, includeProviderPayloads: true, contentsAccess: "admins" }} />));
}
async function submit() { await act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

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
	expect(container.querySelector("fieldset")!.disabled).toBe(true);
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

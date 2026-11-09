// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { updateTeamSsoSettingsAction } from "@/features/settings/teams/actions";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";
import WorkspaceSamlSettingsCard from "./WorkspaceSamlSettingsCard";

vi.mock("@/features/settings/teams/actions", () => ({ updateTeamSsoSettingsAction: vi.fn() }));
vi.mock("../PrivateSettingsQuery", () => ({ useInvalidatePrivateSettings: () => () => Promise.resolve() }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => false }) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal("PointerEvent", MouseEvent);
	container = document.createElement("div"); document.body.append(container); root = createRoot(container);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const initialSettings = { sso_enabled: false, sso_provider_identifier: "original-provider", sso_domains: ["original.example"] };
async function render(settings: TeamSsoSettingsRow = initialSettings) {
	await act(() => root.render(<WorkspaceSamlSettingsCard workspaceId="workspace" initialSettings={settings} canEdit />));
}
async function edit(selector: string, value: string) {
	await act(() => {
		const input = container.querySelector<HTMLInputElement>(selector)!;
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
const button = (text: string) => [...container.querySelectorAll("button")].find((entry) => entry.textContent === text)!;

it("uses the acknowledged SSO response for Cancel before refresh and reconciles later query updates", async () => {
	const response = Promise.withResolvers<Awaited<ReturnType<typeof updateTeamSsoSettingsAction>>>();
	vi.mocked(updateTeamSsoSettingsAction).mockReturnValue(response.promise);
	await render();
	await edit("#samlProviderId", "new-provider");
	await edit("#samlDomains", "NEW.EXAMPLE");
	await act(() => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
	await act(() => button("saml.save").click());
	expect(button("saml.save").disabled).toBe(true);
	const acknowledged = { sso_enabled: true, sso_provider_identifier: "new-provider", sso_domains: ["new.example"] };
	await act(() => response.resolve({ success: true, workspaceId: "workspace", settings: acknowledged }));
	expect(button("saml.save").disabled).toBe(true);
	await render({ ...initialSettings });
	expect(container.querySelector<HTMLInputElement>("#samlDomains")!.value).toBe("new.example");
	await edit("#samlDomains", "draft.example");
	await act(() => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
	await act(() => button("strings.Cancel").click());
	expect(container.querySelector<HTMLInputElement>("#samlProviderId")!.value).toBe("new-provider");
	expect(container.querySelector<HTMLInputElement>("#samlDomains")!.value).toBe("new.example");
	expect(container.querySelector('[role="switch"]')!.getAttribute("aria-checked")).toBe("true");
	await edit("#samlDomains", "unsaved.example");
	await render({ ...acknowledged, sso_domains: ["refreshed.example"] });
	expect(container.querySelector<HTMLInputElement>("#samlDomains")!.value).toBe("unsaved.example");
	await act(() => button("strings.Cancel").click());
	expect(container.querySelector<HTMLInputElement>("#samlDomains")!.value).toBe("refreshed.example");
	expect(button("saml.save").disabled).toBe(true);
	await render({ ...acknowledged, sso_domains: ["latest.example"] });
	expect(container.querySelector<HTMLInputElement>("#samlDomains")!.value).toBe("latest.example");
	expect(button("saml.save").disabled).toBe(true);
});

it("keeps the saved baseline after a failed SSO save", async () => {
	vi.mocked(updateTeamSsoSettingsAction).mockRejectedValue(new Error("fixture failure"));
	await render();
	await edit("#samlDomains", "unsaved.example");
	await act(() => button("saml.save").click());
	expect(button("saml.save").disabled).toBe(false);
	await act(() => button("strings.Cancel").click());
	expect(container.querySelector<HTMLInputElement>("#samlDomains")!.value).toBe("original.example");
});

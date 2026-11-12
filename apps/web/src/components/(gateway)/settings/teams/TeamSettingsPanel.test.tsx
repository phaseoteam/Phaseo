// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import settings from "../../../../../messages/en-GB/settings-ui.json";
import { updateTeamAction, updateWorkspacePublisherHandleAction } from "@/features/settings/teams/actions";
import TeamSettingsPanel from "./TeamSettingsPanel";

vi.mock("@/features/settings/teams/actions", () => ({ updateTeamAction: vi.fn(), updateWorkspacePublisherHandleAction: vi.fn(), deleteTeamAction: vi.fn() }));
vi.mock("../PrivateSettingsQuery", () => ({ useInvalidatePrivateSettings: () => () => Promise.resolve() }));
vi.mock("@/components/(data)/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("./WorkspaceIdentitySettings", () => ({ default: () => null }));
vi.mock("@/components/providers/DisplayPreferencesProvider", () => ({ useDisplayFormatters: () => ({ number: String }) }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => {
	let value: unknown = settings;
	for (const part of key.split(".")) value = (value as Record<string, unknown>)?.[part];
	return typeof value === "string" ? value : key;
} }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.resetAllMocks();
	container = document.createElement("div"); document.body.append(container); root = createRoot(container);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); });
async function render(role = "owner") {
	await act(() => root.render(<TeamSettingsPanel teams={[{ id: "workspace", name: "Original workspace", publisherHandle: "original" }]} membersByTeam={{ workspace: [{ user_id: "user", role }] }} workspaceId="workspace" currentUserId="user" />));
}
async function editField(selector: string, value: string) {
	await act(() => {
		const input = container.querySelector<HTMLInputElement>(selector)!;
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
const editName = (value: string) => editField("#teamName", value);
async function submit() { await act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("keeps the form saving until the server acknowledges and prevents duplicate saves", async () => {
	const response = Promise.withResolvers<Awaited<ReturnType<typeof updateTeamAction>>>();
	vi.mocked(updateTeamAction).mockReturnValue(response.promise);
	await render();
	await editName("New workspace");
	await submit();
	await submit();
	expect(updateTeamAction).toHaveBeenCalledExactlyOnceWith({ data: { workspaceId: "workspace", name: "New workspace" } });
	expect(container.querySelector("fieldset")!.disabled).toBe(true);
	expect(container.querySelector("[role=status]")!.textContent).not.toContain(settings.workspace.savedSettings);
	await act(() => response.resolve({ id: "workspace" }));
	expect(container.querySelector("fieldset")!.disabled).toBe(false);
	expect(container.querySelector("[role=status]")!.textContent).toBe(settings.workspace.savedSettings);
	expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
});

it("keeps failed edits available for retry and lets Cancel restore the saved name", async () => {
	vi.mocked(updateTeamAction).mockRejectedValue(new Error("fixture failure"));
	await render();
	await editName("New workspace");
	await submit();
	expect(container.querySelector("[role=alert]")!.textContent).toBe(settings.strings["Could not save settings"]);
	expect(container.querySelector<HTMLInputElement>("#teamName")!.value).toBe("New workspace");
	expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
	await act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === settings.labels.cancel)!.click());
	expect(container.querySelector<HTMLInputElement>("#teamName")!.value).toBe("Original workspace");
	expect(container.querySelector("[role=alert]")).toBeNull();
});

it("keeps member workspace fields read-only and does not offer save actions", async () => {
	await render("member");
	expect(container.querySelector<HTMLInputElement>("#teamName")!.disabled).toBe(true);
	expect(container.querySelector<HTMLInputElement>("#publisherHandle")!.disabled).toBe(true);
	expect(container.querySelector('button[type="submit"]')).toBeNull();
	await submit();
	expect(updateTeamAction).not.toHaveBeenCalled();
});

it("retries only the failed field when the name was already saved", async () => {
	vi.mocked(updateTeamAction).mockResolvedValue({ id: "workspace" });
	vi.mocked(updateWorkspacePublisherHandleAction).mockRejectedValueOnce(new Error("fixture failure"));
	await render();
	await editName("New workspace");
	await editField("#publisherHandle", "new-handle");
	await submit();
	expect(container.querySelector("[role=alert]")).not.toBeNull();
	vi.mocked(updateWorkspacePublisherHandleAction).mockResolvedValue({ ok: true, handle: "new-handle" });
	await submit();
	expect(updateTeamAction).toHaveBeenCalledTimes(1);
	expect(updateWorkspacePublisherHandleAction).toHaveBeenCalledTimes(2);
	expect(container.querySelector("[role=alert]")).toBeNull();
	expect(container.querySelector("[role=status]")!.textContent).toBe(settings.workspace.savedSettings);
});

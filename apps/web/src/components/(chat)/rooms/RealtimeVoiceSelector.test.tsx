/** @vitest-environment jsdom */
// The voice list is a set of toggle buttons: the chosen voice must be exposed
// as pressed. aria-selected is not valid on a button, so screen readers ignored it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en-GB",
}));

import { RealtimeVoiceSelector } from "./RealtimeRoom";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("RealtimeVoiceSelector", () => {
	it("marks only the chosen voice as pressed", () => {
		act(() =>
			root.render(
				<RealtimeVoiceSelector
					voices={[
						{ id: "alloy", label: "Alloy" },
						{ id: "verse", label: "Verse" },
					]}
					selectedVoiceId="verse"
					onSelectVoice={() => undefined}
					disabled={false}
				/>,
			),
		);
		act(() => container.querySelector<HTMLButtonElement>("button[aria-label=selectRealtimeVoice]")!.click());

		const options = [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
		expect(options.map((option) => [option.textContent, option.getAttribute("aria-pressed")])).toEqual([
			["Alloy", "false"],
			["Verse", "true"],
		]);
		expect(document.querySelector("button[aria-selected]")).toBeNull();
	});
});

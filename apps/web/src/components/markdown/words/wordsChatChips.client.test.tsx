// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppIntlProvider } from "@/i18n/react";
import { englishCommonMessages } from "@/i18n/default-messages";
import { ChatAnswerMarkdown } from "@/components/(chat)/openui/ChatAnswerContent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

async function mount(text: string, isStreaming = false) {
	container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const draw = (value: string, streaming: boolean) => root.render(
		<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: englishCommonMessages }}>
			<ChatAnswerMarkdown engine="words" content={value} isStreaming={streaming} />
		</AppIntlProvider>,
	);
	await act(async () => { draw(text, isStreaming); });
	// Words loads lazily (Streamdown shows meanwhile); wait until its root is in place.
	for (let tries = 0; tries < 200 && !container.querySelector('[data-markdown="root"]'); tries++) {
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
	}
	expect(container.querySelector('[data-markdown="root"]')).not.toBeNull();
	// Words patches the DOM after render; portals mount on the next effect pass.
	await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
	return { container, update: async (value: string, streaming: boolean) => { await act(async () => { draw(value, streaming); }); await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); }); } };
}

/** Chip placeholders that hold a mounted chip, not an empty span. */
const filledChips = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>("span[data-chip]")].filter(node => node.textContent?.trim());

describe("chips in answers drawn by Words (client)", () => {
	it("mounts a real chip into every placeholder", async () => {
		const { container } = await mount("Edit apps/web/src/index.ts on feat/web-chips at a1b2c3d, see https://phaseo.app/docs.");
		const placeholders = container.querySelectorAll("span[data-chip]");
		expect(placeholders.length).toBe(4);
		expect(filledChips(container)).toHaveLength(4);
		expect(container.textContent).toContain("index.ts");
	});

	it("keeps chips through streaming updates and inside <details>", async () => {
		const { container, update } = await mount("Edit apps/web/src/index.ts", true);
		expect(filledChips(container)).toHaveLength(1);
		await update("Edit apps/web/src/index.ts and then\n\n<details>\n<summary>More</summary>\n\nSee feat/web-chips\n\n</details>", false);
		expect(filledChips(container)).toHaveLength(2);
		expect(container.querySelector("details span[data-chip]")?.textContent?.trim()).toBeTruthy();
	});
});

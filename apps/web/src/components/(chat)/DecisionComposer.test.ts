import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { englishSettingsUiMessages } from "@/i18n/default-messages";
import { nestDottedMessageKeys } from "@/i18n/message-overlays";
import {
	DecisionComposer,
	createDefaultDecisionDraft,
	serializeDecisionDraft,
	serializeDecisionDraftForModel,
	validateDecisionDraft,
} from "./DecisionComposer";

function renderToStaticMarkup(children: ReactNode) {
	const providerProps = { locale: "en-GB" as const, timeZone: "UTC", messages: { SettingsUI: nestDottedMessageKeys(englishSettingsUiMessages) }, children };
	return renderMarkup(createElement(NextIntlClientProvider, providerProps));
}

describe("DecisionComposer draft helpers", () => {
	it("preserves Tev's legacy label-only contract", () => {
		const draft = createDefaultDecisionDraft("choice");
		draft.prompt = "Choose a department";
		draft.choices = [{ id: "a", value: "Billing" }, { id: "b", value: "Other" }];
		expect(serializeDecisionDraftForModel(draft, "together/tev1-4b-experimental")).toEqual({
			state: { input: "Choose a department" },
			questions: { decision: { type: "choice", instructions: "Choose a department", criteria: { billing: "Billing", other: "Other" } } },
		});
	});
	it("starts score mode with one empty level numbered from zero", () => {
		const draft = createDefaultDecisionDraft("score");

		expect(draft.mode).toBe("score");
		expect(draft.scoreLevels).toHaveLength(1);
		expect(draft.scoreLevels[0]?.value).toBe("");
	});

	it("creates fresh empty answers when resetting choice mode", () => {
		const first = createDefaultDecisionDraft("choice");
		first.choices[0]!.value = "Keep me";

		const reset = createDefaultDecisionDraft(first.mode);

		expect(reset.choices.map((choice) => choice.value)).toEqual(["", ""]);
		expect(reset.choices[0]?.id).not.toBe(first.choices[0]?.id);
	});

	it("serializes score labels without repeating their numeric indexes", () => {
		const draft = createDefaultDecisionDraft("score");
		draft.prompt = "How strong is the evidence?";
		draft.scoreLevels = [
			{ id: "score-0", value: "No evidence" },
			{ id: "score-1", value: "Early signal" },
		];

		expect(validateDecisionDraft(draft)).toBeNull();
		expect(serializeDecisionDraft(draft).questions).toEqual([
			{
				type: "score",
				name: "decision",
				instructions: "How strong is the evidence?",
				levels: [{ label: "No evidence" }, { label: "Early signal" }],
			},
		]);
	});

	it("keeps long decision questions vertically scrollable", () => {
		const html = renderToStaticMarkup(
			createElement(DecisionComposer, {
				draft: createDefaultDecisionDraft(),
				error: null,
				historyLoaded: true,
				isSubmitting: false,
				onDraftChange: () => undefined,
				onSubmit: () => undefined,
			}),
		);

		expect(html).toContain("overflow-y-auto");
		expect(html).not.toContain("overflow-hidden");
	});

	it("bounds long answer lists inside their scrollable viewport", () => {
		for (const mode of ["choice", "score"] as const) {
			const draft = createDefaultDecisionDraft(mode);
			draft.prompt = "A decision with many options";
			if (mode === "choice") {
				draft.choices = Array.from({ length: 10 }, (_, index) => ({
					id: "choice-" + index,
					value: "Answer " + (index + 1),
				}));
			} else {
				draft.scoreLevels = Array.from({ length: 10 }, (_, index) => ({
					id: "score-" + index,
					value: "Level " + index,
				}));
			}

			const html = renderToStaticMarkup(
				createElement(DecisionComposer, {
					draft,
					error: null,
					historyLoaded: true,
					isSubmitting: false,
					onDraftChange: () => undefined,
					onSubmit: () => undefined,
				}),
			);

			expect(html).toContain('class="relative overflow-hidden max-h-36"');
			expect(html).toContain("max-h-36 pr-2");
		}
	});

	it("disables sending until chat history has loaded", () => {
		const draft = createDefaultDecisionDraft();
		draft.prompt = "A ready-to-send question";
		const html = renderToStaticMarkup(
			createElement(DecisionComposer, {
				draft,
				error: null,
				historyLoaded: false,
				isSubmitting: false,
				onDraftChange: () => undefined,
				onSubmit: () => undefined,
			}),
		);

		expect(html).toContain('aria-label="Send decision"');
		expect(html).toContain("disabled");
	});
});

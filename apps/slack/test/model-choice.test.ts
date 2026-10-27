import { describe, expect, it } from "vitest";
import { allowedModels, chooseModel, modelChoiceOn, modelNames, modelRefusalText, namesModel, withoutMention, type AllowedModel } from "../src/model-choice";
import { FakeDb } from "./fakes";

const LUNA: AllowedModel = { id: "openai/gpt-6-luna", name: "GPT-6 Luna" };
const TERRA: AllowedModel = { id: "openai/gpt-6.1-terra", name: "GPT-6.1 Terra" };
const OPUS: AllowedModel = { id: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5" };
const NOVA: AllowedModel = { id: "amazon/nova-pro-v1", name: "Amazon: Nova Pro 1.0" };
const AUTO: AllowedModel = { id: "phaseo/auto", name: "Auto" };
const ALLOWED = [LUNA, TERRA, OPUS, NOVA, AUTO];

describe("choosing a model per message", () => {
	it("chooses by id or catalogue name, ignoring case and spaces, and strips the prefix", () => {
		expect(chooseModel("with openai/gpt-6-luna: summarise this", ALLOWED)).toEqual({ kind: "chosen", model: LUNA, prompt: "summarise this" });
		expect(chooseModel("With  gpt-6  LUNA :  summarise this", ALLOWED)).toEqual({ kind: "chosen", model: LUNA, prompt: "summarise this" });
		expect(chooseModel("WITH auto: which model?", ALLOWED)).toEqual({ kind: "chosen", model: AUTO, prompt: "which model?" });
		// The prompt keeps its own colons and lines.
		expect(chooseModel("with Claude Opus 5.5: plan:\n1. a\n2. b", ALLOWED)).toEqual({ kind: "chosen", model: OPUS, prompt: "plan:\n1. a\n2. b" });
	});

	it("chooses by the start of an id or name when only one allowed model has it", () => {
		expect(chooseModel("with claude: hi", ALLOWED)).toEqual({ kind: "chosen", model: OPUS, prompt: "hi" });
		expect(chooseModel("with anthropic/: hi", ALLOWED)).toEqual({ kind: "chosen", model: OPUS, prompt: "hi" });
		expect(chooseModel("with gpt-6.1: hi", ALLOWED)).toEqual({ kind: "chosen", model: TERRA, prompt: "hi" });
	});

	it("prefers an exact name over a longer one it starts", () => {
		const six = { id: "openai/gpt-6", name: "GPT-6" };
		expect(chooseModel("with gpt-6: hi", [LUNA, six])).toEqual({ kind: "chosen", model: six, prompt: "hi" });
	});

	it("reads catalogue names that hold a colon", () => {
		expect(chooseModel("with Amazon: Nova Pro 1.0: what's new?", ALLOWED)).toEqual({ kind: "chosen", model: NOVA, prompt: "what's new?" });
		expect(chooseModel("with amazon: nova: hi", ALLOWED)).toEqual({ kind: "chosen", model: NOVA, prompt: "hi" });
		// The start of a name, then a prompt with a colon of its own.
		expect(chooseModel("with amazon: is this right: 2 + 2 = 4?", ALLOWED)).toEqual({ kind: "chosen", model: NOVA, prompt: "is this right: 2 + 2 = 4?" });
	});

	it("reads names through Slack's formatting and links", () => {
		expect(chooseModel("with *GPT-6 Luna*: hi", ALLOWED)).toEqual({ kind: "chosen", model: LUNA, prompt: "hi" });
		expect(chooseModel("with `openai/gpt-6-luna`: hi", ALLOWED)).toEqual({ kind: "chosen", model: LUNA, prompt: "hi" });
		expect(chooseModel("with <http://openai/gpt-6-luna|openai/gpt-6-luna>: hi", ALLOWED)).toEqual({ kind: "chosen", model: LUNA, prompt: "hi" });
	});

	it("refuses a name that fits more than one allowed model, listing those", () => {
		expect(chooseModel("with gpt: hi", ALLOWED)).toEqual({ kind: "ambiguous", named: "gpt", matches: [LUNA, TERRA] });
		expect(chooseModel("with openai/: hi", ALLOWED)).toEqual({ kind: "ambiguous", named: "openai/", matches: [LUNA, TERRA] });
	});

	it("only matches the allowlist", () => {
		expect(chooseModel("with gemini: hi", ALLOWED)).toEqual({ kind: "not_allowed", named: "gemini" });
		expect(chooseModel("with openai/gpt-6-luna: hi", [OPUS])).toEqual({ kind: "not_allowed", named: "openai/gpt-6-luna" });
		// What was named is the text before the first colon.
		expect(chooseModel("With regards to the invoice: is it paid?", ALLOWED)).toEqual({ kind: "not_allowed", named: "regards to the invoice" });
	});

	it("leaves other messages alone", () => {
		for (const text of ["what did we spend?", "with: hi", "with :hi", "without luna: hi", "with\nluna", "with luna and no colon", `with ${"x".repeat(120)}: hi`, "with luna\n: hi", "with  : hi"]) {
			expect(chooseModel(text, ALLOWED), text).toEqual({ kind: "none" });
			expect(namesModel(text), text).toBe(false);
		}
		expect(namesModel("with gpt: hi")).toBe(true);
	});

	it("is on only when switched on with at least one model", () => {
		expect(modelChoiceOn({ model_choice_enabled: true, allowed_models: ["openai/gpt-6-luna"] })).toBe(true);
		expect(modelChoiceOn({ model_choice_enabled: true, allowed_models: [] })).toBe(false);
		expect(modelChoiceOn({ model_choice_enabled: false, allowed_models: ["openai/gpt-6-luna"] })).toBe(false);
	});

	it("drops the agent's own mention, wherever it is", () => {
		expect(withoutMention("<@U0BOT00001> with gpt: hi <@U0BOT00001>", "U0BOT00001")).toBe("with gpt: hi");
		expect(withoutMention("<@U0OTHER001> hi", "U0BOT00001")).toBe("<@U0OTHER001> hi");
	});
});

describe("the allowed models' names", () => {
	it("reads the catalogue once, names Auto, and keeps the id of a model it can't name", async () => {
		const db = new FakeDb();
		db.tables.v2_models.push({ model_slug: "openai/gpt-6-luna", name: "GPT-6 Luna" }, { model_slug: "anthropic/claude-opus-5-5", name: " " });
		const names = await modelNames(db, ["openai/gpt-6-luna", "phaseo/auto", "anthropic/claude-opus-5-5", "acme/gone", "openai/gpt-6-luna"]);
		expect(Object.fromEntries(names)).toEqual({
			"openai/gpt-6-luna": "GPT-6 Luna",
			"phaseo/auto": "Auto",
			"anthropic/claude-opus-5-5": "anthropic/claude-opus-5-5",
			"acme/gone": "acme/gone",
		});
		expect(db.queries).toEqual([{ table: "v2_models", query: { select: "model_slug,name", model_slug: 'in.("openai/gpt-6-luna","anthropic/claude-opus-5-5","acme/gone")' } }]);
		expect(allowedModels({ allowed_models: ["phaseo/auto", "openai/gpt-6-luna", "phaseo/auto"] }, names)).toEqual([AUTO, LUNA]);
	});

	it("uses ids when the catalogue can't be read, and doesn't read it for Auto alone", async () => {
		const db = new FakeDb();
		db.select = async () => { throw new Error("db_error_503"); };
		expect(Object.fromEntries(await modelNames(db, ["openai/gpt-6-luna", "phaseo/auto"]))).toEqual({ "openai/gpt-6-luna": "openai/gpt-6-luna", "phaseo/auto": "Auto" });
		const unread = new FakeDb();
		await modelNames(unread, ["phaseo/auto"]);
		expect(unread.queries).toEqual([]);
	});
});

describe("the private reply when a model can't be used", () => {
	it("lists the allowed models and what happens without one", () => {
		// The name as Slack sends it, with & and < escaped already: they aren't escaped twice.
		expect(modelRefusalText({ kind: "not_allowed", named: "gemini &lt;3 &amp; co" }, [LUNA, AUTO, { id: "acme/x", name: "acme/x" }], "GPT-6 Luna")).toBe([
			"“gemini &lt;3 &amp; co” isn't one of the models you can choose here, so I didn't answer.",
			"",
			"Start your message with `with &lt;model&gt;:` and one of these, for example `with GPT-6 Luna: …`:",
			"• GPT-6 Luna (`openai/gpt-6-luna`)",
			"• Auto (`phaseo/auto`)",
			"• `acme/x`",
			"",
			"Without `with …:`, I answer with GPT-6 Luna.",
		].join("\n"));
	});

	it("names the models an ambiguous name fits", () => {
		expect(modelRefusalText({ kind: "ambiguous", named: "gpt", matches: [LUNA, TERRA] }, [LUNA, TERRA], "Auto").split("\n")[0])
			.toBe("“gpt” could be more than one of the models you can choose (GPT-6 Luna, GPT-6.1 Terra), so I didn't answer. Name one of them.");
	});
});

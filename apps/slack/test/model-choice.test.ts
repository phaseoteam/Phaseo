import { describe, expect, it } from "vitest";
import {
	allowedModels, chooseComparison, chooseModel, comparisonRefusalText, decideComparison, modelChoiceOn, modelNames, modelRefusalText, namesCatalogueModel, namesComparison, namesModel, namesOtherModel,
	withoutMention, type AllowedModel,
} from "../src/model-choice";
import { FakeDb } from "./fakes";

const LUNA: AllowedModel = { id: "openai/gpt-6-luna", name: "GPT-6 Luna" };
const TERRA: AllowedModel = { id: "openai/gpt-6.1-terra", name: "GPT-6.1 Terra" };
const OPUS: AllowedModel = { id: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5" };
const NOVA: AllowedModel = { id: "amazon/nova-pro-v1", name: "Amazon: Nova Pro 1.0" };
const AUTO: AllowedModel = { id: "phaseo/auto", name: "Auto" };
const ALLOWED = [LUNA, TERRA, OPUS, NOVA, AUTO];

describe("choosing a model per message", () => {
	it("chooses by id or catalogue name, ignoring case and spaces, and strips the prefix", () => {
		expect(chooseModel("with openai/gpt-6-luna: summarise this", ALLOWED)).toMatchObject({ kind: "chosen", model: LUNA, prompt: "summarise this" });
		expect(chooseModel("With  gpt-6  LUNA :  summarise this", ALLOWED)).toMatchObject({ kind: "chosen", model: LUNA, prompt: "summarise this" });
		expect(chooseModel("WITH auto: which model?", ALLOWED)).toMatchObject({ kind: "chosen", model: AUTO, prompt: "which model?" });
		// The prompt keeps its own colons and lines.
		expect(chooseModel("with Claude Opus 5.5: plan:\n1. a\n2. b", ALLOWED)).toMatchObject({ kind: "chosen", model: OPUS, prompt: "plan:\n1. a\n2. b" });
	});

	it("chooses by the start of an id or name when only one allowed model has it", () => {
		expect(chooseModel("with claude: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: OPUS, prompt: "hi" });
		expect(chooseModel("with anthropic/: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: OPUS, prompt: "hi" });
		expect(chooseModel("with gpt-6.1: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: TERRA, prompt: "hi" });
	});

	it("matches an id without its lab", () => {
		expect(chooseModel("with gpt-6-luna: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: LUNA, prompt: "hi" });
		expect(chooseModel("with claude-opus: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: OPUS, prompt: "hi" });
	});

	it("prefers an exact name over a longer one it starts", () => {
		const six = { id: "openai/gpt-6", name: "GPT-6" };
		expect(chooseModel("with gpt-6: hi", [LUNA, six])).toMatchObject({ kind: "chosen", model: six, prompt: "hi" });
	});

	it("reads catalogue names that hold a colon", () => {
		expect(chooseModel("with Amazon: Nova Pro 1.0: what's new?", ALLOWED)).toMatchObject({ kind: "chosen", model: NOVA, prompt: "what's new?" });
		expect(chooseModel("with amazon: nova: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: NOVA, prompt: "hi" });
		// The start of a name, then a prompt with a colon of its own.
		expect(chooseModel("with amazon: is this right: 2 + 2 = 4?", ALLOWED)).toMatchObject({ kind: "chosen", model: NOVA, prompt: "is this right: 2 + 2 = 4?" });
	});

	it("reads names through Slack's formatting and links", () => {
		expect(chooseModel("with *GPT-6 Luna*: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: LUNA, prompt: "hi" });
		expect(chooseModel("with `openai/gpt-6-luna`: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: LUNA, prompt: "hi" });
		expect(chooseModel("with <http://openai/gpt-6-luna|openai/gpt-6-luna>: hi", ALLOWED)).toMatchObject({ kind: "chosen", model: LUNA, prompt: "hi" });
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

describe("whether text names a catalogue model", () => {
	const catalogue = () => {
		const db = new FakeDb();
		db.tables.v2_models.push(
			{ model_slug: "openai/gpt-6-luna", name: "GPT-6 Luna", hidden: false },
			{ model_slug: "amazon/nova-pro-v1", name: "Amazon: Nova Pro 1.0", hidden: false },
			{ model_slug: "amazon/nova-lite-v1", name: "Amazon: Nova Lite 1.0", hidden: false },
			{ model_slug: "z-ai/glm-4.7-flash:free", name: "GLM 4.7 Flash (Free)", hidden: false },
			{ model_slug: "z-ai/glm-4.7-flash", name: "GLM 4.7 Flash", hidden: false },
			{ model_slug: "acme/secret-model", name: "Secret Model", hidden: true },
		);
		return db;
	};

	it("finds visible ids, ids without their lab, and names, or the start of one", async () => {
		const db = catalogue();
		await expect(namesCatalogueModel(db, " *GPT-6  Luna* ")).resolves.toBe(true);
		await expect(namesCatalogueModel(db, "gpt-6-lu")).resolves.toBe(true);
		await expect(namesCatalogueModel(db, "GLM 4.7 Flash (Free)")).resolves.toBe(true);
		await expect(namesCatalogueModel(db, "regards to the invoice")).resolves.toBe(false);
		await expect(namesCatalogueModel(db, "regards, to (the) invoice")).resolves.toBe(false);
		// Hidden models aren't names, and LIKE's own wildcards are taken literally.
		await expect(namesCatalogueModel(db, "secret model")).resolves.toBe(false);
		await expect(namesCatalogueModel(db, "%")).resolves.toBe(false);
		await expect(namesCatalogueModel(db, "gpt_6")).resolves.toBe(false);
	});

	it("assumes a match when the catalogue can't be read", async () => {
		const db = catalogue();
		db.select = async () => { throw new Error("db_error_503"); };
		await expect(namesCatalogueModel(db, "gpt-6 luna")).resolves.toBe(true);
	});

	it("finds a longer reading that names another model exactly, so the shorter match is refused", async () => {
		const db = catalogue();
		const allowed = [NOVA];
		const lite = chooseModel("with Amazon: Nova Lite 1.0: summarise this", allowed);
		expect(lite).toMatchObject({ kind: "chosen", model: NOVA, longer: ["Amazon: Nova Lite 1.0"], exact: false });
		await expect(namesOtherModel(db, ["Amazon: Nova Lite 1.0"], NOVA.id, false)).resolves.toBe("Amazon: Nova Lite 1.0");
		// The start of the other model's name is enough.
		const short = chooseModel("with Amazon: Nova Lite: hi", allowed);
		expect(short).toMatchObject({ kind: "chosen", model: NOVA, longer: ["Amazon: Nova Lite"], exact: false });
		await expect(namesOtherModel(db, ["Amazon: Nova Lite"], NOVA.id, false)).resolves.toBe("Amazon: Nova Lite");

		const flash = { id: "z-ai/glm-4.7-flash", name: "GLM 4.7 Flash" };
		const free = chooseModel("with z-ai/glm-4.7-flash:free: hello", [flash]);
		expect(free).toMatchObject({ kind: "chosen", model: flash, longer: ["z-ai/glm-4.7-flash:free"], exact: true });
		await expect(namesOtherModel(db, ["z-ai/glm-4.7-flash:free"], flash.id, true)).resolves.toBe("z-ai/glm-4.7-flash:free");

		// A colon in the prompt names no model: the choice stands.
		const plan = chooseModel("with Claude Opus 5.5: plan: 1. a", ALLOWED);
		expect(plan).toMatchObject({ kind: "chosen", model: OPUS, longer: ["Claude Opus 5.5: plan"], exact: true });
		await expect(namesOtherModel(db, ["Claude Opus 5.5: plan"], OPUS.id, true)).resolves.toBeNull();
		// A message with many colons checks only the shortest few longer readings, together.
		const queries: string[] = [];
		const select = db.select.bind(db);
		db.select = async <T,>(table: string, query: Record<string, string>) => { queries.push(JSON.stringify(query)); return select<T>(table, query); };
		const colons = chooseModel(`with claude opus:${" a:".repeat(40)} hi`, ALLOWED);
		expect(colons).toMatchObject({ kind: "chosen", model: OPUS });
		await expect(namesOtherModel(db, colons.kind === "chosen" ? colons.longer : [], OPUS.id, false)).resolves.toBeNull();
		expect(queries).toHaveLength(15);
		db.select = select;
		// The full name of the chosen model itself is no other model.
		await expect(namesOtherModel(db, ["Amazon: Nova Pro 1.0"], NOVA.id, false)).resolves.toBeNull();
		// Unreadable catalogue: a choice by the start of a name is refused, a whole name stands.
		db.select = async () => { throw new Error("db_error_503"); };
		await expect(namesOtherModel(db, ["Amazon: Nova Lite 1.0"], NOVA.id, false)).resolves.toBe("Amazon: Nova Lite 1.0");
		await expect(namesOtherModel(db, ["Claude Opus 5.5: plan"], OPUS.id, true)).resolves.toBeNull();
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

describe("comparing models", () => {
	it("reads 2 or 3 allowed models by id or name, ignoring case, spaces and Slack's formatting, and strips the list", () => {
		expect(chooseComparison("compare GPT-6 Luna, claude opus 5.5: which is faster?", ALLOWED)).toMatchObject({ kind: "chosen", models: [LUNA, OPUS], prompt: "which is faster?" });
		expect(chooseComparison("Compare  openai/gpt-6-luna ,*gpt-6.1-terra*, auto :  summarise: a, b", ALLOWED)).toMatchObject({ kind: "chosen", models: [LUNA, TERRA, AUTO], prompt: "summarise: a, b" });
		// The start of a name, when only one allowed model has it; a name that holds a colon.
		expect(chooseComparison("compare claude, amazon: nova pro 1.0: hi", ALLOWED)).toMatchObject({ kind: "chosen", models: [OPUS, NOVA], prompt: "hi", exact: true });
		expect(chooseComparison("compare claude, amazon: is this right: 2 + 2 = 4?", ALLOWED)).toMatchObject({ kind: "chosen", models: [OPUS, NOVA], prompt: "is this right: 2 + 2 = 4?", exact: false });
		// Empty names between commas are skipped.
		expect(chooseComparison("compare gpt-6 luna,, claude opus 5.5,: hi", ALLOWED)).toMatchObject({ kind: "chosen", models: [LUNA, OPUS] });
		expect(namesComparison("compare a, b: hi")).toBe(true);
	});

	it("keeps the longer readings of the last name, for the catalogue check `with` gets", () => {
		expect(chooseComparison("compare gpt-6 luna, Amazon: Nova Lite: hi", [LUNA, NOVA])).toMatchObject({ kind: "chosen", models: [LUNA, NOVA], longer: ["Amazon: Nova Lite"], exact: false });
	});

	it("refuses an ambiguous name, a model that isn't allowed, one model, more than three, the same model twice, and no question", () => {
		expect(chooseComparison("compare gpt, claude: hi", ALLOWED)).toEqual({ kind: "ambiguous", named: "gpt", matches: [LUNA, TERRA] });
		expect(chooseComparison("compare gemini, claude: hi", ALLOWED)).toEqual({ kind: "not_allowed", named: "gemini", unmatched: ["gemini"], listed: true });
		expect(chooseComparison("compare claude opus 5.5: hi", ALLOWED)).toEqual({ kind: "count" });
		expect(chooseComparison("compare gpt-6 luna, gpt-6.1 terra, claude, auto: hi", ALLOWED)).toEqual({ kind: "count" });
		expect(chooseComparison("compare claude, anthropic/claude-opus-5-5: hi", ALLOWED)).toEqual({ kind: "count" });
		expect(chooseComparison("compare gpt-6 luna, claude:", ALLOWED)).toEqual({ kind: "no_question" });
		// Nothing allowed in the list: events.ts asks the catalogue whether any of these names a model.
		expect(chooseComparison("Compare the two plans, then pick one: which is cheaper?", ALLOWED)).toEqual({ kind: "not_allowed", named: "the two plans", unmatched: ["the two plans", "then pick one"], listed: false });
	});

	it("leaves other messages alone", () => {
		for (const text of ["compare these", "compare: a, b", "comparing gpt, claude: hi", "compare gpt\n, claude: hi", `compare ${"x, ".repeat(120)}: hi`, "compare ,: hi"]) {
			expect(chooseComparison(text, ALLOWED), text).toEqual({ kind: "none" });
		}
		expect(namesComparison("with claude: hi")).toBe(false);
	});

	it("decides with the catalogue: ordinary text, a longer name that isn't allowed, and a catalogue model that isn't allowed", async () => {
		const db = new FakeDb();
		db.tables.v2_models.push(
			{ model_slug: "openai/gpt-6-luna", name: "GPT-6 Luna", hidden: false },
			{ model_slug: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", hidden: false },
			{ model_slug: "amazon/nova-pro-v1", name: "Amazon: Nova Pro 1.0", hidden: false },
			{ model_slug: "amazon/nova-lite-v1", name: "Amazon: Nova Lite 1.0", hidden: false },
			{ model_slug: "google/gemini-3-pro", name: "Gemini 3 Pro", hidden: false },
		);
		const installation = { allowed_models: [LUNA.id, OPUS.id, NOVA.id] };
		await expect(decideComparison(db, installation, "compare gpt-6 luna, claude: which is faster?")).resolves.toEqual({ kind: "chosen", models: [LUNA.id, OPUS.id], prompt: "which is faster?" });
		await expect(decideComparison(db, installation, "Compare the two plans, then pick one: which?")).resolves.toEqual({ kind: "none" });
		const gemini = await decideComparison(db, installation, "compare our notes, gemini 3: which?");
		expect(gemini).toMatchObject({ kind: "refused", reason: "not_allowed" });
		expect(gemini.kind === "refused" && gemini.text.split("\n")[0]).toBe("“gemini 3” isn't one of the models you can choose here, so I didn't compare them.");
		const lite = await decideComparison(db, installation, "compare claude, Amazon: Nova Lite: hi");
		expect(lite.kind === "refused" && lite.text.split("\n")[0]).toBe("“Amazon: Nova Lite” isn't one of the models you can choose here, so I didn't compare them.");
	});

	it("explains a refused Compare and lists the models", () => {
		expect(comparisonRefusalText({ kind: "count" }, [LUNA, OPUS, { id: "acme/x", name: "acme/x" }])).toBe([
			"Name 2 or 3 different models to compare, separated by commas, so I didn't answer.",
			"",
			"Start your message with `compare &lt;model&gt;, &lt;model&gt;:` and 2 or 3 of these, for example `compare GPT-6 Luna, Claude Opus 5.5: …`:",
			"• GPT-6 Luna (`openai/gpt-6-luna`)",
			"• Claude Opus 5.5 (`anthropic/claude-opus-5-5`)",
			"• `acme/x`",
		].join("\n"));
		expect(comparisonRefusalText({ kind: "ambiguous", named: "gpt", matches: [LUNA, TERRA] }, [LUNA, TERRA]).split("\n")[0])
			.toBe("“gpt” could be more than one of the models you can choose (GPT-6 Luna, GPT-6.1 Terra), so I didn't compare them. Name one of them.");
		expect(comparisonRefusalText({ kind: "no_question" }, [LUNA]).split("\n").slice(0, 3)).toEqual([
			"Add your question after the colon, so I didn't answer.",
			"",
			"Start your message with `compare &lt;model&gt;, &lt;model&gt;:` and 2 or 3 of these, for example `compare &lt;model&gt;, &lt;model&gt;: …`:",
		]);
	});
});

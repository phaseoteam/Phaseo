import { describe, expect, it } from "vitest";
import {
	MODEL_LINK_KINDS,
	dedupeModelLinksByUrl,
	detectModelLinkKind,
	normaliseModelLinkKind,
	suggestModelLinkTitle,
} from "./modelLinks";
import {
	applyModelLinkUrl,
	createEmptyModelLinkDraft,
	modelLinkDraftsFromRows,
	modelLinkPayloadFromDrafts,
} from "@/components/(data)/model/edit/ModelLinksEditor";

describe("detectModelLinkKind", () => {
	it.each([
		["https://huggingface.co/thinkingmachines/Inkling-2-Small", "weights"],
		["https://huggingface.co/spaces/lab/demo", "playground"],
		["https://github.com/lab/model", "repository"],
		["https://arxiv.org/abs/2601.00001", "paper"],
		["https://thinkingmachines.ai/model-card/inkling-2-small/", "model_card"],
		["https://thinkingmachines.ai/news/inkling-2-small/", "announcement"],
		["https://docs.example.com/models/x", "documentation"],
		["https://example.com/pricing", "pricing"],
		["https://example.com/", "website"],
		["not a url", "website"],
	])("%s is %s", (url, kind) => {
		expect(detectModelLinkKind(url)).toBe(kind);
	});
});

describe("normaliseModelLinkKind", () => {
	it("keeps kinds from the list", () => {
		for (const kind of MODEL_LINK_KINDS) expect(normaliseModelLinkKind(kind)).toBe(kind);
	});

	it("maps older kind names the way the migration does", () => {
		expect(normaliseModelLinkKind("official_website")).toBe("website");
		expect(normaliseModelLinkKind("hugging_face")).toBe("weights");
		expect(normaliseModelLinkKind("Release Notes")).toBe("announcement");
		expect(normaliseModelLinkKind("model", "https://huggingface.co/a/b")).toBe("weights");
		expect(normaliseModelLinkKind("model", "https://router.example/a/b")).toBe("provider");
		expect(normaliseModelLinkKind("source", "https://github.com/a/b")).toBe("repository");
	});

	it("falls back to the kind detected from the URL", () => {
		expect(normaliseModelLinkKind("mystery", "https://github.com/a/b")).toBe("repository");
		expect(normaliseModelLinkKind(undefined, "https://example.com")).toBe("website");
	});
});

describe("suggestModelLinkTitle", () => {
	it("names repositories after the repo, keeping its capitalisation", () => {
		expect(suggestModelLinkTitle("https://huggingface.co/thinkingmachines/Inkling-2-Small-MXFP8", "weights"))
			.toBe("Inkling-2-Small-MXFP8 on Hugging Face");
		expect(suggestModelLinkTitle("https://github.com/lab/Model", "repository")).toBe("Model on GitHub");
		expect(suggestModelLinkTitle("https://huggingface.co/spaces/lab/Demo", "playground")).toBe("Demo on Hugging Face");
	});

	it("uses the kind name otherwise", () => {
		expect(suggestModelLinkTitle("https://example.com/news/x", "announcement")).toBe("Announcement");
	});
});

describe("dedupeModelLinksByUrl", () => {
	it("keeps the first link for each URL, ignoring case and trailing slashes", () => {
		const links = [
			{ kind: "weights", url: "https://huggingface.co/Qwen/QwQ-32B" },
			{ kind: "api_reference", url: "https://huggingface.co/qwen/qwq-32b/" },
			{ kind: "paper", url: "https://arxiv.org/abs/1" },
		];
		expect(dedupeModelLinksByUrl(links).map((link) => link.kind)).toEqual(["weights", "paper"]);
	});
});

describe("model link editor rows", () => {
	it("loads stored rows in order and saves them back unchanged", () => {
		const rows = [
			{ link_kind: "weights", title: "Weights (NVFP4)", url: "https://huggingface.co/a/b" },
			{ link_kind: "announcement", title: "Launch post", url: "https://lab.example/news/b" },
			{ link_kind: "weights", title: "", url: " " },
		];
		expect(modelLinkPayloadFromDrafts(modelLinkDraftsFromRows(rows))).toEqual([
			{ kind: "weights", platform: "weights", title: "Weights (NVFP4)", url: "https://huggingface.co/a/b" },
			{ kind: "announcement", platform: "announcement", title: "Launch post", url: "https://lab.example/news/b" },
		]);
	});

	it("fills kind and title from a pasted URL until they are edited", () => {
		const pasted = applyModelLinkUrl(createEmptyModelLinkDraft(), "https://huggingface.co/lab/Model");
		expect(pasted).toMatchObject({ kind: "weights", title: "Model on Hugging Face" });

		const renamed = { ...pasted, title: "Weights", titleEdited: true, kind: "repository" as const, kindEdited: true };
		expect(applyModelLinkUrl(renamed, "https://huggingface.co/lab/Other")).toMatchObject({
			kind: "repository",
			title: "Weights",
			url: "https://huggingface.co/lab/Other",
		});
	});

	it("gives a link without a title its kind's name when saved", () => {
		const draft = { ...createEmptyModelLinkDraft(), kind: "paper" as const, url: "https://arxiv.org/abs/1", title: " " };
		expect(modelLinkPayloadFromDrafts([draft])[0]?.title).toBe("Paper");
	});
});

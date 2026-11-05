import { expect, it } from "vitest";
import { fencedBlock } from "./composerCodeBlock";

it("fences the selection, with a longer fence around code that has one", () => {
	expect(fencedBlock("const a = 1;", "ts")).toBe("```ts\nconst a = 1;\n```");
	expect(fencedBlock("")).toBe("```\n\n```");
	expect(fencedBlock("```js\nx\n```", "markdown")).toBe("````markdown\n```js\nx\n```\n````");
});

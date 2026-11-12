import { describe, expect, it } from "vitest";
import { editorChoices } from "./PaletteExtras";

describe("open project in an editor", () => {
	it("lists installed editors with the favourite first", () => {
		const editors = [{ id: "vscode", name: "VS Code", available: true }, { id: "zed", name: "Zed", available: false }, { id: "cursor", name: "Cursor", available: true }] as const;
		expect(editorChoices(editors, "cursor").map(editor => editor.id)).toEqual(["cursor", "vscode"]);
		expect(editorChoices(editors, null).map(editor => editor.id)).toEqual(["vscode", "cursor"]);
	});
});

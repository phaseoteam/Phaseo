import fs from "node:fs";
import path from "node:path";

const componentsRoot = path.join(process.cwd(), "src", "components");
const uiRoot = path.join(componentsRoot, "ui") + path.sep;

function listComponentFiles(directory: string): string[] {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) return listComponentFiles(entryPath);
		return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
	});
}

const applicationComponentFiles = listComponentFiles(componentsRoot).filter(
	(filePath) => !filePath.startsWith(uiRoot),
);

describe("Base UI dropdown migration", () => {
	it("does not use the Radix onSelect event on Base UI menu items", () => {
		const offenders = applicationComponentFiles.filter((filePath) => {
			const source = fs.readFileSync(filePath, "utf8");
			return /<DropdownMenu(?:Checkbox|Radio)?Item\b[^>]*\bonSelect=/.test(
				source,
			);
		});

		expect(offenders).toEqual([]);
	});

	it("does not use Radix dropdown CSS variables at application call sites", () => {
		const offenders = applicationComponentFiles.filter((filePath) =>
			/--radix-[a-z-]*dropdown/.test(fs.readFileSync(filePath, "utf8")),
		);

		expect(offenders).toEqual([]);
	});

	it("keeps header navigation free of manual view-transition routing", () => {
		const headerSource = fs.readFileSync(
			path.join(componentsRoot, "header", "TeamSwitcher.tsx"),
			"utf8",
		);

		expect(headerSource).not.toMatch(
			/startViewTransition|navigateWithViewTransition/,
		);
		expect(headerSource).toMatch(/href="\/internal"/);
		expect(headerSource).toMatch(/href="\/contact"/);
	});
});

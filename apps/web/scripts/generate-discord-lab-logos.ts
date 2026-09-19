import { chromium } from "@playwright/test";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLogo } from "../src/lib/logos";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(appDirectory, "../..");
const publicDirectory = join(appDirectory, "public");
const modelDirectory = join(
	repositoryDirectory,
	"packages/data/catalog/src/data/models",
);
const outputDirectory = join(publicDirectory, "logos/discord");

const mimeTypes: Record<string, string> = {
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

function sourcePathForLogo(source: string): string {
	if (!source.startsWith("/") || source.startsWith("//")) {
		throw new Error(`Expected a local logo asset, got: ${source}`);
	}

	const sourcePath = resolve(publicDirectory, source.slice(1));
	const relativeSourcePath = relative(publicDirectory, sourcePath);
	if (
		relativeSourcePath === ".." ||
		relativeSourcePath.startsWith(`..${sep}`) ||
		isAbsolute(relativeSourcePath)
	) {
		throw new Error(`Logo source resolves outside the public directory: ${source}`);
	}

	return sourcePath;
}

async function main() {
	const modelOrganisations = (await readdir(modelDirectory, {
		withFileTypes: true,
	}))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	const logoSources = new Map<string, string>();

	for (const organisationId of modelOrganisations) {
		const logo = resolveLogo(organisationId, { variant: "dark" });
		if (!logo.id || !logo.src) continue;

		const existingSource = logoSources.get(logo.id);
		if (existingSource && existingSource !== logo.src) {
			throw new Error(
				`Logo ${logo.id} resolved to more than one source: ${existingSource}, ${logo.src}`,
			);
		}
		logoSources.set(logo.id, logo.src);
	}

	await mkdir(outputDirectory, { recursive: true });

	const executablePath = process.env.DISCORD_LOGO_CHROMIUM_EXECUTABLE_PATH?.trim();
	const browser = await chromium.launch({
		headless: true,
		...(executablePath ? { executablePath } : {}),
	});

	try {
		const page = await browser.newPage({
			viewport: { width: 128, height: 128 },
			deviceScaleFactor: 2,
		});

		for (const [logoId, source] of logoSources) {
			const sourcePath = sourcePathForLogo(source);
			const extension = extname(sourcePath).toLowerCase();
			const mimeType = mimeTypes[extension];
			if (!mimeType) {
				throw new Error(`Unsupported logo format for ${logoId}: ${extension}`);
			}

			const sourceContent = await readFile(sourcePath);
			const logoMarkup =
				extension === ".svg"
					? sourceContent
							.toString("utf8")
							.replace(/^\uFEFF?\s*<\?xml[^>]*\?>/i, "")
							.replace(/currentColor/gi, "#ffffff")
					: `<img alt="" src="data:${mimeType};base64,${sourceContent.toString("base64")}">`;
			const html = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<style>
			html, body { width: 128px; height: 128px; margin: 0; background: transparent; }
			#discord-logo { width: 128px; height: 128px; display: grid; place-items: center; }
			#discord-logo > svg, #discord-logo > img { width: 112px !important; height: 112px !important; }
			#discord-logo > img { object-fit: contain; }
		</style>
	</head>
	<body><div id="discord-logo">${logoMarkup}</div></body>
</html>`;

			await page.setContent(html);
			await page.evaluate(async () => {
				await Promise.all(Array.from(document.images, (image) => image.decode()));
			});
			await page.locator("#discord-logo").screenshot({
				path: join(outputDirectory, `${logoId}.png`),
				omitBackground: true,
			});
		}
	} finally {
		await browser.close();
	}

	process.stdout.write(
		`Generated ${logoSources.size} Discord PNG logos from ${modelOrganisations.length} catalog model organizations.\n`,
	);
}

main().catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
	);
	process.exitCode = 1;
});

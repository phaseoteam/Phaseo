import { describe, expect, it } from "vitest";
import { compareVersions, newestRelease, pickDownload } from "./updates";

const release = (tag: string, extra: object = {}) => ({ tag_name: tag, html_url: `https://github.com/phaseoteam/Phaseo/releases/tag/${encodeURIComponent(tag)}`, draft: false, prerelease: false, published_at: "2026-10-27T10:00:00Z", body: `Notes for ${tag}`, assets: [], ...extra });

describe("updates", () => {
	it("orders versions as numbers, a pre-release before its release", () => {
		expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
		expect(compareVersions("1.0.0-beta.2", "1.0.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0-beta.10", "1.0.0-beta.2")).toBeGreaterThan(0);
		expect(compareVersions("1.2.3", "v1.2.3")).toBe(0);
	});

	it("finds Factory's newest release among the monorepo's other packages, and nothing when this is the newest", () => {
		const releases = [release("@ai-stats/java-sdk@2.0.4"), release("@phaseo/factory@0.2.0"), release("@phaseo/factory@0.10.0-beta.1", { prerelease: true }), release("@phaseo/factory@0.3.0", { draft: true }), release("@phaseo/factory@0.1.5")];
		expect(newestRelease(releases, "0.1.0")).toMatchObject({ version: "0.2.0", notes: "Notes for @phaseo/factory@0.2.0" });
		expect(newestRelease(releases, "0.1.0", true)?.version).toBe("0.10.0-beta.1");
		expect(newestRelease(releases, "0.2.0")).toBeNull();
		expect(newestRelease([release("@ai-stats/sdk@9.9.9")], "0.1.0")).toBeNull();
	});

	it("picks this computer's download, never an updater's metadata", () => {
		const assets = ["Phaseo-Factory-0.2.0-win-x64.zip", "Phaseo-Factory-0.2.0-win-arm64.zip", "Phaseo-Factory-0.2.0-mac-arm64.dmg", "latest.yml", "Phaseo-Factory-0.2.0-linux-x64.AppImage"].map((name) => ({ name, browser_download_url: `https://x/${name}`, size: 100 * 1024 * 1024 }));
		expect(pickDownload(assets, "win32", "x64")?.name).toBe("Phaseo-Factory-0.2.0-win-x64.zip");
		expect(pickDownload(assets, "win32", "arm64")?.name).toBe("Phaseo-Factory-0.2.0-win-arm64.zip");
		expect(pickDownload(assets, "darwin", "arm64")?.name).toBe("Phaseo-Factory-0.2.0-mac-arm64.dmg");
		expect(pickDownload(assets, "linux", "x64")?.name).toBe("Phaseo-Factory-0.2.0-linux-x64.AppImage");
		expect(pickDownload([], "win32", "x64")).toBeUndefined();
	});
});

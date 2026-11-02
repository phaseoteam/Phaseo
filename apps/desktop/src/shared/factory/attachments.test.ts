import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGES, attachRef, attachable, attachmentKey, attachmentsFor, imageProblem, isAttachmentName, supportsAttach } from "./attachments";
import { issueBody, stagePrompt } from "./stages";
import { demoItems } from "./demo";

describe("attachments", () => {
	it("takes common image types within the size and count limits", () => {
		expect(imageProblem({ type: "image/png", size: 1_000 }, 0)).toBeNull();
		expect(imageProblem({ type: "image/svg+xml", size: 1_000 }, 0)).toMatch(/Only PNG/);
		expect(imageProblem({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }, 0)).toMatch(/10 MB/);
		expect(imageProblem({ type: "image/webp", size: 1_000 }, MAX_IMAGES)).toMatch(/at most/);
	});

	it("names files itself, so nothing the uploader typed reaches the disk", () => {
		const files = attachmentsFor([{ type: "image/png", data: new Uint8Array(3) }, { type: "image/jpeg", data: new Uint8Array(5) }]);
		expect(files).toEqual([{ name: "image-1.png", type: "image/png", bytes: 3 }, { name: "image-2.jpg", type: "image/jpeg", bytes: 5 }]);
		expect(files.every((file) => isAttachmentName(file.name))).toBe(true);
		expect(isAttachmentName("../factory.json")).toBe(false);
		expect(attachmentKey({ repo: "phaseo-app/phaseo", number: 12 })).toBe("phaseo-app_phaseo-12");
	});

	it("says on GitHub that the images are in Factory, and points agents at them", () => {
		expect(issueBody("Broken.", "", [{ name: "image-1.png" }, { name: "image-2.png" }])).toContain("2 images attached in Phaseo Factory: image-1.png, image-2.png");
		const issue = demoItems(Date.UTC(2026, 9, 22)).find((item) => item.number === 3117);
		const prompt = stagePrompt(issue!, "reproduce", undefined, { inputs: [".factory/inputs/image-1.png"] });
		expect(prompt).toContain("Open each one before you start:\n- .factory/inputs/image-1.png");
	});

	it("only uses gh --attach from 2.99.0", () => {
		expect(supportsAttach("2.69.0")).toBe(false);
		expect(supportsAttach("2.98.9")).toBe(false);
		expect(supportsAttach("2.99.0")).toBe(true);
		expect(supportsAttach("2.100.1")).toBe(true);
		expect(supportsAttach("3.0.0")).toBe(true);
		expect(supportsAttach(null)).toBe(false);
	});

	it("writes the same path in Markdown as it passes to --attach, so gh swaps it for the upload", () => {
		const ref = attachRef("C:\\Users\\me\\AppData\\factory\\attachments\\new-x\\image-1.png");
		expect(ref).toBe("C:/Users/me/AppData/factory/attachments/new-x/image-1.png");
		const body = issueBody("Broken.", "", [{ name: "image-1.png", ref }, { name: "image-2.png" }]);
		expect(body).toContain(`![image-1.png](${ref})`);
		expect(body).toContain("1 image attached in Phaseo Factory: image-2.png.");
	});

	it("attaches the kinds and sizes GitHub takes", () => {
		expect(attachable("after-usage.png", 2_000_000)).toBe(true);
		expect(attachable("walkthrough.mp4", 60 * 1024 * 1024)).toBe(true);
		expect(attachable("huge.png", 11 * 1024 * 1024)).toBe(false);
		expect(attachable("drawing.svg", 1_000)).toBe(false);
		expect(attachable("test-output.log", 1_000)).toBe(false);
	});
});

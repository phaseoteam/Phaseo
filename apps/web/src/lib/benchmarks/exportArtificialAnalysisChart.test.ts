/** @jest-environment jsdom */
import { toPng } from "html-to-image";
import { exportArtificialAnalysisChart } from "./exportArtificialAnalysisChart";
jest.mock("html-to-image", () => ({ toPng: jest.fn() }));
const capture = jest.mocked(toPng);
function chart() {
	const node = document.createElement("section");
	node.innerHTML = '<h3>Cost vs intelligence</h3><svg><foreignObject x="20" y="40" width="174" height="24"><button style="color: rgb(200, 100, 50)"><img src="/light.svg" style="display:none" /><img src="/dark.svg" /><span>Model One</span></button></foreignObject></svg>';
	document.body.appendChild(node);
	const image = node.querySelectorAll("img")[1];
	image.getBoundingClientRect = () => ({ width: 16, height: 16 } as DOMRect);
	return node;
}
afterEach(() => { document.body.innerHTML = ""; capture.mockReset(); });
it("exports native SVG labels with one visible logo and leaves the original chart intact", async () => {
	const node = chart();
	capture.mockImplementation(async (copy, options) => {
		expect(copy).not.toBe(node);
		expect(copy.querySelector("foreignObject")).toBeNull();
		expect(copy.querySelector("text")?.textContent).toBe("Model One");
		expect(copy.querySelector("text")?.getAttribute("fill")).toBe("rgb(200, 100, 50)");
		expect(copy.querySelectorAll("image")).toHaveLength(1);
		expect(copy.querySelector("image")?.getAttribute("href")).toContain("/dark.svg");
		expect(options?.style?.opacity).toBe("1");
		expect(document.body.children).toHaveLength(2);
		return "data:image/png;base64,test";
	});
	await expect(exportArtificialAnalysisChart(node)).resolves.toBe("data:image/png;base64,test");
	expect(node.querySelector("foreignObject")).not.toBeNull();
	expect(document.body.children).toHaveLength(1);
});
it("cleans up its temporary chart when image rendering fails", async () => {
	const node = chart();
	capture.mockRejectedValue(new Error("image failed"));
	await expect(exportArtificialAnalysisChart(node)).rejects.toThrow("image failed");
	expect(document.body.children).toHaveLength(1);
	expect(node.querySelector("foreignObject")).not.toBeNull();
});

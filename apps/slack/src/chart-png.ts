import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import montserratRegular from "../assets/Montserrat-Regular.ttf";
import montserratSemiBold from "../assets/Montserrat-SemiBold.ttf";
import { FONT_FAMILY, WIDTH } from "./chart";

// Charts (chart.ts) as PNG: resvg, compiled to WebAssembly and bundled with the
// Worker, draws the SVG with the bundled Montserrat (SIL Open Font License,
// assets/Montserrat-OFL.txt). It loads no system fonts, so every chart looks
// the same wherever it is drawn. The module is set up once per isolate.

let ready: Promise<void> | null = null;

export async function renderPng(svg: string): Promise<Uint8Array> {
	ready ??= initWasm(resvgWasm).catch((error: unknown) => {
		ready = null;
		throw error;
	});
	await ready;
	const resvg = new Resvg(svg, {
		font: { fontBuffers: [new Uint8Array(montserratRegular), new Uint8Array(montserratSemiBold)], defaultFontFamily: FONT_FAMILY, sansSerifFamily: FONT_FAMILY },
		fitTo: { mode: "width", value: WIDTH },
		background: "#ffffff",
	});
	try {
		const image = resvg.render();
		try {
			return image.asPng();
		} finally {
			image.free();
		}
	} finally {
		resvg.free();
	}
}

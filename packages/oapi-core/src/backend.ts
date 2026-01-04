import type { IR } from "./ir.js";

export type GeneratedFile = {
	path: string;
	contents: string;
};

export type BackendContext = {
	outDir: string;
	packageName?: string;
	runtimeMode?: "inline" | "external";
};

export type Backend = {
	id: string;
	generate: (ir: IR, ctx: BackendContext) => Promise<GeneratedFile[]>;
};

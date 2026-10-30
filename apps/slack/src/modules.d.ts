// Binary modules the Worker bundles (wrangler.jsonc rules): WebAssembly as a
// compiled module, fonts as their bytes. Tests load them the same way
// (vitest.config.ts).

declare module "*.wasm" {
	const module: WebAssembly.Module;
	export default module;
}

declare module "*.ttf" {
	const data: ArrayBuffer;
	export default data;
}

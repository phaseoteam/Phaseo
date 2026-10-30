// Vite asset query imports used by the vinext build (see src/lib/og/ogAssets.ts).
declare module "*?inline" {
	const dataUrl: string;
	export default dataUrl;
}
declare module "*?raw" {
	const text: string;
	export default text;
}

declare module "js-yaml" {
	export function load(
		str: string,
		options?: Record<string, unknown>
	): unknown;
}

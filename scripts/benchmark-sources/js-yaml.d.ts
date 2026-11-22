// js-yaml is a root dev dependency without bundled types; METR publishes its results as YAML.
declare module "js-yaml" {
	export function load(text: string): unknown;
}

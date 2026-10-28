// Skills for people building on Phaseo, in the order they are listed. They live in `.agents/skills` and are
// published to the docs site and the Phaseo plugin by `sync.mjs`. Internal skills (catalogue onboarding,
// database changes, release notes, generic helpers) stay out.
export const PUBLIC_SKILLS = [
	"phaseo-gateway",
	"phaseo-migration",
	"openrouter-to-phaseo-migration",
	"phaseo-model-selection",
	"phaseo-usage-monitoring",
	"phaseo-sdk-typescript",
	"phaseo-sdk-python",
	"phaseo-agent-sdk-typescript",
	"phaseo-routing-presets",
	"phaseo-guardrails",
	"phaseo-async-webhooks",
	"phaseo-web-search-tools",
	"phaseo-response-healing",
	"phaseo-cli",
];

// Skills that exist only in the plugin, because they depend on its MCP connection.
export const PLUGIN_ONLY_SKILLS = ["phaseo"];

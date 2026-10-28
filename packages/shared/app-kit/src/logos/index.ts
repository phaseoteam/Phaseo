import { logoManifest } from "./manifest";

type Manifest = typeof logoManifest;

export type KnownLogoId = keyof Manifest;

export type LogoVariant = "auto" | "color" | "mono" | "light" | "dark";

export type LogoTheme = "light" | "dark";

export type LogoAssets = {
	color?: string;
	light?: string;
	dark?: string;
};

export type ResolvedLogo<Id extends string = KnownLogoId> = {
	id?: Id;
	label: string;
	src?: string;
	variant: "color" | "light" | "dark";
	assets: LogoAssets;
};

export type ResolveLogoOptions = {
	variant?: LogoVariant;
	theme?: LogoTheme;
	fallbackToColor?: boolean;
};

/** Display names where title-casing the ID would be wrong. */
export const logoLabels: Partial<Record<KnownLogoId, string>> = {
	baselabs: "Base Labs",
	nace: "Nace.AI",
	"abliteration-ai": "Abliteration AI",
	ai21: "AI21",
	"alibaba-cn": "Alibaba Cloud",
	"alibaba-cloud": "Alibaba Cloud",
	aws: "AWS",
	claudecode: "Claude Code",
	"cloudflare-ai-gateway": "Cloudflare AI Gateway",
	crofai: "CrofAI",
	continue: "Continue",
	"deepseek-harness": "DeepSeek Harness",
	dealignai: "dealign.ai",
	digitalocean: "DigitalOcean",
	empiriolabs: "EmpirioLabs AI",
	github: "GitHub",
	inference: "Inference",
	kilo: "Kilo Code",
	lmstudio: "LM Studio",
	ltx: "LTX",
	modelscope: "ModelScope",
	nebius: "Nebius",
	"google-gemma": "Gemma",
	huggingface: "Hugging Face",
	ibm: "IBM",
	ionet: "IO.net",
	lg: "LG",
	llmgateway: "LLM Gateway",
	mindai: "Mind Lab",
	"naver-hyperclova": "NAVER HyperCLOVA",
	"nex-agi": "Nex AGI",
	n8n: "n8n",
	opencode: "OpenCode",
	openwebui: "Open WebUI",
	"perplexity-agent": "Perplexity Agent",
	poe: "Poe",
	"qiniu-ai": "Qiniu AI",
	runinfra: "RunInfra",
	sakana: "Sakana AI",
	stepfun: "StepFun",
	submodel: "SubModel",
	togetherai: "Together AI",
	tinyfish: "TinyFish",
	typesafe: "TypeSafe",
	"tencent-cloud": "Tencent Cloud",
	wandb: "CoreWeave Forge",
	"weights-and-biases": "CoreWeave Forge",
	"coreweave-forge": "CoreWeave Forge",
	"wandb-weave": "W&B Weave",
	"spacex-ai": "SpaceXAI",
	"zai": "Z.ai",
	zenmux: "ZenMux",
	"observability-axiom": "Axiom",
	"observability-arize": "Arize AI",
	"observability-braintrust": "Braintrust",
	"observability-clickhouse": "ClickHouse",
	"observability-datadog": "Datadog",
	"observability-dynatrace": "Dynatrace",
	"observability-fiddler": "Fiddler",
	"observability-grafana": "Grafana Cloud",
	"observability-honeyhive": "HoneyHive",
	"observability-langfuse": "Langfuse",
	"observability-langsmith": "LangSmith",
	"observability-middleware": "Middleware",
	"observability-mona": "Mona",
	"observability-newrelic": "New Relic",
	"observability-opentelemetry": "OpenTelemetry",
	"observability-opik": "Comet Opik",
	"observability-posthog": "PostHog",
	"observability-sentry": "Sentry",
	"observability-snowflake": "Snowflake",
	"observability-supabase": "Supabase",
	"observability-whylabs": "WhyLabs",
};

/** Provider and catalogue IDs that use another ID's logo, so callers can pass provider IDs directly. */
export const logoAliases: Record<string, KnownLogoId> = {
	"novitaai": "novita",
	"EmpirioLabs AI": "empiriolabs",
	"cogito-ai": "cogito",
	"inference-net": "inference",
	"io-net": "ionet",
	"anthropic-aws": "aws",
	"anthropic-aws-us": "aws",
	"azure-cognitive-services": "azure",
	"cloudflare-workers-ai": "cloudflare",
	"fireworks-ai": "fireworks",
	"github-copilot": "github",
	"google-vertex-anthropic": "google-vertex",
	"alibaba-coding-plan": "alibaba",
	"alibaba-coding-plan-cn": "alibaba",
	"alibaba-token-plan": "alibaba",
	"alibaba-token-plan-cn": "alibaba",
	"minimax-cn": "minimax",
	"minimax-coding-plan": "minimax",
	"minimax-cn-coding-plan": "minimax",
	"moonshot": "moonshotai",
	"kimi": "moonshotai",
	"moonshotai-cn": "moonshotai",
	"ollama-cloud": "ollama",
	"cline-pass": "cline",
	"kimi-for-coding": "moonshotai",
	"llama": "meta",
	"opencode-go": "opencode",
	"stepfun-ai": "stepfun",
	"stepfun-ai-step-plan": "stepfun",
	"stepfun-step-plan": "stepfun",
	"zai-coding-plan": "zai",
	"zhipuai-coding-plan": "zhipuai",
	"snowflake-cortex": "snowflake",
	"sap-ai-core": "sap",
	"tencent-coding-plan": "tencent",
	"tencent-token-plan": "tencent",
	"tencent-tokenhub": "tencent",
	"wafer.ai": "wafer",
	"reflection-ai": "reflection",
	"x-ai": "spacex-ai",
	"xai": "spacex-ai",
};

function normalise(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickVariant(
	assets: LogoAssets,
	requestedVariant: LogoVariant,
	theme: LogoTheme,
	fallbackToColor: boolean
): { src?: string; variant: "color" | "light" | "dark" } {
	const { color, light, dark } = assets;
	const applyFallbackVariant = (
		requested: "color" | "light" | "dark",
		source?: string,
		fallback?: "color" | "light" | "dark"
	) => {
		if (!source) return { src: undefined, variant: requested };
		return {
			src: source,
			variant: fallback ?? requested,
		};
	};

	switch (requestedVariant) {
		case "color": {
			if (color) return { src: color, variant: "color" };
			if (fallbackToColor) {
				const fallback = theme === "dark" ? dark ?? light : light ?? dark;
				return applyFallbackVariant(theme, fallback ?? color, color ? "color" : theme);
			}
			break;
		}
		case "light": {
			const fallbackVariant = light
				? "light"
				: color
					? "color"
					: "dark";
			const src = light ?? color ?? dark;
			return { src, variant: fallbackVariant };
		}
		case "dark": {
			const fallbackVariant = dark
				? "dark"
				: color
					? "color"
					: "light";
			const src = dark ?? color ?? light;
			return { src, variant: fallbackVariant };
		}
		case "mono": {
			if (theme === "dark") {
				const src = dark ?? (fallbackToColor ? color ?? light : undefined);
				const variant =
					dark && src === dark
						? "dark"
						: color && src === color
							? "color"
							: "light";
				return { src, variant };
			}
			// theme === light
			{
				const src = light ?? (fallbackToColor ? color ?? dark : undefined);
				const variant =
					light && src === light
						? "light"
						: color && src === color
							? "color"
							: "dark";
				return { src, variant };
			}
		}
		case "auto":
		default: {
			if (color) return { src: color, variant: "color" };
			const fallbackVariant = theme === "dark" ? "dark" : "light";
			const src =
				theme === "dark"
					? dark ?? (fallbackToColor ? color ?? light : undefined)
					: light ?? (fallbackToColor ? color ?? dark : undefined);
			if (src === color) return { src, variant: "color" };
			return { src, variant: fallbackVariant };
		}
	}

	// If we reach here, fall back sensibly
	if (color) return { src: color, variant: "color" };
	const src = theme === "dark" ? dark ?? light : light ?? dark;
	return { src, variant: theme };
}

/**
 * Everything a resolver needs: each ID's files, display names and aliases. The website publishes the built-in
 * data at /logos/manifest.json, so the mobile app can show logos added after it was built.
 */
export type LogoData = {
	logos: Record<string, LogoAssets>;
	labels: Partial<Record<string, string>>;
	aliases: Record<string, string>;
};

export type LogoResolver<Id extends string = string> = {
	resolveLogo(input: string, options?: ResolveLogoOptions): ResolvedLogo<Id>;
	listKnownLogos(): Array<{ id: Id; label: string; assets: LogoAssets }>;
	getLogoLabel(id: string): string;
	getKnownLogoIds(): Id[];
};

/** A resolver over some logo data. The exports below use the built-in data; the mobile app adds the published data to it. */
export function createLogoResolver(data: LogoData): LogoResolver {
	const entries = Object.entries(data.logos);
	const keyMap = new Map<string, string>();
	const aliasMap = new Map<string, string>();
	const pathMap = new Map<string, string>();
	for (const [key, assets] of entries) {
		keyMap.set(normalise(key), key);
		for (const value of Object.values(assets)) {
			if (!value) continue;
			pathMap.set(value, key);
		}
	}
	for (const [alias, key] of Object.entries(data.aliases)) aliasMap.set(normalise(alias), key);

	const lookupKnownId = (input: string): string | undefined => {
		if (!input) return undefined;
		if (data.logos[input]) return input;
		const normalised = normalise(input);
		if (!normalised) return undefined;
		return keyMap.get(normalised) ?? aliasMap.get(normalised);
	};

	const labelFromId = (id?: string): string => {
		if (!id) return "Logo";
		const label = data.labels[id];
		if (label) return label;
		return id
			.replace(/[-_]+/g, " ")
			.split(" ")
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	};

	const resolveLogo = (input: string, options: ResolveLogoOptions = {}): ResolvedLogo<string> => {
		const { variant = "auto", theme = "light", fallbackToColor = true } = options;

		let key = lookupKnownId(input);
		let assets: LogoAssets = key ? data.logos[key] ?? {} : {};

		if (!key && input.startsWith("/")) {
			key = pathMap.get(input);
			if (key) {
				assets = data.logos[key] ?? {};
			} else if (input.endsWith(".svg")) {
				// treat arbitrary static path as color-only asset
				assets = { color: input };
			}
		}

		if (!key && !assets.color && !assets.light && !assets.dark) {
			// final fallback: assume the caller passed a bare id that matches the filename exactly
			const assumedPath = `/logos/${input}.svg`;
			if (pathMap.has(assumedPath)) {
				key = pathMap.get(assumedPath);
				assets = data.logos[key!] ?? {};
			}
		}

		const { src, variant: resolvedVariant } = pickVariant(assets, variant, theme, fallbackToColor);

		return {
			id: key,
			label: key ? labelFromId(key) : labelFromId(input),
			src,
			variant: resolvedVariant,
			assets,
		};
	};

	return {
		resolveLogo,
		listKnownLogos: () => entries.map(([id, assets]) => ({ id, label: labelFromId(id), assets })),
		getLogoLabel: (id) => labelFromId(lookupKnownId(id) ?? id),
		getKnownLogoIds: () => entries.map(([id]) => id),
	};
}

/** The logo data built into this version of the code. */
export const builtInLogoData: LogoData = { logos: logoManifest, labels: logoLabels, aliases: logoAliases };

const builtIn = createLogoResolver(builtInLogoData) as LogoResolver<KnownLogoId>;

export function resolveLogo(input: string, options: ResolveLogoOptions = {}): ResolvedLogo {
	return builtIn.resolveLogo(input, options);
}

export function listKnownLogos(): Array<{ id: KnownLogoId; label: string; assets: LogoAssets }> {
	return builtIn.listKnownLogos();
}

export function getLogoLabel(id: string): string {
	return builtIn.getLogoLabel(id);
}

export function getKnownLogoIds(): KnownLogoId[] {
	return builtIn.getKnownLogoIds();
}

/** Built-in data plus logo data downloaded later (the published data wins where both have an ID). */
export function mergeLogoData(base: LogoData, extra: LogoData): LogoData {
	return {
		logos: { ...base.logos, ...extra.logos },
		labels: { ...base.labels, ...extra.labels },
		aliases: { ...base.aliases, ...extra.aliases },
	};
}

export { logoManifest } from "./manifest";

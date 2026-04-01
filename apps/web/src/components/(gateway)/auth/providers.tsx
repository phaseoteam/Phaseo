import { Logo } from "@/components/Logo";

const providerIds = [
	"ai21",
	"alibaba",
	"amazon-bedrock",
	"amazon",
	"anthropic",
	"atlas-cloud",
	"azure",
	"baidu",
	"baseten",
	"bytedance",
	"cerebras",
	"chutes",
	"cohere",
	"deepinfra",
	"deepseek",
	"eleven-labs",
	"google-ai-studio",
	"google-vertex",
	"google",
	"groq",
	"ibm",
	"lg",
	"meta",
	"microsoft",
	"minimax",
	"mistral",
	"moonshotai",
	"nous",
	"novita",
	"nvidia",
	"openai",
	"parasail",
	"perplexity",
	"qwen",
	"suno",
	"together",
	"x-ai",
] as const;

export default function ProviderLogos() {
	// Deterministic grid dimensions
	const cols = 14;
	const rows = 14;
	const total = cols * rows;

	// Build a deterministic repeated array of providers to fill the grid.
	const base = providerIds;
	const cellProviders: string[] = [];
	for (let i = 0; i < total; i++) {
		cellProviders.push(base[i % base.length]);
	}

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
		>
			<div
				className="w-full h-full"
				style={{
					display: "grid",
					gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
					gridAutoRows: "minmax(48px, 1fr)",
					gap: "1.5rem",
					padding: "2rem",
					alignItems: "center",
					justifyItems: "center",
				}}
			>
				{Array.from({ length: total }).map((_, idx) => {
					const r = Math.floor(idx / cols);
					const c = idx % cols;
					const show = (r + c) % 2 === 0;
					const providerId = cellProviders[idx];

					return (
						<div
							key={`bg-cell-${idx}`}
							className="flex items-center justify-center"
							style={{ opacity: 0.12 }}
						>
							{show ? (
								<Logo
									id={providerId}
									width={48}
									height={48}
									draggable={false}
								/>
							) : (
								<div style={{ width: 48, height: 48 }} />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

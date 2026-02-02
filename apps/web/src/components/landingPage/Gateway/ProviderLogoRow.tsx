import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";

const PROVIDERS = [
	{ id: "openai", label: "OpenAI", accent: "#0f172a" },
	{ id: "anthropic", label: "Anthropic", accent: "#f97316" },
	{ id: "google", label: "Google", accent: "#3b82f6" },
	{ id: "mistral", label: "Mistral", accent: "#ef4444" },
	{ id: "meta", label: "Meta", accent: "#2563eb" },
	{ id: "amazon", label: "Amazon", accent: "#f59e0b" },
];

export function ProviderLogoRow({ className }: { className?: string }) {
	return (
		<div className={cn("flex flex-wrap items-center gap-3", className)}>
			{PROVIDERS.map((provider) => (
				<div
					key={provider.id}
					className="flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"
					style={{ borderColor: provider.accent }}
				>
					<span
						className="flex h-6 w-6 items-center justify-center rounded-full border bg-slate-50"
						style={{ borderColor: provider.accent }}
					>
						<Logo
							id={provider.id}
							alt={provider.label}
							width={18}
							height={18}
							className="h-4 w-4 object-contain"
						/>
					</span>
					<span>{provider.label}</span>
				</div>
			))}
		</div>
	);
}

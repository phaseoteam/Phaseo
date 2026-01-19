import Image from "next/image";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const INTEGRATIONS = [
	{ label: "Claude Code", variant: "text" as const, accent: "#f97316" },
	{ label: "Codex", variant: "text" as const, accent: "#0ea5e9" },
	{ label: "OpenCode", variant: "text" as const, accent: "#10b981" },
	{
		label: "Vercel AI SDK",
		variant: "logo" as const,
		logo: "/logos/vercel_light.svg",
		accent: "#111827",
	},
	{
		label: "OpenAI SDK",
		variant: "logo" as const,
		logo: "/logos/openai_light.svg",
		accent: "#0f172a",
	},
	{
		label: "Anthropic SDK",
		variant: "logo" as const,
		logo: "/logos/anthropic_light.svg",
		accent: "#f97316",
	},
	{ label: "AI Stats SDKs", variant: "pill" as const, accent: "#6366f1" },
];

export function Integrations() {
	return (
		<section className="py-16 sm:py-20">
			<div className="container mx-auto flex flex-col items-center">
				<h2 className="mb-8 text-3xl font-bold text-center text-slate-900">
					Drop Conduit into your existing workflows.
				</h2>
				<p className="mb-8 max-w-2xl text-base leading-relaxed text-center text-slate-600">
					Keep the tools you already use -- or adopt AI Stats SDKs --
					while standardising behaviour across providers.
				</p>
				<div className="w-full flex justify-center">
					<Card
						className="shadow-sm border-t-2"
						style={{ borderTopColor: "#0ea5e9" }}
					>
						<CardContent className="flex flex-wrap gap-2 p-6 justify-center">
							{INTEGRATIONS.map((item) => (
								<div
									key={item.label}
									className={cn(
										"flex items-center gap-3 rounded-full border px-4 py-2 text-sm",
										item.variant === "pill"
											? "bg-slate-900 text-white border-slate-900"
											: "bg-white text-slate-800",
									)}
									style={{ borderColor: item.accent }}
								>
									{item.variant === "logo" ? (
										<Image
											src={item.logo!}
											alt={item.label}
											width={90}
											height={20}
											className="h-5 w-auto"
										/>
									) : (
										<span
											className="h-2 w-2 rounded-full"
											style={{
												backgroundColor: item.accent,
											}}
										/>
									)}
									<span>{item.label}</span>
								</div>
							))}
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}

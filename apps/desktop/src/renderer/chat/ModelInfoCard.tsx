import { useState, type ReactNode } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { ArrowUpRight } from "lucide-react";
import type { Harness, ModelFacts } from "../../shared/workspace";
import { ModelLogo } from "../components/ModelLogo";
import { cn } from "../lib/utils";
import { knownModel, modelLabel } from "./ModelPicker";

/** The model's page on the website: catalog IDs are its organisation and model segments. */
export const modelPageUrl = (id: string) => `https://phaseo.app/models/${id.split("/").map(encodeURIComponent).join("/")}`;

const tokens = (value: number) => value >= 1_000_000 ? `${+(value / 1_000_000).toFixed(2)}M` : value >= 1_000 ? `${+(value / 1_000).toFixed(1)}K` : String(value);
const dollars = (value: number) => `$${value >= 1 ? +value.toFixed(2) : +value.toPrecision(2)}`;
const sentence = (values: string[]) => values.map((value, index) => index ? value : value[0].toUpperCase() + value.slice(1)).join(", ");

function price(facts: ModelFacts) {
	const { inputPrice: input, outputPrice: output } = facts;
	if (input === undefined && output === undefined) return;
	if (!input && !output) return "Free";
	return [input !== undefined && `${dollars(input)} in`, output !== undefined && `${dollars(output)} out`].filter(Boolean).join(" · ") + " per 1M tokens";
}

function Facts({ facts }: { facts?: ModelFacts }) {
	const rows = facts ? [
		["Context", facts.contextTokens && `${tokens(facts.contextTokens)} tokens`],
		["Max output", facts.outputTokens && `${tokens(facts.outputTokens)} tokens`],
		["Price", price(facts)],
		["Input", facts.input && sentence(facts.input)],
		["Providers", facts.providers && facts.providers.join(", ")],
	].filter((row): row is [string, string] => Boolean(row[1])) : [];
	if (!rows.length) return null;
	return <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
		{rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 text-foreground/90">{value}</dd></div>)}
	</dl>;
}

/**
 * Hovering or clicking the model on a Phaseo answer shows what the catalog says about it, with a link to its page on
 * the website. Other harnesses' models are not in Phaseo's catalog, so their names stay plain text.
 */
export function ModelInfoCard({ harness, model: id, className, children }: { harness: Harness; model: string; className?: string; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	if (harness !== "phaseo" || id === "default") return <span className={className}>{children}</span>;
	const model = knownModel(id);
	const released = model?.releaseDate && !Number.isNaN(Date.parse(model.releaseDate)) ? new Date(model.releaseDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : undefined;
	const byline = [model?.organisationName, released && `Released ${released}`].filter(Boolean).join(" · ");
	return <PreviewCard.Root open={open} onOpenChange={setOpen}>
		<PreviewCard.Trigger delay={350} closeDelay={150} render={<button type="button" aria-label={`About ${model?.name ?? modelLabel(id)}`} onClick={() => setOpen(value => !value)} />}
			className={cn("rounded-sm decoration-muted-foreground/60 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50", className)}>{children}</PreviewCard.Trigger>
		<PreviewCard.Portal>
			<PreviewCard.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
				<PreviewCard.Popup className="w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none" data-model-card={id}>
					<div className="flex min-w-0 items-center gap-2">
						<span className="flex size-6 shrink-0 items-center justify-center [&_img]:size-5 [&_.harness-logo]:size-5"><ModelLogo model={model ?? { id, name: id }} harness={harness} /></span>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold">{model?.name ?? modelLabel(id)}</p>
							{byline && <p className="truncate text-2xs text-muted-foreground">{byline}</p>}
						</div>
					</div>
					{model?.description && <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-pretty text-muted-foreground">{model.description}</p>}
					<Facts facts={model?.facts} />
					<div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
						<span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">{id}</span>
						<button type="button" onClick={() => { setOpen(false); void window.phaseoDesktop?.openExternal(modelPageUrl(id)); }}
							className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-muted">View on Phaseo<ArrowUpRight className="size-3.5" /></button>
					</div>
				</PreviewCard.Popup>
			</PreviewCard.Positioner>
		</PreviewCard.Portal>
	</PreviewCard.Root>;
}

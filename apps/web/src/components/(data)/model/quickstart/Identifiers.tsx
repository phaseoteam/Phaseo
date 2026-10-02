import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";

interface IdentifiersProps {
	modelId: string;
	aliases: string[];
}

export default async function Identifiers({ modelId, aliases }: IdentifiersProps) {
	const t = await getTranslations("Catalogue.models.detail.quickstart");
	const normalizedAliases = Array.from(
		new Set(
			aliases
				.map((alias) => safeDecodeURIComponent(alias))
				.filter(Boolean)
		)
	);

	const hasAliases = normalizedAliases.length > 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("modelIdentifiersTitle")}</CardTitle>
				<CardDescription>
					{t.rich("modelIdentifiersDescription", {
						code: (chunks) => <code>{chunks}</code>,
					})}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div>
					<p className="text-xs font-semibold uppercase text-muted-foreground">
						{t("primaryModelId")}
					</p>
					<code className="mt-1 inline-flex rounded bg-muted px-3 py-1.5 text-sm font-mono select-all cursor-text">
						{modelId}
					</code>
				</div>

				<div>
					<p className="text-xs font-semibold uppercase text-muted-foreground">
						{t("aliases")}
					</p>
					{hasAliases ? (
						<div className="mt-2 flex flex-wrap gap-2">
							{normalizedAliases.map((alias) => (
								<code
									key={alias}
									className="rounded bg-muted px-3 py-1.5 text-xs font-mono select-all cursor-text"
									title={alias}
								>
									{alias}
								</code>
							))}
						</div>
					) : (
						<p className="mt-2 text-sm text-muted-foreground">
							{t("noAliasesConfigured")}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

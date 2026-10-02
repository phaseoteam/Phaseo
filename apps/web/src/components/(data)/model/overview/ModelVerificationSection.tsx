import Link from "next/link";
import { ArrowRight, FileAudio, FileImage, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";

export function supportsProvenanceVerification(outputTypes: unknown): boolean {
	const values = Array.isArray(outputTypes)
		? outputTypes.map(String)
		: typeof outputTypes === "string" ? outputTypes.split(",") : [];
	return values.some((value) => /(^|[^a-z])(image|audio|speech|music|tts)([^a-z]|$)/i.test(value));
}

export default function ModelVerificationSection({ outputTypes }: { outputTypes: unknown }) {
	const t = useTranslations("Catalogue.models.detail.verification");
	const normalized = Array.isArray(outputTypes) ? outputTypes.join(",") : String(outputTypes ?? "");
	const supportsImage = /(^|[^a-z])image([^a-z]|$)/i.test(normalized);
	const supportsAudio = /(^|[^a-z])(audio|speech|music|tts)([^a-z]|$)/i.test(normalized);

	return (
		<>
			<div>
				<h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
			</div>
			<Card className="overflow-hidden border-border/80 bg-muted/10">
				<CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
					<div className="flex min-w-0 gap-4">
						<div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-primary shadow-xs"><ShieldCheck className="size-5" /></div>
						<div>
							<p className="font-medium">{t("verifyFile")}</p>
							<p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t(supportsImage && supportsAudio ? "uploadImageOrAudio" : supportsImage ? "uploadImage" : "uploadAudio")}</p>
							<div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
				{supportsImage ? <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1"><FileImage className="size-3.5" />{t("images")}</span> : null}
				{supportsAudio ? <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1"><FileAudio className="size-3.5" />{t("audio")}</span> : null}
							</div>
						</div>
					</div>
				<Button asChild variant="outline" className="shrink-0"><Link href="/tools/content-provenance">{t("openChecker")}<ArrowRight /></Link></Button>
				</CardContent>
			</Card>
		</>
	);
}

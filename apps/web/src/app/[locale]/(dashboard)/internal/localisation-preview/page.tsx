import { redirect } from "@/lib/navigation";
import { defaultLocale } from "@/i18n/routing";

export default function LocalisationPreviewIndexPage() {
	redirect(`/internal/localisation-preview/${defaultLocale}`);
}

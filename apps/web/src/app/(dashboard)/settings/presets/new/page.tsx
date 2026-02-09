import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getAllModelsCached } from "@/lib/fetchers/models/getAllModels";
import { getAllAPIProvidersCached } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PresetForm from "@/components/(gateway)/settings/presets/PresetForm";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "Create Preset - Settings",
};

export default function NewPresetPage() {
	return (
		<div className="space-y-6">
			<Link
				href="/settings/presets"
				className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ArrowLeft className="mr-2 h-4 w-4" />
				Back to Presets
			</Link>

			<Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50">
				<Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
				<AlertTitle className="text-blue-800 dark:text-blue-300">
					Create a new preset
				</AlertTitle>
				<AlertDescription className="text-blue-700 dark:text-blue-400">
					Presets are named configurations starting with @ that you can reference
					in your API calls. Save your preferred model, system prompt, and
					parameters to create reusable request templates.
				</AlertDescription>
			</Alert>

			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold">New Preset</h1>
						<Badge variant="outline">Beta</Badge>
					</div>
					<p className="text-sm text-muted-foreground mt-1">
						Configure your preset with models, parameters, and preferences
					</p>
				</div>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<NewPresetContent />
			</Suspense>
		</div>
	);
}

async function NewPresetContent() {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const initialTeamId = await getTeamIdFromCookie();

	const [models, providers] = await Promise.all([
		getAllModelsCached(await resolveIncludeHidden()),
		getAllAPIProvidersCached(),
	]);

	return (
		<PresetForm
			models={models}
			providers={providers}
			currentUserId={user?.id}
			currentTeamId={initialTeamId}
		/>
	);
}

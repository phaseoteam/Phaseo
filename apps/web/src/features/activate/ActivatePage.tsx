import { Suspense, type ReactNode } from "react";
import { useSearch } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, Terminal } from "lucide-react";
import { approveDeviceAction, clearDeviceCodeAction, denyDeviceAction, reviewDeviceAction } from "./actions";
import { activatePageDataQuery } from "./page.functions";
import { refreshServerData } from "@/lib/start/refresh";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSuspenseFallback } from "@/features/auth/AuthSuspenseFallback";
import { WorkspaceSelectField } from "./WorkspaceSelectField";

export async function getActivateMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Common.authFlows.deviceActivation");
	return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

// user_code from the link is deliberately ignored: the person types the code from their own
// terminal, so a link sent by someone else cannot pre-fill a code for them to approve.
type ActivateSearch = {
	approved?: string;
	denied?: string;
	error?: string;
};

// Each step changes the reviewed-code cookie, so the page data is read again afterwards.
function submit(action: (input: { data: FormData }) => Promise<unknown>) {
	return async (formData: FormData) => {
		await action({ data: formData });
		await refreshServerData();
	};
}

async function clearCode() {
	await clearDeviceCodeAction();
	await refreshServerData();
}

export function ActivatePage() {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<ActivatePageContent />
		</Suspense>
	);
}

// Signed-out visitors are redirected to sign-in by the route loader
// (page.functions.ts getActivateSignInRedirect).
function ActivatePageContent() {
	const t = useTranslations("Common.authFlows.deviceActivation");
	const params = useSearch({ from: "/{-$locale}/_auth/activate/" }) as ActivateSearch;

	if (params.approved) {
		return <ActivationResult title={t("approvedTitle")} description={t("approvedDescription")} />;
	}
	if (params.denied) {
		return <ActivationResult title={t("deniedTitle")} description={t("deniedDescription")} />;
	}
	return <ActivateDeviceCard showError={Boolean(params.error)} />;
}

function ActivateDeviceCard({ showError }: { showError: boolean }) {
	const t = useTranslations("Common.authFlows.deviceActivation");
	const { data: { userCode, request, workspaces } } = useSuspenseQuery(activatePageDataQuery());

	// Step 2: the reviewed code and what it asks for.
	if (userCode && request) {
		const scopes = Array.isArray(request.scopes) ? request.scopes : [];
		return (
			<ActivationCard title={t("title")} description={t("reviewDescription")}>
				<CardContent className="space-y-5">
					<Alert variant="destructive">
						<ShieldAlert className="size-4" />
						<AlertDescription>{t("phishingWarning")}</AlertDescription>
					</Alert>
					<div className="rounded-md border bg-muted/40 p-4">
						<div className="text-sm text-muted-foreground">{t("deviceCode")}</div>
						<div className="mt-1 font-mono text-2xl font-semibold tracking-widest">{userCode}</div>
					</div>
					<div className="rounded-md border p-4">
						<div className="flex items-start gap-3">
							<ShieldCheck className="mt-0.5 size-5 text-emerald-600" />
							<div>
								<div className="font-medium">{request.client?.name ?? "Phaseo CLI"}</div>
								<div className="text-sm text-muted-foreground">{t("requestedScopes")}</div>
								<ul className="mt-1 flex flex-wrap gap-1.5">
									{scopes.map((scope) => (
										<li key={scope} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{scope}</li>
									))}
								</ul>
							</div>
						</div>
					</div>
					<form id="approve-device" action={submit(approveDeviceAction)} className="space-y-2">
						<input type="hidden" name="reviewed_code" value={userCode} />
						<WorkspaceSelectField workspaces={workspaces} />
					</form>
				</CardContent>
				<CardFooter className="flex-wrap gap-3 pt-5">
					<form action={clearCode} className="w-full">
						<Button type="submit" variant="ghost" className="w-full">{t("differentCode")}</Button>
					</form>
					<form action={submit(denyDeviceAction)} className="flex-1">
						<input type="hidden" name="reviewed_code" value={userCode} />
						<Button type="submit" variant="outline" className="w-full">{t("deny")}</Button>
					</form>
					<Button type="submit" form="approve-device" className="flex-1">{t("approve")}</Button>
				</CardFooter>
			</ActivationCard>
		);
	}

	// Step 1: the person types the code from their own terminal.
	return (
		<ActivationCard title={t("title")} description={t("description")}>
			<form action={submit(reviewDeviceAction)}>
				<CardContent className="space-y-5">
					<Alert variant="destructive">
						<ShieldAlert className="size-4" />
						<AlertDescription>{t("phishingWarning")}</AlertDescription>
					</Alert>
					{showError || userCode ? (
						<Alert variant="destructive">
							<AlertDescription>{t("requestError")}</AlertDescription>
						</Alert>
					) : null}
					<div className="space-y-2">
						<Label htmlFor="user_code">{t("deviceCode")}</Label>
						<Input
							id="user_code"
							name="user_code"
							required
							maxLength={64}
							autoComplete="off"
							autoCapitalize="characters"
							spellCheck={false}
							placeholder="XXXX-XXXX"
							className="font-mono text-lg tracking-widest"
						/>
					</div>
				</CardContent>
				<CardFooter className="pt-5">
					<Button type="submit" className="w-full">{t("continue")}</Button>
				</CardFooter>
			</form>
		</ActivationCard>
	);
}

function ActivationCard(props: { title: string; description: string; children: ReactNode }) {
	return (
		<div className="container mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center py-12">
			<Card className="w-full shadow-lg">
				<CardHeader className="space-y-4">
					<div className="flex size-14 items-center justify-center rounded-md bg-primary/10">
						<Terminal className="size-7 text-primary" />
					</div>
					<div>
						<CardTitle className="text-2xl">{props.title}</CardTitle>
						<CardDescription>{props.description}</CardDescription>
					</div>
				</CardHeader>
				{props.children}
			</Card>
		</div>
	);
}

function ActivationResult(props: { title: string; description: string }) {
	return (
		<div className="container mx-auto flex min-h-[70vh] max-w-xl items-center justify-center py-12">
			<Card className="w-full text-center shadow-lg">
				<CardHeader>
					<CardTitle>{props.title}</CardTitle>
					<CardDescription>{props.description}</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}

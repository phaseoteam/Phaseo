import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck, Terminal } from "lucide-react";
import { approveDeviceAction, denyDeviceAction } from "./actions";
import { activatePageDataQuery } from "./page.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthSuspenseFallback } from "@/features/auth/AuthSuspenseFallback";
import { WorkspaceSelectField } from "./WorkspaceSelectField";

export async function getActivateMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Common.authFlows.deviceActivation");
	return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

type ActivateSearch = {
	user_code?: string;
	approved?: string;
	denied?: string;
};

export function ActivatePage() {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<ActivatePageContent />
		</Suspense>
	);
}

// Signed-out visitors are redirected to sign-in by the route's beforeLoad
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

	const userCode = String(params.user_code ?? "").trim();
	return <ActivateDeviceCard userCode={userCode} />;
}

function ActivateDeviceCard({ userCode }: { userCode: string }) {
	const t = useTranslations("Common.authFlows.deviceActivation");
	const { data: { request, workspaces } } = useSuspenseQuery(activatePageDataQuery(userCode));

	return (
		<div className="container mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center py-12">
			<Card className="w-full shadow-lg">
				<CardHeader className="space-y-4">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
						<Terminal className="size-7 text-primary" />
					</div>
					<div>
						<CardTitle className="text-2xl">{t("title")}</CardTitle>
						<CardDescription>
							{t("description")}
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-5">
					{!userCode ? (
						<Alert>
							<AlertDescription>
								{t("missingCode")}
								<code className="mx-1 rounded bg-muted px-1 py-0.5">?user_code=XXXX-XXXX</code>.
							</AlertDescription>
						</Alert>
					) : request && "error" in request ? (
						<Alert variant="destructive">
							<AlertDescription>{t("requestError")}</AlertDescription>
						</Alert>
					) : (
						<>
							<div className="rounded-xl border bg-muted/40 p-4">
								<div className="text-sm text-muted-foreground">{t("deviceCode")}</div>
								<div className="mt-1 font-mono text-2xl font-semibold tracking-widest">{userCode}</div>
							</div>
							<div className="rounded-xl border p-4">
								<div className="flex items-center gap-3">
									<ShieldCheck className="size-5 text-emerald-600" />
									<div>
										<div className="font-medium">{request?.client?.name ?? "Phaseo CLI"}</div>
										<div className="text-sm text-muted-foreground">
											{t("requestedScopes")}: {(request?.scopes ?? []).join(", ")}
										</div>
									</div>
								</div>
							</div>
							<form id="approve-device" action={(formData) => approveDeviceAction({ data: formData })} className="space-y-2">
								<input type="hidden" name="user_code" value={userCode} />
								<WorkspaceSelectField workspaces={workspaces} />
							</form>
						</>
					)}
				</CardContent>
				<CardFooter className="gap-3">
					<form action={(formData) => denyDeviceAction({ data: formData })} className="flex-1">
						<input type="hidden" name="user_code" value={userCode} />
						<Button variant="outline" className="w-full" disabled={!userCode}>
							{t("deny")}
						</Button>
					</form>
					<Button type="submit" form="approve-device" className="flex-1" disabled={!userCode || Boolean(request && "error" in request)}>
						{t("approve")}
					</Button>
				</CardFooter>
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

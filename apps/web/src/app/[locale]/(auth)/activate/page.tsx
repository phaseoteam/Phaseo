import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, Terminal } from "lucide-react";
import { approveDeviceAction, denyDeviceAction, lookupDeviceRequest } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthSuspenseFallback } from "../AuthSuspenseFallback";
import { WorkspaceSelectField } from "./WorkspaceSelectField";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Common.authFlows.deviceActivation");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

type ActivatePageProps = {
	searchParams: Promise<{
		user_code?: string;
		approved?: string;
		denied?: string;
	}>;
};

export default function ActivatePage({ searchParams }: ActivatePageProps) {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<ActivatePageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function ActivatePageContent({ searchParams }: ActivatePageProps) {
	const t = await getTranslations("Common.authFlows.deviceActivation");
	const params = await searchParams;
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		const query = new URLSearchParams();
		if (params.user_code) query.set("user_code", params.user_code);
		redirect(`/sign-in?returnUrl=${encodeURIComponent(`/activate?${query.toString()}`)}`);
	}

	if (params.approved) {
		return <ActivationResult title={t("approvedTitle")} description={t("approvedDescription")} />;
	}
	if (params.denied) {
		return <ActivationResult title={t("deniedTitle")} description={t("deniedDescription")} />;
	}

	const userCode = String(params.user_code ?? "").trim();
	const request = userCode ? await lookupDeviceRequest(userCode).catch(() => ({ error: true })) : null;
	const { data: sessionData } = await supabase.auth.getSession();
	const { workspaces } = await fetchAccountWebApi<{
		workspaces: Array<{ id: string; name: string; role: string }>;
	}>("/api/account/auth/workspaces", sessionData.session?.access_token);

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
							<form id="approve-device" action={approveDeviceAction} className="space-y-2">
								<input type="hidden" name="user_code" value={userCode} />
								<WorkspaceSelectField workspaces={workspaces} />
							</form>
						</>
					)}
				</CardContent>
				<CardFooter className="gap-3">
					<form action={denyDeviceAction} className="flex-1">
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

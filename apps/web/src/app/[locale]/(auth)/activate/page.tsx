import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, ShieldCheck, Terminal } from "lucide-react";
import {
	approveDeviceAction,
	clearDeviceCodeAction,
	denyDeviceAction,
	lookupDeviceRequest,
	reviewDeviceAction,
	reviewedDeviceCode,
} from "./actions";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSuspenseFallback } from "../AuthSuspenseFallback";
import { WorkspaceSelectField } from "./WorkspaceSelectField";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Common.authFlows.deviceActivation");
	return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

type ActivatePageProps = {
	// user_code from the link is deliberately ignored: the person types the code from their own
	// terminal, so a link sent by someone else cannot pre-fill a code for them to approve.
	searchParams: Promise<{
		approved?: string;
		denied?: string;
		error?: string;
	}>;
};

type DeviceRequest = { client?: { name?: string | null } | null; scopes?: string[] | null };

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
		redirect(`/sign-in?returnUrl=${encodeURIComponent("/activate")}`);
	}

	if (params.approved) {
		return <ActivationResult title={t("approvedTitle")} description={t("approvedDescription")} />;
	}
	if (params.denied) {
		return <ActivationResult title={t("deniedTitle")} description={t("deniedDescription")} />;
	}

	// Step 2 only for a code the person typed on this page (kept in an httpOnly cookie).
	const userCode = await reviewedDeviceCode();
	const request: DeviceRequest | null = userCode
		? await lookupDeviceRequest(userCode).catch(() => null)
		: null;

	if (userCode && request) {
		const { data: sessionData } = await supabase.auth.getSession();
		const { workspaces } = await fetchAccountWebApi<{
			workspaces: Array<{ id: string; name: string; role: string }>;
		}>("/api/account/auth/workspaces", sessionData.session?.access_token);
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
					<form id="approve-device" action={approveDeviceAction} className="space-y-2">
						<input type="hidden" name="reviewed_code" value={userCode} />
						<WorkspaceSelectField workspaces={workspaces} />
					</form>
				</CardContent>
				<CardFooter className="flex-wrap gap-3 pt-5">
					<form action={clearDeviceCodeAction} className="w-full">
						<Button type="submit" variant="ghost" className="w-full">{t("differentCode")}</Button>
					</form>
					<form action={denyDeviceAction} className="flex-1">
						<input type="hidden" name="reviewed_code" value={userCode} />
						<Button type="submit" variant="outline" className="w-full">{t("deny")}</Button>
					</form>
					<Button type="submit" form="approve-device" className="flex-1">{t("approve")}</Button>
				</CardFooter>
			</ActivationCard>
		);
	}

	return (
		<ActivationCard title={t("title")} description={t("description")}>
			<form action={reviewDeviceAction}>
				<CardContent className="space-y-5">
					<Alert variant="destructive">
						<ShieldAlert className="size-4" />
						<AlertDescription>{t("phishingWarning")}</AlertDescription>
					</Alert>
					{params.error || userCode ? (
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

import { redirect } from "next/navigation";
import { ShieldCheck, Terminal } from "lucide-react";
import { approveDeviceAction, denyDeviceAction, lookupDeviceRequest } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceSelectField } from "./WorkspaceSelectField";

export const metadata = {
	title: "Activate AI Stats CLI",
	description: "Approve a device login request for the AI Stats CLI.",
};

type ActivatePageProps = {
	searchParams: Promise<{
		user_code?: string;
		approved?: string;
		denied?: string;
	}>;
};

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
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
		return <ActivationResult title="CLI login approved" description="You can return to your terminal now." />;
	}
	if (params.denied) {
		return <ActivationResult title="CLI login denied" description="The device login request was denied." />;
	}

	const userCode = String(params.user_code ?? "").trim();
	const request = userCode ? await lookupDeviceRequest(userCode).catch((error) => ({ error: String(error?.message ?? error) })) : null;
	const { data: memberships } = await supabase
		.from("workspace_members")
		.select("role, workspace_id, workspaces:workspaces(id, name, slug)")
		.eq("user_id", user.id);
	const workspaces = (memberships ?? [])
		.map((row: any) => {
			const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
			if (!workspace?.id) return null;
			return {
				id: String(workspace.id),
				name: String(workspace.name ?? workspace.slug ?? workspace.id),
				role: String(row.role ?? "member"),
			};
		})
		.filter(Boolean) as Array<{ id: string; name: string; role: string }>;

	return (
		<div className="container mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center py-12">
			<Card className="w-full shadow-lg">
				<CardHeader className="space-y-4">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
						<Terminal className="size-7 text-primary" />
					</div>
					<div>
						<CardTitle className="text-2xl">Activate AI Stats CLI</CardTitle>
						<CardDescription>
							Approve this request only if the code matches the one shown in your terminal.
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-5">
					{!userCode ? (
						<Alert>
							<AlertDescription>
								Open the full verification link from your terminal, or add the code with
								<code className="mx-1 rounded bg-muted px-1 py-0.5">?user_code=XXXX-XXXX</code>.
							</AlertDescription>
						</Alert>
					) : request && "error" in request ? (
						<Alert variant="destructive">
							<AlertDescription>{request.error}</AlertDescription>
						</Alert>
					) : (
						<>
							<div className="rounded-xl border bg-muted/40 p-4">
								<div className="text-sm text-muted-foreground">Device code</div>
								<div className="mt-1 font-mono text-2xl font-semibold tracking-widest">{userCode}</div>
							</div>
							<div className="rounded-xl border p-4">
								<div className="flex items-center gap-3">
									<ShieldCheck className="size-5 text-emerald-600" />
									<div>
										<div className="font-medium">{request?.client?.name ?? "AI Stats CLI"}</div>
										<div className="text-sm text-muted-foreground">
											Requested scopes: {(request?.scopes ?? []).join(", ")}
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
							Deny
						</Button>
					</form>
					<Button type="submit" form="approve-device" className="flex-1" disabled={!userCode || Boolean(request && "error" in request)}>
						Approve CLI
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

// src/components/gateway/Errors.tsx
import { getTranslations } from "next-intl/server";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import {
	Shield,
	LifeBuoy,
	AlertTriangle,
	Server,
	KeyRound,
	CreditCard,
	Lock,
	Timer,
	Search,
} from "lucide-react";
import * as React from "react";

type ErrorItem = {
	http: string;
	type: string;
	when: string;
	action: string;
	icon: React.ComponentType<{ className?: string }>;
};

function ErrorCard({ http, type, when, action, icon: Icon }: ErrorItem) {
	return (
		<div className="rounded-xl border p-4 hover:bg-muted/40 transition">
			<div className="flex items-center gap-3">
				<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
					<Icon className="h-4 w-4 text-primary" />
				</span>
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold">{http}</span>
					<Badge
						variant="secondary"
						className="font-mono text-[10px]"
					>
						{type}
					</Badge>
				</div>
			</div>
			<p className="mt-3 text-sm">{when}</p>
			<p className="mt-2 text-xs text-muted-foreground">{action}</p>
		</div>
	);
}

// Keeps inline code compact and on a single line (no odd wrapping)
const InlineCode: React.FC<React.PropsWithChildren> = ({ children }) => (
	<code className="inline whitespace-nowrap rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
		{children}
	</code>
);

export default async function Errors() {
	const tUi = await getTranslations("Common.ui");
	const clientErrorExample = `HTTP/1.1 402 Payment Required
{
  "error": {
    "type": "payment_error",
    "code": "insufficient_funds",
    "message": "Your wallet balance is too low for this request.",
    "generation_id": "G-abc123"
  }
}`;

	const serverErrorExample = `HTTP/1.1 502 Bad Gateway
{
  "error": {
    "type": "server_error",
    "code": "upstream_provider_error",
    "message": "The model provider returned an error. Please retry.",
    "generation_id": "G-xyz789"
  }
}`;

	const fourXX: ErrorItem[] = [
		{
			http: "400",
			type: "bad_request",
			when: tUi("quickstart.errors.badRequestWhen"),
			action: tUi("quickstart.errors.badRequestAction"),
			icon: AlertTriangle,
		},
		{
			http: "401",
			type: "authentication_error",
			when: tUi("quickstart.errors.authenticationWhen"),
			action: tUi("quickstart.errors.authenticationAction"),
			icon: KeyRound,
		},
		{
			http: "402",
			type: "payment_error",
			when: tUi("quickstart.errors.paymentWhen"),
			action: tUi("quickstart.errors.paymentAction"),
			icon: CreditCard,
		},
		{
			http: "403",
			type: "permission_error",
			when: tUi("quickstart.errors.permissionWhen"),
			action: tUi("quickstart.errors.permissionAction"),
			icon: Lock,
		},
		{
			http: "404",
			type: "not_found",
			when: tUi("quickstart.errors.notFoundWhen"),
			action: tUi("quickstart.errors.notFoundAction"),
			icon: Search,
		},
		{
			http: "429",
			type: "rate_limit_error",
			when: tUi("quickstart.errors.rateLimitWhen"),
			action: tUi("quickstart.errors.rateLimitAction"),
			icon: Timer,
		},
	];

	const fiveXX: ErrorItem[] = [
		{
			http: "500",
			type: "server_error",
			when: tUi("quickstart.errors.serverWhen"),
			action: tUi("quickstart.errors.serverAction"),
			icon: Server,
		},
		{
			http: "502",
			type: "bad_gateway",
			when: tUi("quickstart.errors.badGatewayWhen"),
			action: tUi("quickstart.errors.badGatewayAction"),
			icon: Server,
		},
		{
			http: "503",
			type: "service_unavailable",
			when: tUi("quickstart.errors.unavailableWhen"),
			action: tUi("quickstart.errors.unavailableAction"),
			icon: Server,
		},
		{
			http: "504",
			type: "gateway_timeout",
			when: tUi("quickstart.errors.timeoutWhen"),
			action: tUi("quickstart.errors.timeoutAction"),
			icon: Server,
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{tUi("quickstart.errors.title")}</CardTitle>
				<CardDescription>
					{tUi("quickstart.errors.bucketsDescription")}
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6">
				{/* Bucket chips */}
				<div className="flex flex-wrap gap-2">
					<Badge variant="secondary">
						{tUi("quickstart.error4xx")}
					</Badge>
					<Badge>{tUi("quickstart.error5xx")}</Badge>
				</div>

				{/* Tabs, not tables */}
				<Tabs defaultValue="4xx" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="4xx">
							{tUi("quickstart.error4xx")}
						</TabsTrigger>
						<TabsTrigger value="5xx">
							{tUi("quickstart.error5xx")}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="4xx" className="mt-4">
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{fourXX.map((e) => (
								<ErrorCard key={e.http} {...e} />
							))}
						</div>
					</TabsContent>

					<TabsContent value="5xx" className="mt-4">
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{fiveXX.map((e) => (
								<ErrorCard key={e.http} {...e} />
							))}
						</div>
					</TabsContent>
				</Tabs>

				{/* Examples */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<CodeBlock
						code={clientErrorExample}
						lang="json"
						label={tUi("quickstart.errors.example4xx")}
					/>
					<CodeBlock
						code={serverErrorExample}
						lang="json"
						label={tUi("quickstart.errors.example5xx")}
					/>
				</div>

				{/* Retry guidance (compact, no odd wrapping) */}
				<Alert className="leading-6">
					<Shield className="h-4 w-4" />
					<AlertTitle>{tUi("quickstart.errors.retryTitle")}</AlertTitle>
					<AlertDescription className="text-sm">
						<p>{tUi("quickstart.errors.retryDescription")}</p>
					</AlertDescription>
				</Alert>

				{/* Support CTA */}
				<Alert className="leading-6">
					<LifeBuoy className="h-4 w-4" />
					<AlertTitle>{tUi("quickstart.errors.helpTitle")}</AlertTitle>
					<AlertDescription className="text-sm space-y-3">
						<p>{tUi("quickstart.errors.helpDescription")}</p>

						{/* Callout */}
						<div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">
									{tUi("quickstart.errors.helpCalloutTitle")}
								</span>
								<span className="text-muted-foreground">
									{tUi("quickstart.errors.helpCalloutDescription")}
								</span>
							</div>
						</div>
					</AlertDescription>
				</Alert>
			</CardContent>
		</Card>
	);
}

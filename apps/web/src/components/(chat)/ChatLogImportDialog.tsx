import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { parseAsString, useQueryState } from "nuqs";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	buildThreadFromLogReplay,
	defaultChatLogImportOptions,
	type ChatLogImportOptions,
} from "@/components/(chat)/chatLogImport";
import { readLogReplay, type LogReplay, type LogReplayWarningCode } from "@/lib/chat/logReplay";
import { fetchPrivateUsageRequest } from "@/lib/query/fetchPrivateUsage";
import { toAccountQueryScope } from "@/lib/query/queryKeys";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { ChatThread } from "@/lib/indexeddb/chats";
import { createClient } from "@/utils/supabase/client";

const queryOptions = { shallow: true, history: "replace", scroll: false } as const;

type ReadyImport = { kind: "ready"; replay: LogReplay; provider: string | null; loggedAt: string | null; workspaceId: string | null };
type ImportState =
	| ReadyImport
	| { kind: "unavailable"; reason: "not_stored" | "too_large" | "deleted" | "unsupported" };

const isReadyImport = (state: ImportState | undefined): state is ReadyImport => state?.kind === "ready";

/** Opens a logged gateway request as a new chat after the user picks what to keep. */
export function ChatLogImportDialog({
	models,
	fallbackModelId,
	activeWorkspaceId,
	onImport,
}: {
	models: GatewaySupportedModel[];
	fallbackModelId: string;
	activeWorkspaceId: string | null;
	onImport: (thread: ChatThread) => Promise<void> | void;
}) {
	const t = useTranslations("Product.chat.logImport");
	const tChat = useTranslations("Product.chat");
	const [requestId, setRequestId] = useQueryState("fromRequest", parseAsString.withOptions(queryOptions));
	const [linkWorkspaceId, setLinkWorkspaceId] = useQueryState("workspaceId", parseAsString.withOptions(queryOptions));
	const workspaceId = linkWorkspaceId?.trim() || activeWorkspaceId;
	const [options, setOptions] = React.useState<ChatLogImportOptions | null>(null);
	const [importing, setImporting] = React.useState(false);

	const query = useQuery({
		queryKey: ["chat-log-import", requestId, workspaceId],
		enabled: Boolean(requestId && workspaceId),
		retry: false,
		staleTime: Infinity,
		queryFn: async ({ signal }): Promise<ImportState> => {
			const { data } = await createClient().auth.getSession();
			const scope = toAccountQueryScope({ userId: data.session?.user.id ?? null, workspaceId });
			const result = await fetchPrivateUsageRequest(requestId!, scope, signal);
			const { request, ioLog } = result.data;
			if (!ioLog || ioLog.status !== "stored" || !ioLog.payload) {
				const reason = ioLog?.status === "too_large" ? "too_large" : ioLog?.status === "deleted" ? "deleted" : "not_stored";
				return { kind: "unavailable", reason };
			}
			const replay = readLogReplay({
				endpoint: request.endpoint,
				requestPayload: ioLog.payload.request_payload,
				gatewayResponse: ioLog.payload.gateway_response,
				model: request.model_id,
			});
			if (!replay) return { kind: "unavailable", reason: "unsupported" };
			return { kind: "ready", replay, provider: request.provider ?? null, loggedAt: request.created_at ?? null, workspaceId };
		},
	});

	const state = query.data;
	const ready = isReadyImport(state) ? state : null;
	const loggedModelId = ready?.replay.model ?? null;
	const modelAvailable = Boolean(loggedModelId && models.some((model) => model.modelId === loggedModelId));
	const modelId = modelAvailable && loggedModelId ? loggedModelId : fallbackModelId;

	// The user's choices, over defaults derived from the log until they change one.
	const chosen = options ?? (ready ? defaultChatLogImportOptions(ready.replay, modelId) : null);

	const close = () => {
		setOptions(null);
		void setRequestId(null);
		void setLinkWorkspaceId(null);
	};

	const confirm = async () => {
		if (!ready || !chosen || !requestId) return;
		setImporting(true);
		try {
			const thread = buildThreadFromLogReplay({
				replay: ready.replay,
				options: chosen,
				source: { requestId, workspaceId: ready.workspaceId, provider: ready.provider, loggedAt: ready.loggedAt },
				emptyTitle: tChat("defaultTitle"),
			});
			await onImport(thread);
			close();
		} finally {
			setImporting(false);
		}
	};

	if (!requestId) return null;
	const toggle = (key: keyof Omit<ChatLogImportOptions, "modelId">) => (checked: boolean) =>
		setOptions(chosen ? { ...chosen, [key]: checked } : null);
	const replay = ready?.replay;
	const responseTurns = replay ? replay.turns.length - replay.requestTurnCount : 0;
	const messageCount = replay
		? replay.turns.filter((turn) => turn.role !== "tool").length - (chosen?.includeResponse === false ? responseTurns : 0)
		: 0;

	return (
		<Dialog open onOpenChange={(open) => { if (!open) close(); }}>
			<DialogContent className="w-[calc(100vw-1rem)] max-w-lg">
				<DialogHeader className="space-y-2 text-left">
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>

				{!workspaceId ? (
					<p className="text-sm text-muted-foreground">{t("failed")}</p>
				) : query.isPending ? (
					<p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
						<LoaderCircle className="size-4 animate-spin" />
						{t("loading")}
					</p>
				) : query.isError ? (
					<p className="text-sm text-muted-foreground">{t("failed")}</p>
				) : state?.kind === "unavailable" ? (
					<p className="text-sm text-muted-foreground">{t(`unavailable.${state.reason}`)}</p>
				) : replay && chosen ? (
					<div className="space-y-4 text-sm">
						<div className="rounded-md border bg-muted/30 px-3 py-2">
							<p className="font-medium">{t("summary", { count: messageCount, model: modelId })}</p>
							{!modelAvailable && loggedModelId ? (
								<p className="mt-1 text-xs text-muted-foreground">
									{t("modelUnavailable", { model: loggedModelId, fallback: modelId })}
								</p>
							) : null}
						</div>

						<fieldset className="space-y-2">
							<legend className="mb-1 font-medium">{t("carryOver")}</legend>
							{ready?.provider ? (
								<Option checked={chosen.pinProvider} onChange={toggle("pinProvider")} label={t("options.pinProvider", { provider: ready.provider })} />
							) : null}
							<Option checked={chosen.keepParams} onChange={toggle("keepParams")} label={t("options.keepParams")} />
							{replay.systemPrompt ? (
								<Option checked={chosen.keepSystemPrompt} onChange={toggle("keepSystemPrompt")} label={t("options.keepSystemPrompt")} />
							) : null}
							{replay.serverTools.length > 0 ? (
								<Option checked={chosen.keepServerTools} onChange={toggle("keepServerTools")} label={t("options.keepServerTools")} />
							) : null}
							{replay.functionTools.length > 0 ? (
								<Option
									checked={chosen.keepFunctionTools}
									onChange={toggle("keepFunctionTools")}
									label={t("options.keepFunctionTools", { count: replay.functionTools.length })}
									hint={t("options.keepFunctionToolsHint")}
								/>
							) : null}
							{responseTurns > 0 ? (
								<Option checked={chosen.includeResponse} onChange={toggle("includeResponse")} label={t("options.includeResponse")} />
							) : null}
						</fieldset>

						{replay.warnings.length > 0 || (ready?.workspaceId && activeWorkspaceId && ready.workspaceId !== activeWorkspaceId) ? (
							<ul className="space-y-1.5 text-xs text-muted-foreground">
								{ready?.workspaceId && activeWorkspaceId && ready.workspaceId !== activeWorkspaceId ? (
									<Warning text={t("workspaceMismatch")} />
								) : null}
								{replay.warnings.map((warning: LogReplayWarningCode) => (
									<Warning key={warning} text={t(`warnings.${warning}`)} />
								))}
							</ul>
						) : null}
					</div>
				) : null}

				<DialogFooter>
					<Button className="w-full sm:w-auto" variant="ghost" onClick={close}>
						{t("cancel")}
					</Button>
					<Button className="w-full sm:w-auto" disabled={!ready || !chosen || importing} onClick={() => void confirm()}>
						{t("continue")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Option({ checked, onChange, label, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string }) {
	const id = React.useId();
	return (
		<div className="flex items-start gap-2">
			<Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
			<label htmlFor={id} className="space-y-0.5">
				<span className="block">{label}</span>
				{hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
			</label>
		</div>
	);
}

function Warning({ text }: { text: string }) {
	return (
		<li className="flex gap-1.5">
			<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
			<span>{text}</span>
		</li>
	);
}

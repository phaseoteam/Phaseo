import { ArrowDown, ArrowUp, ChevronRight, CircleDot, Eye, GitPullRequest, PencilLine, Plus, SquareTerminal, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { emptyRule, ruleMatches } from "../../../shared/factory/intake";
import { ASK_ROUNDS } from "../../../shared/factory/report";
import { defaultBrief, stageBrief, stageLabel, stagePrompt, stagesFor, type StageAccess } from "../../../shared/factory/stages";
import type { FactorySettings, FactorySnapshot, Playbook, PlaybookRule, StageId, WorkItem, WorkKind } from "../../../shared/factory/types";
import { AgentPicker } from "../components/AgentPicker";
import { Field, Group, Row, SettingsPage, TextBox, Toggle } from "../components/Settings";
import { Button } from "../../components/ui/button";
import { factory, useItemBody } from "../lib/useFactory";
import { cn } from "../../lib/utils";

const KINDS: { id: WorkKind; label: string; noun: string; one: string; icon: typeof CircleDot }[] = [
	{ id: "issue", label: "Issues", noun: "issue", one: "An issue", icon: CircleDot },
	{ id: "pull", label: "Pull requests", noun: "pull request", one: "A pull request", icon: GitPullRequest },
];

const ACCESS: Record<StageAccess, { icon: typeof Eye; label: string }> = {
	read: { icon: Eye, label: "Read only" },
	run: { icon: SquareTerminal, label: "Runs commands, can't edit" },
	write: { icon: PencilLine, label: "Can edit files" },
};

const splitLabels = (text: string) => text.split(",").map((label) => label.trim()).filter(Boolean);

/** How Factory handles one kind of item: how it hands off, which agents and rules, and what it tells the agent. Nothing runs until a person starts it. */
export function PlaybookSettings({ snapshot, kind: kindId }: { snapshot: FactorySnapshot; kind: WorkKind }) {
	const kind = KINDS.find((entry) => entry.id === kindId) ?? KINDS[0];
	const updateSettings = (patch: Partial<FactorySettings>) => void factory().updateSettings(patch);
	const playbook = snapshot.settings.playbooks[kind.id];
	const stages = stagesFor({ kind: kind.id });
	const sample = snapshot.items.filter((item) => item.kind === kind.id && item.state !== "merged" && item.state !== "closed").sort((a, b) => b.createdAt - a.createdAt)[0];
	const sampleBody = useItemBody(sample);
	const [preview, setPreview] = useState(false);
	const [openRule, setOpenRule] = useState<string | null>(null);

	const save = (patch: Partial<Playbook>) => void factory().updateSettings({ playbooks: { ...snapshot.settings.playbooks, [kind.id]: { ...playbook, ...patch } } });
	const saveBrief = (stage: StageId, text: string) => {
		const briefs = { ...playbook.briefs };
		if (text.trim() && text.trim() !== defaultBrief(stage)) briefs[stage] = text.trim();
		else delete briefs[stage];
		save({ briefs });
	};

	return <SettingsPage title={kind.id === "issue" ? "Issue playbook" : "Pull request playbook"} description={kind.id === "issue" ? "What every stage on an issue has to show, which agents run it, what they're told, and how a fix becomes a pull request." : "Who reviews a pull request, what every stage has to show, which agents run it and what they're told."}>


			{kind.id === "pull" && <Group title="Review">
				<Row title="Independent review" description="Review uses a different harness from the one that wrote the fix, so one model checks another. A Review model pinned under Agents and rules wins.">
					<Toggle label="Independent review" on={snapshot.settings.independentReview} onChange={(independentReview) => updateSettings({ independentReview })} />
				</Row>
				<Row title="Ask before merging" description="Agents open and update pull requests. Merging is always yours.">
					<Toggle label="Ask before merging" on onChange={() => undefined} />
				</Row>
			</Group>}

			{<Group title="Proof" description="Every stage has to show its result: screenshots, recordings or the output of what it ran.">
				<Row title="Require proof" description="A stage that ends without screenshots, recordings or command output waits for you instead of moving on.">
					<Toggle label="Require proof" on={playbook.requireProof} onChange={(requireProof) => save({ requireProof })} />
				</Row>
			</Group>}

			{kind.id === "issue" && <Group title="Pull request" description="A fix that passes becomes a draft pull request, and the pull request playbook takes it from there.">
				<Row title="Open a pull request when Fix passes" description={playbook.openPullRequest ? "Pushes the fix branch and opens a draft with the proof in its description." : "The issue waits with an Open a draft pull request button."}>
					<Toggle label="Open a pull request when Fix passes" on={playbook.openPullRequest} onChange={(openPullRequest) => save({ openPullRequest })} />
				</Row>
			</Group>}

			{<Group title="Back to GitHub" description={kind.id === "issue" ? "What Factory says on the issue." : "What Factory says on the pull request."}>
				{kind.id === "issue" && <Row title="Ask the reporter for missing details" description={playbook.askReporter ? `When Triage needs more information or Reproduce can't make it happen, Factory comments on the issue with exactly what's missing, up to ${ASK_ROUNDS} times. When they answer, the stage is ready to run again with their reply.` : "The issue waits for you with an Ask the reporter button."}>
					<Toggle label="Ask the reporter for missing details" on={playbook.askReporter} onChange={(askReporter) => save({ askReporter })} />
				</Row>}
				<Row title={kind.id === "issue" ? "Post Triage to GitHub" : "Post reports to GitHub"} description={kind.id === "issue" ? "Comments with Triage's reading, so the reporter sees it. Off: a button on the issue posts it." : "Comments with each Review and Verify report and its proof as soon as it finishes. Off: a button on the pull request posts it."}>
					<Toggle label="Post reports to GitHub" on={playbook.postReports} onChange={(postReports) => save({ postReports })} />
				</Row>
			</Group>}

			{<Group title="Default agent" description={`Runs ${kind.label.toLowerCase()} that have no agent of their own. Stages and rules below can choose differently.`}>
				<Row title="Agent" description="Review goes to a different model when independent review is on.">
					<AgentPicker snapshot={snapshot} value={playbook.agentId} allowNone placeholder="First connected" noneLabel="The first connected agent" onChange={(agentId) => save({ agentId: agentId ?? undefined })} />
				</Row>
			</Group>}

			{<Group title="Models by stage" description={`Pin a model to a stage for every ${kind.noun}. Unpinned stages use the agent on the item.`}>
				{stages.map((stage) => <Row key={stage.id} title={stage.label} description={playbook.stageAgents[stage.id] ? stage.output : stage.id === "review" && snapshot.settings.independentReview ? "A different model from the one that wrote the fix" : "The item's agent"}>
					<AgentPicker snapshot={snapshot} value={playbook.stageAgents[stage.id]} allowNone placeholder="Item's agent" noneLabel="Use the item's agent" onChange={(agentId) => {
						const stageAgents = { ...playbook.stageAgents };
						if (agentId) stageAgents[stage.id] = agentId;
						else delete stageAgents[stage.id];
						save({ stageAgents });
					}} />
				</Row>)}
			</Group>}

			{<Group title="Rules" description={`Checked top to bottom. The first rule that matches ${kind.one.toLowerCase()} decides its agents and what extra instructions it gets.`}>
				{playbook.rules.map((rule, index) => <RuleRow key={rule.id} rule={rule} index={index} count={playbook.rules.length} kind={kind.id} snapshot={snapshot} open={openRule === rule.id} onToggle={() => setOpenRule(openRule === rule.id ? null : rule.id)} onChange={(next) => save({ rules: playbook.rules.map((entry) => (entry.id === rule.id ? next : entry)) })} onMove={(offset) => {
					const rules = [...playbook.rules];
					rules.splice(index + offset, 0, ...rules.splice(index, 1));
					save({ rules });
				}} onDelete={() => save({ rules: playbook.rules.filter((entry) => entry.id !== rule.id) })} />)}
				<div className="flex items-center gap-3 px-4 py-3">
					<Button variant="outline" size="sm" onClick={() => {
						const rule = emptyRule(`rule-${Date.now().toString(36)}`);
						save({ rules: [...playbook.rules, rule] });
						setOpenRule(rule.id);
					}}><Plus className="size-3.5" />Add rule</Button>
					{!playbook.rules.length && <span className="text-xs text-muted-foreground">For example: send docs issues to a cheaper model, or keep billing on your best one.</span>}
				</div>
			</Group>}

			{<Group title="Instructions" description={<>Sent to the agent ahead of every stage on {kind.one.toLowerCase()}. The agent reads the repository&apos;s AGENTS.md or CLAUDE.md anyway, so keep this to what&apos;s specific to {kind.label.toLowerCase()}.</>}>
				<div>
					<TextBox value={playbook.instructions} rows={7} className="rounded-md border-0 px-4 py-3" placeholder={kind.id === "pull" ? "For example: correctness first, every finding needs a file and line, say \"No findings\" when there are none." : "For example: keep fixes small, ship SQL as new migrations, open a draft pull request."} onSave={(instructions) => save({ instructions })} />
				</div>
			</Group>}

			{<Group title="Stages" description="What each stage asks for. Edit one to replace the default; clear it to go back. Every stage also gets the proof rules, which you can see in the preview.">
				{stages.map((stage, index) => {
					const edited = Boolean(playbook.briefs[stage.id]);
					return <div key={stage.id} className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 px-4 py-3.5">
						<div>
							<div className="flex items-center gap-2 text-sm font-semibold"><span className="text-muted-foreground tabular-nums">{index + 1}</span>{stage.label}</div>
							<div className="mt-0.5 text-2xs text-muted-foreground">{stage.output}</div>
							{(() => {
								const access = ACCESS[stage.access];
								return <div className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground"><access.icon className="size-3" />{access.label}</div>;
							})()}
						</div>
						<div>
							<TextBox value={stageBrief(stage.id, playbook)} rows={4} onSave={(text) => saveBrief(stage.id, text)} />
							{edited && <div className="mt-1.5 flex items-center gap-2 text-2xs text-muted-foreground">Edited<button type="button" className="text-foreground hover:underline" onClick={() => saveBrief(stage.id, "")}>Use the default</button></div>}
						</div>
					</div>;
				})}
			</Group>}

			{sample && <Group title="Preview" description={`The full prompt the agent gets for #${sample.number} at ${stageLabel(stages[0].id)}.`}>
				<Row title={sample.title} description={preview ? "Instructions first, then the item, the stage's brief and the proof rules." : "Check that your instructions read the way you expect."}>
					<Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "Hide" : "Show prompt"}</Button>
				</Row>
				{preview && <pre data-selectable className="max-h-[420px] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/85">{stagePrompt({ ...sample, body: sampleBody ?? "" }, stages[0].id, playbook)}</pre>}
			</Group>}
	</SettingsPage>;
}

const PRIORITIES: { id: WorkItem["priority"]; label: string }[] = [
	{ id: "urgent", label: "Urgent" },
	{ id: "high", label: "High" },
	{ id: "normal", label: "Normal" },
	{ id: "low", label: "Low" },
];

const list = (values: string[]) => (values.length > 2 ? `${values.slice(0, -1).join(", ")} or ${values.at(-1)}` : values.join(" or "));

/** One line saying what a rule matches and what it changes. */
function describeRule(rule: PlaybookRule, snapshot: FactorySnapshot): { when: string; then: string } {
	const agent = (id?: string) => snapshot.agents.find((candidate) => candidate.id === id)?.label ?? id;
	const when = [
		rule.match.labels.length && `labelled ${list(rule.match.labels)}`,
		rule.match.priorities.length && `${list(rule.match.priorities)} priority`,
		rule.match.authors.length && `opened by ${list(rule.match.authors)}`,
		rule.match.minLines !== undefined && `${rule.match.minLines.toLocaleString("en-US")}+ changed lines`,
		rule.match.maxLines !== undefined && `up to ${rule.match.maxLines.toLocaleString("en-US")} changed lines`,
	].filter(Boolean).join(", ");
	const then = [
		rule.agentId && agent(rule.agentId),
		...Object.entries(rule.stageAgents).map(([stage, id]) => `${stageLabel(stage as StageId)} on ${agent(id)}`),
		rule.instructions.trim() && "extra instructions",
	].filter(Boolean).join(", ") || "no changes yet";
	return { when: when ? `When ${when}` : "Every item", then };
}

function Line({ label, children }: { label: string; children: ReactNode }) {
	return <>
		<span className="pt-1.5 text-xs text-muted-foreground">{label}</span>
		<div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
	</>;
}

function RuleRow({ rule, index, count, kind, snapshot, open, onToggle, onChange, onMove, onDelete }: {
	rule: PlaybookRule; index: number; count: number; kind: WorkKind; snapshot: FactorySnapshot; open: boolean;
	onToggle: () => void; onChange: (rule: PlaybookRule) => void; onMove: (offset: number) => void; onDelete: () => void;
}) {
	const { when, then } = describeRule(rule, snapshot);
	const matches = snapshot.items.filter((item) => item.kind === kind && item.state !== "merged" && item.state !== "closed" && ruleMatches(item, rule.match)).length;
	const stages = stagesFor({ kind });
	const match = (patch: Partial<PlaybookRule["match"]>) => onChange({ ...rule, match: { ...rule.match, ...patch } });
	const lines = (text: string) => (text.trim() === "" ? undefined : Math.max(0, Math.round(Number(text))) || 0);
	return <div>
		<button type="button" data-rule={rule.id} onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40">
			<span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 text-sm font-medium">{rule.name}</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">{when} → {then}</div>
			</div>
			<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{matches} open</span>
			<ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
		</button>
		{open && <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3 border-t bg-muted/20 py-4 pr-4 pl-11">
			<Line label="Name"><Field value={rule.name} placeholder="Rule name" className="w-64" onSave={(name) => onChange({ ...rule, name: name || "Untitled rule" })} /></Line>
			<span className="col-span-2 mt-1 text-xs font-semibold">When</span>
			<Line label="Labels"><Field value={rule.match.labels.join(", ")} placeholder="Any label" className="w-64" onSave={(text) => match({ labels: splitLabels(text) })} /></Line>
			<Line label="Priority">{PRIORITIES.map((priority) => {
				const on = rule.match.priorities.includes(priority.id);
				return <button key={priority.id} type="button" aria-pressed={on} onClick={() => match({ priorities: on ? rule.match.priorities.filter((id) => id !== priority.id) : [...rule.match.priorities, priority.id] })} className={cn("h-7 rounded-md border px-2.5 text-xs", on ? "border-foreground/30 bg-foreground text-background" : "hover:bg-accent/60")}>{priority.label}</button>;
			})}{!rule.match.priorities.length && <span className="text-2xs text-muted-foreground">Any priority</span>}</Line>
			<Line label="Opened by"><Field value={rule.match.authors.join(", ")} placeholder="Anyone" className="w-64" onSave={(text) => match({ authors: splitLabels(text) })} /></Line>
			{kind === "pull" && <Line label="Size">
				<Field value={rule.match.minLines?.toString() ?? ""} placeholder="Min" className="w-24 tabular-nums" onSave={(text) => match({ minLines: lines(text) })} />
				<span className="text-xs text-muted-foreground">to</span>
				<Field value={rule.match.maxLines?.toString() ?? ""} placeholder="Max" className="w-24 tabular-nums" onSave={(text) => match({ maxLines: lines(text) })} />
				<span className="text-xs text-muted-foreground">changed lines</span>
			</Line>}
			<span className="col-span-2 mt-1 text-xs font-semibold">Then</span>
				<Line label="Agent"><AgentPicker snapshot={snapshot} value={rule.agentId} allowNone placeholder="Playbook's agent" noneLabel="Use the playbook's agent" onChange={(agentId) => onChange({ ...rule, agentId: agentId ?? undefined })} /></Line>
				{stages.map((stage) => <Line key={stage.id} label={stage.label}>
					<AgentPicker snapshot={snapshot} value={rule.stageAgents[stage.id]} allowNone placeholder="Same as above" noneLabel="Same as the rule's agent" onChange={(agentId) => {
						const stageAgents = { ...rule.stageAgents };
						if (agentId) stageAgents[stage.id] = agentId;
						else delete stageAgents[stage.id];
						onChange({ ...rule, stageAgents });
					}} />
				</Line>)}
				<Line label="Instructions"><TextBox value={rule.instructions} rows={3} placeholder="Added after the playbook's instructions" onSave={(instructions) => onChange({ ...rule, instructions })} /></Line>
			<div className="col-span-2 mt-1 flex items-center gap-1">
				<Button variant="ghost" size="xs" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="size-3" />Up</Button>
				<Button variant="ghost" size="xs" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="size-3" />Down</Button>
				<span className="flex-1" />
				<Button variant="ghost" size="xs" className="text-destructive" onClick={onDelete}><Trash2 className="size-3" />Delete rule</Button>
			</div>
		</div>}
	</div>;
}

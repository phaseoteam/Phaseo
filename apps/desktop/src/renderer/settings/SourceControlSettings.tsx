import { useEffect, useState } from "react";
import { branchPrefixProblem, instructionsLimit, normalizeBranchPrefix, type BranchNaming, type SourceControlPreferences, type WorktreeSubmodules } from "../../shared/sourceControlPreferences";
import type { WorkspacePreferences } from "../../shared/preferences";
import { errorText } from "../app/workspace";
import { cn } from "../lib/utils";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { ModelPicker } from "../chat/ModelPicker";
import { mergeMethodLabels } from "../views/pullRequests/pullRequestLogic";
import { usePreferences } from "./GeneralSettings";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";
import { WorktreeCleanupSettings } from "./WorktreeCleanupSettings";
import { MarkdownTextarea } from "../components/MarkdownTextarea";

type Save = (value: WorkspacePreferences) => Promise<void>;
type Props = { preferences: WorkspacePreferences; save: Save; disabled: boolean };
const patch = (preferences: WorkspacePreferences, change: Partial<SourceControlPreferences>): WorkspacePreferences => ({ ...preferences, sourceControl: { ...preferences.sourceControl, ...change } });

/** Loading and save errors, under the section that shows them. */
function Status({ loading, error }: { loading: boolean; error: string }) {
	return (loading || error) ? <SettingsNote tone={error ? "error" : "muted"} role={error ? "alert" : "status"}>{error || "Loading settings…"}</SettingsNote> : null;
}

/** A folder chosen with the system's folder dialog, with Default to go back to the built-in one. */
function FolderRow({ title, description, purpose, value, empty, onChange, disabled }: { title: string; description: string; purpose: "worktrees" | "add-project"; value: string | null; empty: string; onChange: (value: string | null) => void; disabled: boolean }) {
	const [error, setError] = useState("");
	const choose = async () => {
		setError("");
		try { const folder = await window.phaseoDesktop?.workspace.chooseSettingsFolder(purpose); if (folder) onChange(folder); }
		catch (reason) { setError(errorText(reason)); }
	};
	return <>
		<SettingsRow title={title} description={<>{description} <span className="break-all text-foreground/80">{value ?? empty}</span></>}
			control={<>
				{value && <SettingsButton variant="ghost" disabled={disabled} onClick={() => onChange(null)}>Use default</SettingsButton>}
				<SettingsButton disabled={disabled} onClick={() => void choose()}>Choose folder…</SettingsButton>
			</>} />
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</>;
}

/** Multi-line instructions saved when the field loses focus, so typing is not a save per key. */
function InstructionsRow({ title, description, placeholder, value, onSave, disabled }: { title: string; description: string; placeholder: string; value: string; onSave: (value: string) => void; disabled: boolean }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => { setDraft(value); }, [value]);
	return <SettingsRow title={title} description={description} control={draft.trim() !== value ? <span className="text-xs text-muted-foreground">Saves when you leave the field</span> : undefined}>
		<MarkdownTextarea aria-label={title} value={draft} disabled={disabled} rows={4} placeholder={placeholder} maxLength={instructionsLimit}
			onChange={event => setDraft(event.target.value)} onBlur={() => { const next = draft.trim(); if (next !== value) onSave(next); }}
			className={cn(settingsInput, "h-auto min-h-24 resize-y py-2 leading-relaxed")} />
		{draft.length > instructionsLimit * 0.9 && <span className="text-xs text-muted-foreground">{draft.length.toLocaleString("en-US")} of {instructionsLimit.toLocaleString("en-US")} characters</span>}
	</SettingsRow>;
}

/** A Phaseo model for one kind of text, or none to use the title model, picked like the title model in General. */
function ModelRow({ title, description, fallback, value, onChange, disabled }: { title: string; description: string; fallback: string; value: string | null; onChange: (value: string | null) => void; disabled: boolean }) {
	const [error, setError] = useState("");
	return <>
		<SettingsRow title={title} description={value ? description : `${description} ${fallback}`}
			control={<div className="flex items-center gap-1.5">
				<ModelPicker disabled={disabled} selections={value ? [{ harness: "phaseo", model: value }] : []}
					onChange={values => { const next = values[0]; if (!next) return; if (next.harness !== "phaseo") { setError("Choose a Phaseo model: this text is written through your Phaseo account."); return; } setError(""); onChange(next.model); }} />
				{value && <SettingsButton variant="ghost" disabled={disabled} onClick={() => onChange(null)}>Clear</SettingsButton>}
			</div>} />
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</>;
}

/** Search words for Settings → Source control. */
export const sourceControlSettingsKeywords = "source control git github pull request pr merge method squash rebase default template pull_request_template description body title commit message writing instructions custom prompt style conventions review guide guided review tour model writer title model chat titles thread titles naming add project open project folder start directory clone base path";

/** Settings → Source control: how pull requests merge and are written, the instructions and models for generated text, and where Add project opens. */
export function SourceControlSettings() {
	const { preferences, loading, busy, error, save, ready } = usePreferences();
	const disabled = !ready || busy, sourceControl = preferences.sourceControl;
	const set = (change: Partial<SourceControlPreferences>) => void save(patch(preferences, change));
	const titleFallback = preferences.titleModel ? "Without one, the title model writes it." : "Without one, the title model writes it; choose a title model in General, or one here.";
	return <SettingsPageLayout title="Source control">
		<SettingsSection title="Pull requests" label="Pull requests">
			<SettingsRow title="Default merge method" description="Pull requests start with this method. Last selected reuses whatever you chose most recently on this device. Each project can change this in its Project settings."
				control={<Select label="Default pull request merge method" disabled={disabled} value={preferences.pullRequestMergeMethod ?? "last"} onValueChange={value => void save({ ...preferences, pullRequestMergeMethod: value === "merge" || value === "squash" || value === "rebase" ? value : null })}
					options={[{ value: "last", label: "Last selected" }, { value: "merge", label: mergeMethodLabels.merge }, { value: "squash", label: mergeMethodLabels.squash }, { value: "rebase", label: mergeMethodLabels.rebase }]} />} />
			<SettingsRow title="Follow the repository's pull request template" description="When a model writes a pull request description, it fills in the repository's template if it has one, such as .github/pull_request_template.md. Turn off to use a summary and a list of changes instead."
				control={<Switch aria-label="Follow the repository's pull request template" disabled={disabled} checked={sourceControl.followPullRequestTemplate} onCheckedChange={value => set({ followPullRequestTemplate: value })} />} />
			<Status loading={loading} error={error} />
		</SettingsSection>
		<SettingsSection title="Writing instructions" description="Added to the prompts as your preferences. They change the wording, not the format Phaseo needs back." label="Writing instructions">
			<InstructionsRow title="Chat titles" description="For the title model when it names a chat." placeholder="For example: start with the area of the app, such as Billing: refund emails." disabled={disabled} value={sourceControl.titleInstructions} onSave={value => set({ titleInstructions: value })} />
			<InstructionsRow title="Commit messages and pull requests" description="For commit messages, and pull request titles and descriptions." placeholder="For example: use Conventional Commits. Keep pull request descriptions to a few bullet points." disabled={disabled} value={sourceControl.writingInstructions} onSave={value => set({ writingInstructions: value })} />
			<InstructionsRow title="Review guides" description="What a review guide should show first, dwell on or skip. Its format and coverage stay the same." placeholder="For example: show interfaces before implementations. Skip test files unless they change behaviour." disabled={disabled} value={sourceControl.reviewGuideInstructions} onSave={value => set({ reviewGuideInstructions: value })} />
		</SettingsSection>
		<SettingsSection title="Models" description="Phaseo models, used through your Phaseo account." label="Source control models">
			<ModelRow title="Commits and pull requests" description="Writes commit messages, pull request titles and descriptions, and new worktree branch names." fallback={titleFallback} disabled={disabled} value={sourceControl.gitModel} onChange={value => set({ gitModel: value })} />
			<ModelRow title="Review guides" description="Reads a pull request to write its review guide. A stronger model helps with large changes." fallback={titleFallback} disabled={disabled} value={sourceControl.reviewGuideModel} onChange={value => set({ reviewGuideModel: value })} />
		</SettingsSection>
		<SettingsSection title="Projects" label="Projects">
			<FolderRow title="Add project opens in" description="The folder the Add project and clone dialogs start in." purpose="add-project" empty="The system's choice" disabled={disabled} value={sourceControl.addProjectDirectory} onChange={value => set({ addProjectDirectory: value })} />
			<SettingsRow title="Clone into host and owner folders" description="Clones go to <folder>/<host>/<owner>/<repository>, such as github.com/acme/app, instead of straight into the folder you choose."
				control={<Switch aria-label="Clone into host and owner folders" disabled={disabled} checked={sourceControl.cloneByHost} onCheckedChange={cloneByHost => set({ cloneByHost })} />} />
		</SettingsSection>
	</SettingsPageLayout>;
}

const namingOptions: { value: BranchNaming; label: string }[] = [{ value: "static", label: "Prefix and a short name" }, { value: "semantic", label: "Type prefix" }, { value: "custom", label: "Custom instructions" }];
const namingText: Record<BranchNaming, string> = {
	static: "New worktree branches get your prefix and a short name from the first message, such as phaseo/add-search.",
	semantic: "The model picks a prefix that describes the work, such as feat/add-search, fix/login-timeout or refactor/auth.",
	custom: "The model follows your instructions and returns the whole branch name; nothing is added to it.",
};
const submoduleOptions: { value: WorktreeSubmodules; label: string }[] = [{ value: "recursive", label: "All, including nested" }, { value: "top-level", label: "Top level only" }, { value: "none", label: "Skip" }];
const submoduleText: Record<WorktreeSubmodules, string> = {
	recursive: "New worktrees check out every submodule, and the submodules inside them.",
	"top-level": "New worktrees check out only the submodules the repository declares itself. Faster when they nest many more.",
	none: "New worktrees leave submodules empty, for a setup action to fill in.",
};

/** The branch prefix, saved when the field loses focus and only when Git would accept it. */
function BranchPrefixRow({ preferences, save, disabled }: Props) {
	const { branchPrefix, branchNaming } = preferences.sourceControl;
	const [draft, setDraft] = useState(branchPrefix);
	useEffect(() => { setDraft(branchPrefix); }, [branchPrefix]);
	const problem = branchPrefixProblem(draft.trim()), example = `${normalizeBranchPrefix(draft) ? `${normalizeBranchPrefix(draft)}/` : ""}add-search`;
	return <>
		<SettingsRow title="Branch prefix" description={branchNaming === "static" ? `Put before each new branch name: ${example}. Leave empty for no prefix.` : `Used when no model names the branch, as in ${example}, and for agents' worktrees. Leave empty for no prefix.`}
			control={<input aria-label="Branch prefix" value={draft} disabled={disabled} placeholder="No prefix" spellCheck={false} autoCapitalize="none"
				onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
				onBlur={() => { const next = normalizeBranchPrefix(draft); if (!problem && next !== branchPrefix) void save(patch(preferences, { branchPrefix: next })); }}
				className={cn(settingsInput, "w-44")} />} />
		{problem && <SettingsNote tone="error" role="alert">{problem}</SettingsNote>}
	</>;
}

/** Search words for Settings → Worktrees. */
export const worktreeSettingsKeywords = "worktrees worktree location folder directory path drive disk storage branch naming prefix name semantic feat fix conventional custom instructions submodules submodule recursive nested top level skip git cleanup clean up remove delete inactive settled merged unchanged orphaned automatic";

/** Settings → Worktrees: where new worktrees go, their submodules and branch names, and cleanup. */
export function WorktreeSettings() {
	const { preferences, loading, busy, error, save, ready } = usePreferences();
	const disabled = !ready || busy, sourceControl = preferences.sourceControl;
	const set = (change: Partial<SourceControlPreferences>) => void save(patch(preferences, change));
	return <SettingsPageLayout title="Worktrees">
		<SettingsSection title="Creation" label="Worktree creation">
			<FolderRow title="Worktree location" description="The folder new worktrees are made in, on any drive. Existing worktrees stay where they are and can still be removed." purpose="worktrees" empty="The worktrees folder in Phaseo's data folder" disabled={disabled} value={sourceControl.worktreeDirectory} onChange={value => set({ worktreeDirectory: value })} />
			<SettingsRow title="Submodules" description={submoduleText[sourceControl.submodules]}
				control={<Select label="Worktree submodules" disabled={disabled} value={sourceControl.submodules} onValueChange={value => set({ submodules: value as WorktreeSubmodules })} options={submoduleOptions} />} />
			<Status loading={loading} error={error} />
		</SettingsSection>
		<SettingsSection title="Branches" description="Branches for new worktree chats are named from the first message, by the commits and pull requests model (Source control) or the title model. Without either, the first words name it." label="Worktree branches">
			<SettingsRow title="Branch naming" description={namingText[sourceControl.branchNaming]}
				control={<Select label="Worktree branch naming" disabled={disabled} value={sourceControl.branchNaming} onValueChange={value => set({ branchNaming: value as BranchNaming })} options={namingOptions} />} />
			<BranchPrefixRow preferences={preferences} save={save} disabled={disabled} />
			{sourceControl.branchNaming === "custom" && <InstructionsRow title="Branch naming instructions" description="Added to the naming prompt. The model returns the complete branch name." placeholder="For example: use my initials, then the issue ID and a short description, such as db/pha-123-fix-login." disabled={disabled} value={sourceControl.branchInstructions} onSave={value => set({ branchInstructions: value })} />}
		</SettingsSection>
		<WorktreeCleanupSettings preferences={preferences} save={save} disabled={disabled} />
	</SettingsPageLayout>;
}

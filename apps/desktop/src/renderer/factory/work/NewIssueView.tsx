import { ArrowUpRight, Check, CircleDot, ImagePlus, ListChecks, Search, X } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { IMAGE_TYPES, imageProblem } from "../../../shared/factory/attachments";
import { agentForStage } from "../../../shared/factory/intake";
import { emptyStages } from "../../../shared/factory/stages";
import type { FactorySnapshot, NewIssueInput, WorkItem } from "../../../shared/factory/types";
import { AgentPicker } from "../components/AgentPicker";
import { RepoPicker } from "../components/RepoPicker";
import { Button } from "../../components/ui/button";
import { Kbd } from "../../components/ui/kbd";
import { ScrollArea } from "../../components/ui/scroll-area";
import { factory, useFactoryNav } from "../lib/useFactory";
import { FactoryLink } from "../components/FactoryLink";
import { cn } from "../../lib/utils";
import { errorText } from "../components/AddRepo";

const MODES: { value: NewIssueInput["mode"]; label: string; detail: string; icon: typeof Search }[] = [
	{ value: "triage", label: "Triage it now", detail: "An agent reads the code and writes a plan, then waits for you to start the next stage.", icon: Search },
	{ value: "log", label: "Just log it", detail: "Goes on GitHub. Nothing runs until you start it.", icon: CircleDot },
];


/** Write an issue for the agents: what's wrong, and what proof would show it's fixed. */
export function NewIssueView({ snapshot }: { snapshot: FactorySnapshot }) {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [doneWhen, setDoneWhen] = useState("");
	const [labels, setLabels] = useState("bug");
	const [mode, setMode] = useState<NewIssueInput["mode"]>("triage");
	// The agent the issue playbook would pick, until someone chooses another.
	const [repo, setRepo] = useState(() => snapshot.settings.showRepo || snapshot.settings.repos[0]?.repo || "");
	const draft: WorkItem = { id: "new", source: "github", repo, number: 0, kind: "issue", state: "open", title, body, author: { login: "you" }, labels: [], url: "", createdAt: 0, updatedAt: 0, comments: 0, priority: "normal", stages: emptyStages() };
	const [agentId, setAgentId] = useState<string | undefined>(() => agentForStage(draft, "triage", snapshot.settings.playbooks.issue) ?? snapshot.agents[0]?.id);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const images = useImages(setError);
	const { go } = useFactoryNav();

	const submit = () => {
		if (!title.trim() || busy) return;
		setBusy(true);
		setError(null);
		void Promise.all(images.list.map(async ({ file }) => ({ name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) })))
			.then((uploads) => factory().createIssue({ repo, title, body, doneWhen, labels: labels.split(",").map((label) => label.trim()).filter(Boolean), images: uploads, agentId, mode }))
			.then((id) => go({ item: id }))
			.catch((cause: unknown) => setError(errorText(cause)))
			.finally(() => setBusy(false));
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			submit();
		}
	};
	const field = "block w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-ring";

	return <ScrollArea className="min-h-0 flex-1">
		<div className="mx-auto max-w-[760px] px-8 pt-6 pb-16" onKeyDown={onKey} onPaste={images.onPaste}>
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<RepoPicker snapshot={snapshot} value={repo} onChange={setRepo} className="-ml-2 px-1.5 text-xs" />
				<span className="text-muted-foreground/40">/</span>
				<span>New issue</span>
			</div>

			<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What's wrong?" aria-label="Title" className="mt-5 w-full bg-transparent text-[26px] leading-tight font-bold tracking-tight outline-none placeholder:text-muted-foreground/50" />

			<label className="mt-6 block">
				<span className="mb-1.5 block text-sm font-semibold">Details</span>
				<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder={"Where it happens, the steps to see it, what you expected and what you got.\nPaste errors and logs as they are."} className={cn(field, "resize-y")} />
			</label>

			<ImagesField images={images} github={snapshot.github} />

			<label className="mt-6 block">
				<span className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="size-4 text-muted-foreground" />Done when</span>
				<span className="mb-1.5 block text-xs text-muted-foreground">One point per line. Fix and Verify have to prove each one with a screenshot, a recording or command output.</span>
				<textarea value={doneWhen} onChange={(event) => setDoneWhen(event.target.value)} rows={4} placeholder={"The billing page shows $12.50, not US$12.50\nA test covers en-GB formatting"} className={cn(field, "resize-y font-mono text-[13px]")} />
			</label>

			<div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-4">
				<label className="block">
					<span className="mb-1.5 block text-sm font-semibold">Labels</span>
					<input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="bug, web" className={cn(field, "h-9 py-0")} />
				</label>
				<div>
					<span className="mb-1.5 block text-sm font-semibold">Agent</span>
					<AgentPicker snapshot={snapshot} value={agentId} onChange={(next) => setAgentId(next ?? undefined)} />
				</div>
			</div>

			<fieldset className="mt-6">
				<legend className="mb-1.5 text-sm font-semibold">Then</legend>
				<div role="radiogroup" className="flex flex-col gap-1">
					{MODES.map((option) => <button key={option.value} type="button" role="radio" aria-checked={mode === option.value} onClick={() => setMode(option.value)} className={cn("flex w-full items-start gap-3 rounded-md px-3.5 py-3 text-left", mode === option.value ? "bg-accent/70" : "hover:bg-accent/40")}>
						<span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border", mode === option.value && "border-foreground bg-foreground text-background")}>{mode === option.value && <Check className="size-3" />}</span>
						<span className="min-w-0">
							<span className="flex items-center gap-1.5 text-sm font-medium"><option.icon className="size-3.5 text-muted-foreground" />{option.label}</span>
							<span className="mt-0.5 block text-xs text-muted-foreground">{option.detail}</span>
						</span>
					</button>)}
				</div>
			</fieldset>

			{error && <p className="mt-4 border-l-2 border-destructive pl-3 text-sm text-destructive">{error}</p>}

			<div className="mt-6 flex items-center gap-3">
				<Button disabled={!title.trim() || busy || !repo} onClick={submit}>
					{busy ? "Opening the issue…" : mode === "triage" ? "Open issue and triage it" : "Open issue"}<ArrowUpRight className="size-3.5 opacity-70" />
				</Button>
				<span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Kbd>Ctrl Enter</Kbd>Opens it on GitHub as you, through gh</span>
				<span className="flex-1" />
				<FactoryLink to={{}} className="text-sm text-muted-foreground hover:text-foreground">Cancel</FactoryLink>
			</div>
		</div>
	</ScrollArea>;
}

interface PickedImage {
	id: number;
	file: File;
	url: string;
}

/** A picked file as a data: URL, which the window's content policy lets an image show. */
const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
	const reader = new FileReader();
	reader.onload = () => resolve(String(reader.result));
	reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the image."));
	reader.readAsDataURL(file);
});

/** Images waiting to go with the issue: pasted, dropped or picked, each with a preview. */
export function useImages(onError: (message: string | null) => void) {
	const [list, setList] = useState<PickedImage[]>([]);
	const next = useRef(1);

	const add = (files: Iterable<File>) => {
		const added: PickedImage[] = [];
		for (const file of files) {
			const problem = imageProblem({ type: file.type, size: file.size }, list.length + added.length);
			if (problem) {
				onError(`${file.name || "That image"}: ${problem}`);
				continue;
			}
			added.push({ id: next.current++, file, url: "" });
		}
		if (!added.length) return;
		onError(null);
		void Promise.all(added.map(async (image) => ({ ...image, url: await readDataUrl(image.file) })))
			.then((read) => setList((current) => [...current, ...read]), (cause: unknown) => onError(errorText(cause)));
	};
	const remove = (id: number) => setList((current) => current.filter((image) => image.id !== id));
	// Pasting text still pastes text; only images are taken.
	const onPaste = (event: ClipboardEvent) => {
		const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
		if (!files.length) return;
		event.preventDefault();
		add(files);
	};
	return { list, add, remove, onPaste };
}

function ImagesField({ images, github }: { images: ReturnType<typeof useImages>; github: FactorySnapshot["github"] }) {
	const input = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		setOver(false);
		images.add(event.dataTransfer.files);
	};
	return <div className="mt-6">
		<span className="mb-1 block text-sm font-semibold">Images</span>
		<span className="mb-1.5 block text-xs text-muted-foreground">Screenshots of the problem. Paste them anywhere on this page, drop them here or pick files. Agents open them before they start.{github.attach ? " They go up with the issue and show in it on GitHub." : ` To show them in the issue on GitHub, update the GitHub CLI to 2.99 or later${github.version ? ` (you have ${github.version})` : ""}; until then they stay in Factory.`}</span>
		<div onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop} className={cn("rounded-md border border-dashed p-2", over && "border-ring bg-accent/40")}>
			{images.list.length > 0 && <div className="mb-2 grid grid-cols-4 gap-2">
				{images.list.map((image, index) => <figure key={image.id} className="group relative min-w-0">
					<img src={image.url} alt={image.file.name} className="aspect-[16/10] w-full rounded-md border bg-muted object-cover object-top" />
					<figcaption className="mt-1 truncate font-mono text-2xs text-muted-foreground">image-{index + 1}.{IMAGE_TYPES[image.file.type]}</figcaption>
					<button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => images.remove(image.id)} className="absolute top-1 right-1 grid size-6 place-items-center rounded-[4px] bg-background/90 text-muted-foreground opacity-0 shadow-sm group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"><X className="size-3.5" /></button>
				</figure>)}
			</div>}
			<button type="button" onClick={() => input.current?.click()} className="flex h-9 w-full items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground">
				<ImagePlus className="size-4" />{images.list.length ? "Add more" : "Add images"}<span className="text-xs text-muted-foreground/70">PNG, JPEG, GIF or WebP, up to 10 MB each</span>
			</button>
			<input ref={input} type="file" accept={Object.keys(IMAGE_TYPES).join(",")} multiple hidden onChange={(event) => {
				if (event.target.files) images.add(event.target.files);
				event.target.value = "";
			}} />
		</div>
	</div>;
}

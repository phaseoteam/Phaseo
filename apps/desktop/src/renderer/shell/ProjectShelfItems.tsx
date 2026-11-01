import { Archive, ArchiveRestore, Pin, PinOff } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { CommandGroup, CommandItem } from "../components/ui/command";
import { ProjectIcon } from "../components/ProjectIcon";
import type { Project } from "../../shared/workspace";

/** The palette's project commands: pin, unpin or archive the open chat's project, and unarchive any archived one (T3's "project unarchive"). */
export function ProjectShelfItems({ project, projects, run }: { project?: Project; projects: readonly Project[]; run: (action: () => void) => void }) {
	const { command } = useWorkspace();
	const source = project?.worktree ? projects.find(value => value.id === project.worktree!.sourceProjectId) : project;
	const archived = projects.filter(value => !value.worktree && value.archived);
	if (!source && !archived.length) return null;
	const organize = (id: string, change: { pinned?: boolean; archived?: boolean }) => run(() => void command({ type: "organize-project", id, ...change }));
	return <CommandGroup heading="Projects">
		{source && !source.archived && <CommandItem value={`${source.pinned ? "Unpin" : "Pin"} project ${source.name}`} onSelect={() => organize(source.id, { pinned: !source.pinned })}>{source.pinned ? <PinOff /> : <Pin />}{source.pinned ? "Unpin" : "Pin"} project {source.name}</CommandItem>}
		{source && !source.archived && <CommandItem value={`Archive project ${source.name} hide`} onSelect={() => organize(source.id, { archived: true })}><Archive />Archive project {source.name}</CommandItem>}
		{archived.map(value => <CommandItem key={value.id} value={`Unarchive project ${value.name} restore archived`} onSelect={() => organize(value.id, { archived: false })}><ArchiveRestore /><ProjectIcon project={value} />Unarchive project {value.name}</CommandItem>)}
	</CommandGroup>;
}

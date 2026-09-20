"use client";
import { PrivateSettingsQuery, useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import * as React from "react";
import { BarChart3, Briefcase, Code2, FlaskConical, Globe2, GraduationCap, Handshake, Headphones, HeartPulse, Landmark, Megaphone, Palette, Scale, ShieldCheck, ShoppingBag, Truck, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Member = { user_id: string; display_name?: string | null; role?: string | null };
type DemoMember = Member & { department: string; source: string; status: string; directoryDepartment?: string | null; roleOverride?: string | null; departmentOverrideEnabled?: boolean };
type DepartmentColor = "blue" | "emerald" | "amber" | "rose" | "violet" | "slate" | "cyan" | "teal" | "lime" | "yellow" | "orange" | "red" | "pink" | "fuchsia" | "indigo" | "sky" | "green" | "purple";
type DepartmentIcon = "users" | "briefcase" | "megaphone" | "code" | "palette" | "headphones" | "landmark" | "scale" | "heart-pulse" | "globe" | "flask" | "graduation-cap" | "shield-check" | "shopping-bag" | "wrench" | "truck" | "handshake" | "chart";
type Department = { id?: string; name: string; members: number; source: string; lead: string; color: DepartmentColor; icon: DepartmentIcon };
type DirectoryPayload = { departments: Array<{ id: string; name: string; icon: DepartmentIcon; color: DepartmentColor; source_type: string; directory_name?: string | null }>; members: Array<{ userId: string; displayName: string; effectiveRole: string; accessSource: string; department: { id: string; name: string } | null; departmentSource: string; directoryDepartment: string | null; roleOverride: string | null; departmentOverrideEnabled: boolean; status: string }> };

const colorStyles: Record<DepartmentColor, string> = {
	blue: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300",
	emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
	amber: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	rose: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300",
	violet: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300",
	slate: "border-border bg-muted/45 text-muted-foreground",
	cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
	teal: "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300",
	lime: "border-lime-500/25 bg-lime-500/10 text-lime-700 dark:text-lime-300",
	yellow: "border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
	orange: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
	red: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
	pink: "border-pink-500/25 bg-pink-500/10 text-pink-700 dark:text-pink-300",
	fuchsia: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
	indigo: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
	sky: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	green: "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300",
	purple: "border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300",
};
const iconOptions: Array<{ value: DepartmentIcon; label: string; icon: typeof Users }> = [
	{ value: "users", label: "People", icon: Users }, { value: "briefcase", label: "Briefcase", icon: Briefcase },
	{ value: "megaphone", label: "Megaphone", icon: Megaphone }, { value: "code", label: "Code", icon: Code2 },
	{ value: "palette", label: "Palette", icon: Palette }, { value: "headphones", label: "Headphones", icon: Headphones },
	{ value: "landmark", label: "Finance", icon: Landmark }, { value: "scale", label: "Legal", icon: Scale },
	{ value: "heart-pulse", label: "Healthcare", icon: HeartPulse }, { value: "globe", label: "Global", icon: Globe2 },
	{ value: "flask", label: "Research", icon: FlaskConical }, { value: "graduation-cap", label: "Education", icon: GraduationCap },
	{ value: "shield-check", label: "Security", icon: ShieldCheck }, { value: "shopping-bag", label: "Sales", icon: ShoppingBag },
	{ value: "wrench", label: "IT & operations", icon: Wrench }, { value: "truck", label: "Logistics", icon: Truck },
	{ value: "handshake", label: "Partnerships", icon: Handshake }, { value: "chart", label: "Analytics", icon: BarChart3 },
];
const icons = Object.fromEntries(iconOptions.map((option) => [option.value, option.icon])) as Record<DepartmentIcon, typeof Users>;
function DepartmentMark({ department }: { department: Department }) {
	const Icon = icons[department.icon];
	return <span className={`inline-flex size-8 items-center justify-center rounded-lg border ${colorStyles[department.color]}`}><Icon className="size-4" /></span>;
}

function RoleSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
	return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="h-8 w-fit min-w-28 rounded-md border-border bg-input/50 px-3 text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="directory">Follow directory</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="member">Member</SelectItem></SelectContent></Select>;
}

function DepartmentSelect({ value, departments, onChange, disabled }: { value: string; departments: Department[]; onChange: (value: string) => void; disabled: boolean }) {
	const department = departments.find((item) => item.name === value);
	const Icon = department ? icons[department.icon] : Users;
	return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className={`h-8 w-fit min-w-36 rounded-md px-3 ${department ? colorStyles[department.color] : colorStyles.slate}`}><Icon className="size-3.5" /><SelectValue /></SelectTrigger><SelectContent className="min-w-48"><SelectItem value="Follow directory"><span className="inline-flex size-5 items-center justify-center rounded-md border border-border bg-muted/45"><Users className="size-3" /></span>Follow directory</SelectItem>{departments.map((item) => { const ItemIcon = icons[item.icon]; return <SelectItem key={item.name} value={item.name}><span className={`inline-flex size-5 items-center justify-center rounded-md border ${colorStyles[item.color]}`}><ItemIcon className="size-3" /></span>{item.name}</SelectItem>; })}<SelectItem value="No department"><span className="inline-flex size-5 rounded-md border border-dashed border-border" />No department</SelectItem></SelectContent></Select>;
}

type DirectoryProps = { mode: "directory" | "departments"; workspaceId: string; members: Member[]; currentUserId: string | null; canEdit: boolean };
export default function WorkspaceEnterpriseDirectory(props: DirectoryProps) {
	return <PrivateSettingsQuery<DirectoryPayload> path="/api/enterprise/directory" workspaceId={props.workspaceId}>{(initialDirectory) => <DirectoryContent {...props} initialDirectory={initialDirectory} />}</PrivateSettingsQuery>;
}

function DirectoryContent({ mode, workspaceId, members, currentUserId, canEdit, initialDirectory }: DirectoryProps & { initialDirectory: DirectoryPayload }) {
	const loadDirectory = useInvalidatePrivateSettings();
	const [directoryMembers, setDirectoryMembers] = React.useState<DemoMember[]>(members.map((member) => ({ ...member, department: "No department", source: "Workspace", status: "Active" })));
	const [departments, setDepartments] = React.useState<Department[]>([]);
	const [createOpen, setCreateOpen] = React.useState(false);
	const [newDepartmentName, setNewDepartmentName] = React.useState("");
	const [isSaving, setIsSaving] = React.useState(false);
	const visibleMembers = directoryMembers;

	React.useEffect(() => {
		const payload = initialDirectory;
		const counts = new Map<string, number>();
		for (const member of payload.members) if (member.department?.id) counts.set(member.department.id, (counts.get(member.department.id) ?? 0) + 1);
		setDepartments(payload.departments.map((department) => ({ id: department.id, name: department.name, icon: department.icon, color: department.color, source: department.source_type === "scim_group" ? `SCIM · ${department.directory_name ?? department.name}` : "Manual", members: counts.get(department.id) ?? 0, lead: "—" })));
		setDirectoryMembers(payload.members.map((member) => ({ user_id: member.userId, display_name: member.displayName, role: member.effectiveRole, department: member.department?.name ?? "No department", source: member.departmentSource === "manual_override" || member.accessSource === "manual_override" ? "Manual override" : member.accessSource === "scim" || member.departmentSource === "scim_group" ? "SCIM" : "Workspace", status: member.status === "suspended" ? "Suspended" : "Active", directoryDepartment: member.directoryDepartment, roleOverride: member.roleOverride, departmentOverrideEnabled: member.departmentOverrideEnabled })));
	}, [initialDirectory]);

	async function postDirectory(body: Record<string, unknown>) {
		const response = await fetch(`/api/enterprise/directory?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Update failed");
	}
	function updateDepartment(name: string, patch: Partial<Department>) {
		setDepartments((current) => current.map((department) => department.name === name ? { ...department, ...patch } : department));
		const current = departments.find((department) => department.name === name);
		if (!current?.id) return;
		void postDirectory({ action: "update_department", departmentId: current.id, name: patch.name ?? current.name, icon: patch.icon ?? current.icon, color: patch.color ?? current.color }).then(loadDirectory).catch((error) => { toast.error(error.message); return loadDirectory(); });
	}
	function updateMember(userId: string, field: "role" | "department", value: string) {
		const member = directoryMembers.find((candidate) => candidate.user_id === userId);
		if (!member) return;
		const selectedDepartment = departments.find((department) => department.name === (field === "department" ? value : member.department));
		const departmentMode = field === "department" ? value === "Follow directory" ? "directory" : value === "No department" ? "none" : "department" : member.departmentOverrideEnabled ? member.department === "No department" ? "none" : "department" : "directory";
		void postDirectory({ action: "update_member", userId, accessRole: field === "role" ? value : member.roleOverride ?? "directory", departmentMode, departmentId: selectedDepartment?.id ?? null }).then(loadDirectory).catch((error) => { toast.error(error.message); return loadDirectory(); });
	}
	async function createDepartment() {
		if (!newDepartmentName.trim()) return;
		setIsSaving(true);
		try {
			await postDirectory({ action: "create_department", name: newDepartmentName.trim(), icon: "users", color: "blue" });
			await loadDirectory();
			setNewDepartmentName(""); setCreateOpen(false); toast.success("Department created");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Department could not be created"); }
		finally { setIsSaving(false); }
	}

	if (mode === "departments") return <section className="space-y-4">
		<div className="flex justify-end"><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger render={<Button size="sm" disabled={!canEdit}>Create department</Button>} /><DialogContent><DialogHeader><DialogTitle>Create department</DialogTitle><DialogDescription>Add a manually managed department. SCIM-provisioned departments appear automatically.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="department-name">Name</Label><Input id="department-name" value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} maxLength={100} placeholder="Engineering" /></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={() => void createDepartment()} disabled={isSaving || !newDepartmentName.trim()}>{isSaving ? "Creating…" : "Create"}</Button></DialogFooter></DialogContent></Dialog></div>
		<div className="divide-y divide-border/60 border-y border-border/60">
			{departments.map((department) => {
				const selectedOption = iconOptions.find((option) => option.value === department.icon) ?? iconOptions[0]!;
				const SelectedIcon = selectedOption.icon;
				return <div key={department.name} className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_10rem_11rem_8rem] md:items-center">
					<div className="flex min-w-0 items-center gap-3"><DepartmentMark department={department} /><div className="min-w-0"><p className="truncate text-sm font-medium">{department.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{department.source}</p></div></div>
					<Select value={department.icon} onValueChange={(value) => updateDepartment(department.name, { icon: value as DepartmentIcon })} disabled={!canEdit}>
						<SelectTrigger className="h-8 w-full rounded-md"><span className="flex min-w-0 flex-1 items-center gap-2"><span className="flex size-4 shrink-0 items-center justify-center"><SelectedIcon className="size-3.5 text-muted-foreground" /></span><span className="truncate text-left leading-none">{selectedOption.label}</span></span></SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false} className="min-w-52">{iconOptions.map((option) => { const Icon = option.icon; return <SelectItem key={option.value} value={option.value} className="min-h-8"><span className="flex min-w-0 flex-1 items-center gap-2"><span className="flex size-4 shrink-0 items-center justify-center"><Icon className="size-4 text-muted-foreground" /></span><span className="leading-none">{option.label}</span></span></SelectItem>; })}</SelectContent>
					</Select>
					<Select value={department.color} onValueChange={(value) => updateDepartment(department.name, { color: value as DepartmentColor })} disabled={!canEdit}>
						<SelectTrigger className={`h-8 w-full rounded-md ${colorStyles[department.color]}`}><span className="flex min-w-0 flex-1 items-center gap-2"><span className={`block size-3 shrink-0 rounded-full border ${colorStyles[department.color]}`} /><span className="truncate text-left leading-none capitalize">{department.color}</span></span></SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false}>{(Object.keys(colorStyles) as DepartmentColor[]).map((color) => <SelectItem key={color} value={color} className="min-h-8"><span className="flex min-w-0 flex-1 items-center gap-2"><span className={`block size-3 shrink-0 rounded-full border ${colorStyles[color]}`} /><span className="leading-none capitalize">{color}</span></span></SelectItem>)}</SelectContent>
					</Select>
					<div className="text-sm"><span className="text-muted-foreground">{department.members} member{department.members === 1 ? "" : "s"}</span><p className="mt-0.5 text-xs text-muted-foreground">Lead: {department.lead}</p></div>
				</div>;
			})}
		</div>
		<p className="text-xs text-muted-foreground">Renaming or styling a department does not remove its SCIM group mapping.</p>
	</section>;

	return <section className="space-y-5">
		<div className="border-y border-border/60"><div className="hidden grid-cols-[minmax(0,1fr)_8rem_12rem] gap-4 border-b border-border/60 py-2 text-xs text-muted-foreground sm:grid"><span>Member</span><span>Access</span><span>Department</span></div><div className="divide-y divide-border/60">{visibleMembers.map((member) => { const editable = canEdit && member.role !== "owner"; const departmentValue = !member.departmentOverrideEnabled ? "Follow directory" : member.department; return <div key={member.user_id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_12rem] sm:items-center sm:gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{member.display_name ?? member.user_id}</p><p className="mt-1 truncate text-xs text-muted-foreground">{member.user_id === currentUserId ? "You · " : ""}{member.source} · {member.status}</p></div><div>{member.role === "owner" ? <Badge variant="outline">Owner</Badge> : <RoleSelect value={member.roleOverride ?? "directory"} onChange={(value) => updateMember(member.user_id, "role", value)} disabled={!editable} />}</div><div>{member.role === "owner" ? <span className="text-sm text-muted-foreground">{member.department}</span> : <DepartmentSelect value={departmentValue} departments={departments} onChange={(value) => updateMember(member.user_id, "department", value)} disabled={!editable} />}</div></div>; })}</div></div>
		<p className="text-xs text-muted-foreground">A manual selection overrides the effective value while retaining the latest directory assignment underneath.</p>
	</section>;
}

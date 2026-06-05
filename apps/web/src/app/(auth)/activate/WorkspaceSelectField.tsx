"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Workspace = {
	id: string;
	name: string;
	role: string;
};

export function WorkspaceSelectField({
	workspaces,
}: {
	workspaces: Workspace[];
}) {
	const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");

	return (
		<div className="space-y-2">
			<input type="hidden" name="workspace_id" value={workspaceId} />
			<Label htmlFor="workspace_id">Workspace</Label>
			<Select value={workspaceId} onValueChange={setWorkspaceId}>
				<SelectTrigger id="workspace_id">
					<SelectValue placeholder="Choose a workspace" />
				</SelectTrigger>
				<SelectContent>
					{workspaces.map((workspace) => (
						<SelectItem key={workspace.id} value={workspace.id}>
							{workspace.name} ({workspace.role})
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

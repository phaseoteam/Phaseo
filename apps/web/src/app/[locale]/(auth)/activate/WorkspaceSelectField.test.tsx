import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { WorkspaceSelectField } from "./WorkspaceSelectField";

const mockSelectProps: Array<Record<string, unknown>> = [];

jest.mock("next-intl", () => ({
	useTranslations: () => (key: string) =>
		({
			workspace: "Workspace",
			chooseWorkspace: "Choose a workspace",
		})[key as "workspace" | "chooseWorkspace"] ?? key,
}));

jest.mock("@/components/ui/select", () => ({
	Select: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		mockSelectProps.push(props);
		return <div>{children}</div>;
	},
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectValue: ({ placeholder }: { placeholder?: string }) =>
		placeholder ? <span>{placeholder}</span> : null,
}));

describe("WorkspaceSelectField", () => {
	beforeEach(() => mockSelectProps.splice(0));

	it("maps workspace names to the selected-value labels while retaining IDs as values", () => {
		const html = renderToStaticMarkup(
			<WorkspaceSelectField
				workspaces={[
					{ id: "workspace-uuid", name: "Acme Platform", role: "owner" },
				]}
			/>,
		);

		expect(mockSelectProps[0]).toMatchObject({
			items: [{ value: "workspace-uuid", label: "Acme Platform (owner)" }],
			value: "workspace-uuid",
		});
		expect(html).toContain('name="workspace_id"');
		expect(html).toContain('value="workspace-uuid"');
		expect(html).toContain("Choose a workspace");
		expect(html).toContain("Acme Platform (owner)");
	});
});
